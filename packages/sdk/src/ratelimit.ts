/**
 * Client-side rate limiting matched to the documented gateway limits (authentication.md):
 * 1200 req/60s per API key (and per IP), 6000/60s per user, and 5 RPS per endpoint by default.
 *
 * Each limit is a token bucket implemented with GCRA (virtual scheduling): every caller reserves the
 * next slot, so concurrent callers queue fairly without a timer loop. `TokenBucket.forLimit` picks
 * capacity/refill so that no half-open window of `windowMs` ever sees more than `limit`
 * acquisitions, whatever the server's window alignment (fixed or sliding).
 */

export type Clock = () => number;
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export const monotonicNow: Clock = () => performance.now();

export const realSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    if (ms <= 0) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export interface BucketSpec {
  /** Max acquisitions per window. */
  limit: number;
  windowMs: number;
  /** Burst capacity (tokens available at once). Default 1 = evenly spaced. */
  burst?: number;
}

export class TokenBucket {
  readonly intervalMs: number;
  readonly toleranceMs: number;
  /** Theoretical arrival time of the next conforming request. */
  private tat = Number.NEGATIVE_INFINITY;

  constructor(
    readonly capacity: number,
    readonly refillPerSec: number,
    private readonly now: Clock = monotonicNow,
  ) {
    if (!(capacity >= 1)) throw new RangeError("capacity must be >= 1");
    if (!(refillPerSec > 0)) throw new RangeError("refillPerSec must be > 0");
    this.intervalMs = 1000 / refillPerSec;
    this.toleranceMs = this.intervalMs * (capacity - 1);
  }

  /** Bucket guaranteeing ≤ `limit` acquisitions in any half-open window of `windowMs`. */
  static forLimit({ limit, windowMs, burst = 1 }: BucketSpec, now?: Clock): TokenBucket {
    if (!(limit >= 1) || !(windowMs > 0)) throw new RangeError("limit must be >= 1 and windowMs > 0");
    const capacity = Math.max(1, Math.min(Math.floor(burst), limit));
    // capacity + rate*window - 1 <= limit  =>  rate = (limit - capacity + 1) / window. The guarantee is
    // tight at the window boundary, so shave 1e-9 off the rate to stay clear of float rounding.
    return new TokenBucket(capacity, ((limit - capacity + 1) / windowMs) * 1000 * (1 - 1e-9), now);
  }

  /** Reserve one token. Returns how long the caller must wait before sending (0 = now). */
  reserve(): number {
    const t = this.now();
    const tat = Math.max(this.tat, t);
    this.tat = tat + this.intervalMs;
    return Math.max(0, tat - this.toleranceMs - t);
  }

  /** Wait that a reservation made now would incur, without reserving. */
  peek(): number {
    const t = this.now();
    return Math.max(0, Math.max(this.tat, t) - this.toleranceMs - t);
  }

  /** Tokens available right now (0..capacity). */
  available(): number {
    const t = this.now();
    const tat = Math.max(this.tat, t);
    return Math.max(0, Math.min(this.capacity, Math.floor((t + this.toleranceMs - tat) / this.intervalMs) + 1));
  }

  /** Block all acquisitions for `ms` and restart with an empty bucket (used for Retry-After). */
  pause(ms: number): void {
    if (!(ms > 0)) return;
    this.tat = Math.max(this.tat, this.now() + ms + this.toleranceMs);
  }
}

export interface RateLimitConfig {
  /** Per-API-key budget; `false` disables. Default 1200 / 60 s, burst 20. */
  perKey?: BucketSpec | false;
  /** Default per-endpoint budget. Default 5 / 1 s, burst 1 (5 RPS). */
  perEndpoint?: BucketSpec | false;
  /** Overrides keyed by endpoint id (e.g. "rwa.price") — the docs say limits can differ per endpoint. */
  endpointOverrides?: Readonly<Record<string, BucketSpec>>;
}

export const DEFAULT_KEY_LIMIT: BucketSpec = { limit: 1200, windowMs: 60_000, burst: 20 };
export const DEFAULT_ENDPOINT_LIMIT: BucketSpec = { limit: 5, windowMs: 1_000, burst: 1 };

export class RateLimiter {
  private readonly key: TokenBucket | null;
  private readonly endpoints = new Map<string, TokenBucket>();

  constructor(
    private readonly config: RateLimitConfig = {},
    private readonly now: Clock = monotonicNow,
    private readonly sleep: Sleep = realSleep,
  ) {
    const keySpec = config.perKey === undefined ? DEFAULT_KEY_LIMIT : config.perKey;
    this.key = keySpec ? TokenBucket.forLimit(keySpec, now) : null;
  }

  private bucket(endpointId: string): TokenBucket | null {
    let b = this.endpoints.get(endpointId);
    if (!b) {
      const spec = this.config.endpointOverrides?.[endpointId] ?? (this.config.perEndpoint === undefined ? DEFAULT_ENDPOINT_LIMIT : this.config.perEndpoint);
      if (!spec) return null;
      b = TokenBucket.forLimit(spec, this.now);
      this.endpoints.set(endpointId, b);
    }
    return b;
  }

  /** Wait for both the endpoint and the key budget. Returns total ms waited. */
  async acquire(endpointId: string, signal?: AbortSignal): Promise<number> {
    let waited = 0;
    const e = this.bucket(endpointId);
    if (e) {
      const w = e.reserve();
      if (w > 0) await this.sleep(w, signal);
      waited += w;
    }
    if (this.key) {
      const w = this.key.reserve();
      if (w > 0) await this.sleep(w, signal);
      waited += w;
    }
    return waited;
  }

  /**
   * Back off after a 429. The response doesn't say which dimension tripped, so the endpoint bucket
   * always pauses; the key bucket pauses too when the gateway reports the key budget exhausted.
   */
  penalize(endpointId: string, ms: number, keyExhausted: boolean): void {
    this.bucket(endpointId)?.pause(ms);
    if (keyExhausted) this.key?.pause(ms);
  }
}
