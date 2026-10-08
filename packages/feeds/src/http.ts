/**
 * Minimal resilient HTTP for public market-data sources: timeouts, bounded retries with
 * jittered backoff, Retry-After support, and a per-host spacing limiter so one noisy feed
 * can't get the whole collector rate-limited.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

const lastCallByHost = new Map<string, number>();
const minSpacingMs = new Map<string, number>();

/** Enforce a minimum interval between calls to the same host. */
export function setHostSpacing(host: string, ms: number): void {
  minSpacingMs.set(host, ms);
}

async function spaceFor(host: string): Promise<void> {
  const spacing = minSpacingMs.get(host) ?? 0;
  if (!spacing) return;
  const now = Date.now();
  const next = Math.max(now, (lastCallByHost.get(host) ?? 0) + spacing);
  lastCallByHost.set(host, next);
  if (next > now) await new Promise((r) => setTimeout(r, next - now));
}

export interface GetOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export async function getJson<T = unknown>(url: string, opts: GetOptions = {}): Promise<T> {
  const { timeoutMs = 15_000, retries = 3, headers = {} } = opts;
  const host = new URL(url).host;
  let attempt = 0;
  for (;;) {
    await spaceFor(host);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Nightshift collector)", accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      const body = await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) throw new HttpError(res.status, url, body);
      const retryAfter = Number(res.headers.get("retry-after"));
      await backoff(attempt++, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (attempt >= retries) throw err;
      await backoff(attempt++);
    }
  }
}

function backoff(attempt: number, floorMs?: number): Promise<void> {
  const ms = Math.max(floorMs ?? 0, Math.min(30_000, 500 * 2 ** attempt) * (0.5 + Math.random()));
  return new Promise((r) => setTimeout(r, ms));
}
