/**
 * Server-time estimation for X-OC-TIMESTAMP. The gateway rejects requests outside `recv_window`
 * (default ±5 s) with 40103, so a drifting host clock silently breaks every call.
 *
 * Every response is a free time sample: the documented body `timestamp` (ms precision, present on
 * success *and* error envelopes, including the 40103 itself) and the HTTP `Date` header (1 s
 * precision). Offsets are estimated NTP-style at the request/response midpoint; a sample replaces
 * the current estimate when it is tighter (lower RTT-bound uncertainty) or the estimate is stale.
 */
import type { Clock } from "./ratelimit.ts";

export interface ClockSample {
  /** Local wall-clock ms when the request was sent. */
  sentAt: number;
  /** Local wall-clock ms when the response arrived. */
  receivedAt: number;
  /** Server time (ms). For a `Date` header this is the floored second. */
  serverMs: number;
  /** Resolution of `serverMs`: 1 for body timestamps, 1000 for the Date header. */
  precisionMs: number;
}

export class ServerClock {
  private offset = 0;
  private uncertainty = Number.POSITIVE_INFINITY;
  private sampledAt = Number.NEGATIVE_INFINITY;
  samples = 0;

  constructor(
    private readonly localNow: Clock = Date.now,
    private readonly maxSampleAgeMs = 5 * 60_000,
  ) {}

  /** Best estimate of server time, in epoch ms. */
  now(): number {
    return this.localNow() + this.offset;
  }

  get offsetMs(): number {
    return this.offset;
  }

  get synced(): boolean {
    return this.samples > 0;
  }

  observe(s: ClockSample): boolean {
    if (!Number.isFinite(s.serverMs) || s.serverMs <= 0 || s.receivedAt < s.sentAt) return false;
    const rtt = s.receivedAt - s.sentAt;
    const uncertainty = rtt / 2 + s.precisionMs / 2;
    const stale = s.receivedAt - this.sampledAt > this.maxSampleAgeMs;
    if (!stale && uncertainty > this.uncertainty) return false;
    this.adopt(s, uncertainty);
    return true;
  }

  /** Adopt a sample unconditionally (used right after a 40103 "timestamp expired"). */
  resync(s: ClockSample): void {
    if (!Number.isFinite(s.serverMs) || s.serverMs <= 0) return;
    this.adopt(s, (s.receivedAt - s.sentAt) / 2 + s.precisionMs / 2);
  }

  private adopt(s: ClockSample, uncertainty: number): void {
    const midpoint = s.sentAt + (s.receivedAt - s.sentAt) / 2;
    this.offset = Math.round(s.serverMs + s.precisionMs / 2 - midpoint);
    this.uncertainty = uncertainty;
    this.sampledAt = s.receivedAt;
    this.samples++;
  }
}

/** Extract time samples from a response: body `timestamp` first, then the `Date` header. */
export function sampleFromResponse(
  sentAt: number,
  receivedAt: number,
  body: unknown,
  dateHeader: string | null,
): ClockSample | null {
  const ts = body && typeof body === "object" ? (body as { timestamp?: unknown }).timestamp : undefined;
  if (typeof ts === "number" && Number.isFinite(ts) && ts > 1e12) return { sentAt, receivedAt, serverMs: ts, precisionMs: 1 };
  if (dateHeader) {
    const d = Date.parse(dateHeader);
    if (!Number.isNaN(d)) return { sentAt, receivedAt, serverMs: d, precisionMs: 1000 };
  }
  return null;
}
