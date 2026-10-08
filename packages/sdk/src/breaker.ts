/**
 * Per-endpoint circuit breaker. Only *availability* failures count (network errors, timeouts,
 * HTTP 5xx, envelope 50000/50001-class codes); business errors such as 40367 (market closed) mean
 * the service is healthy and close the circuit like a success.
 *
 * closed --N consecutive failures--> open --cooldown--> half_open --trial ok--> closed
 *                                      ^------------- trial failed (cooldown doubles, capped) --+
 */
import { type Clock, monotonicNow } from "./ratelimit.ts";

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerOptions {
  failureThreshold?: number;
  openMs?: number;
  maxOpenMs?: number;
}

export type BreakerDecision = { ok: true } | { ok: false; retryInMs: number };

export class CircuitBreaker {
  state: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private currentOpenMs: number;
  private trialInFlight = false;
  readonly failureThreshold: number;
  readonly openMs: number;
  readonly maxOpenMs: number;

  constructor(opts: BreakerOptions = {}, private readonly now: Clock = monotonicNow) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.openMs = opts.openMs ?? 15_000;
    this.maxOpenMs = opts.maxOpenMs ?? 120_000;
    this.currentOpenMs = this.openMs;
  }

  /** Ask before each attempt. In half-open state exactly one trial request is let through. */
  check(): BreakerDecision {
    if (this.state === "open") {
      const elapsed = this.now() - this.openedAt;
      if (elapsed < this.currentOpenMs) return { ok: false, retryInMs: Math.ceil(this.currentOpenMs - elapsed) };
      this.state = "half_open";
      this.trialInFlight = false;
    }
    if (this.state === "half_open") {
      if (this.trialInFlight) return { ok: false, retryInMs: Math.ceil(this.currentOpenMs / 4) };
      this.trialInFlight = true;
    }
    return { ok: true };
  }

  onSuccess(): void {
    this.failures = 0;
    this.trialInFlight = false;
    if (this.state !== "closed") {
      this.state = "closed";
      this.currentOpenMs = this.openMs;
    }
  }

  onFailure(): void {
    if (this.state === "half_open") {
      this.trip(Math.min(this.maxOpenMs, this.currentOpenMs * 2));
      return;
    }
    this.failures++;
    if (this.state === "closed" && this.failures >= this.failureThreshold) this.trip(this.currentOpenMs);
  }

  /** The attempt ended without telling us anything about health (e.g. caller aborted). */
  onNeutral(): void {
    this.trialInFlight = false;
  }

  private trip(openMs: number): void {
    this.state = "open";
    this.openedAt = this.now();
    this.currentOpenMs = openMs;
    this.trialInFlight = false;
    this.failures = 0;
  }
}

export class BreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  constructor(
    private readonly opts: BreakerOptions = {},
    private readonly now: Clock = monotonicNow,
  ) {}

  get(endpointId: string): CircuitBreaker {
    let b = this.breakers.get(endpointId);
    if (!b) {
      b = new CircuitBreaker(this.opts, this.now);
      this.breakers.set(endpointId, b);
    }
    return b;
  }

  states(): Record<string, BreakerState> {
    return Object.fromEntries([...this.breakers].map(([k, b]) => [k, b.state]));
  }
}
