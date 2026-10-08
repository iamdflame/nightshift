/** Backoff and Retry-After helpers. */

export interface RetryPolicy {
  /** Retries after the first attempt. */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxRetries: 3, baseDelayMs: 300, maxDelayMs: 10_000 };

/** Exponential backoff with "equal jitter": uniform in [cap/2, cap], cap = min(max, base·2^attempt). */
export function backoffDelay(attempt: number, policy: RetryPolicy = DEFAULT_RETRY, random: () => number = Math.random): number {
  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt));
  return Math.round(cap / 2 + random() * (cap / 2));
}

/** Parse `Retry-After` (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!value) return null;
  const s = value.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number.parseFloat(s) * 1000);
  const at = Date.parse(s);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}
