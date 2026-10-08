import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./breaker.ts";
import { ServerClock, sampleFromResponse } from "./clock.ts";
import { DEFAULT_ENDPOINT_LIMIT, DEFAULT_KEY_LIMIT, RateLimiter, TokenBucket } from "./ratelimit.ts";
import { backoffDelay, parseRetryAfter } from "./retry.ts";

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms), set: (v: number) => (t = v) };
}

/** Send times produced by `n` callers all arriving at `arrivals[i]`. */
function schedule(bucket: TokenBucket, clock: ReturnType<typeof fakeClock>, arrivals: number[]): number[] {
  return arrivals.map((at) => {
    clock.set(at);
    return at + bucket.reserve();
  });
}

function maxInAnyWindow(times: number[], windowMs: number): number {
  const s = [...times].sort((a, b) => a - b);
  let max = 0;
  for (let i = 0, j = 0; i < s.length; i++) {
    while (s[i]! - s[j]! >= windowMs) j++;
    max = Math.max(max, i - j + 1);
  }
  return max;
}

describe("TokenBucket (GCRA)", () => {
  it("spaces requests at the refill rate when capacity is 1 (5 RPS)", () => {
    const clock = fakeClock();
    const b = new TokenBucket(1, 5, clock.now);
    expect(schedule(b, clock, [0, 0, 0, 0, 0, 0])).toEqual([0, 200, 400, 600, 800, 1000]);
  });

  it("allows a burst up to capacity, then refills", () => {
    const clock = fakeClock();
    const b = new TokenBucket(3, 10, clock.now);
    expect(schedule(b, clock, [0, 0, 0, 0, 0])).toEqual([0, 0, 0, 100, 200]);
    clock.set(10_000);
    expect(b.available()).toBe(3);
  });

  it("queues concurrent callers fairly through reservations", () => {
    const clock = fakeClock();
    const b = new TokenBucket(1, 2, clock.now);
    const waits = [b.reserve(), b.reserve(), b.reserve()];
    expect(waits).toEqual([0, 500, 1000]);
  });

  it.each([
    ["per-endpoint 5/1s", DEFAULT_ENDPOINT_LIMIT],
    ["per-key 1200/60s burst 20", DEFAULT_KEY_LIMIT],
    ["burst-heavy 10/1s burst 10", { limit: 10, windowMs: 1_000, burst: 10 }],
  ] as const)("forLimit never exceeds the limit in any window (%s)", (_, spec) => {
    const clock = fakeClock();
    const b = TokenBucket.forLimit(spec, clock.now);
    // Adversarial arrivals: a thundering herd, then random stragglers.
    let x = 7;
    const rand = () => ((x = (x * 48271) % 2147483647) / 2147483647);
    const arrivals = [...Array(spec.limit * 2).fill(0), ...Array.from({ length: spec.limit }, () => Math.floor(rand() * spec.windowMs * 3))].sort((a, b) => a - b);
    const sends = schedule(b, clock, arrivals);
    expect(maxInAnyWindow(sends, spec.windowMs)).toBeLessThanOrEqual(spec.limit);
  });

  it("pause() blocks for Retry-After then resumes with an empty bucket", () => {
    const clock = fakeClock();
    const b = new TokenBucket(5, 5, clock.now);
    b.pause(2_000);
    expect(b.reserve()).toBe(2_000);
    expect(b.reserve()).toBe(2_200);
  });
});

describe("RateLimiter", () => {
  it("waits on the endpoint bucket and the key bucket, per endpoint", async () => {
    const clock = fakeClock();
    const slept: number[] = [];
    const sleep = async (ms: number) => {
      slept.push(ms);
      clock.advance(ms);
    };
    const rl = new RateLimiter({ perKey: { limit: 3, windowMs: 1_000, burst: 3 }, perEndpoint: { limit: 2, windowMs: 1_000 } }, clock.now, sleep);
    await rl.acquire("a"); // a#1
    await rl.acquire("b"); // b#1
    await rl.acquire("a"); // a#2: endpoint spacing 500ms
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeCloseTo(500, 3);
    await rl.acquire("b"); // key budget (3/s) exhausted → waits for key refill
    expect(slept.length).toBe(2);
  });

  it("penalize() pauses the endpoint, and the key only when the key budget is exhausted", async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({}, clock.now, async (ms) => void clock.advance(ms));
    rl.penalize("x", 3_000, false);
    expect(await rl.acquire("x")).toBe(3_000);
    expect(await rl.acquire("y")).toBe(0);
    rl.penalize("y", 1_000, true);
    expect(await rl.acquire("z")).toBeGreaterThanOrEqual(1_000);
  });
});

describe("CircuitBreaker", () => {
  it("opens after N consecutive failures, fails fast, then half-opens for one trial", () => {
    const clock = fakeClock();
    const br = new CircuitBreaker({ failureThreshold: 3, openMs: 1_000 }, clock.now);
    br.onFailure();
    br.onFailure();
    expect(br.check()).toEqual({ ok: true });
    br.onFailure();
    expect(br.state).toBe("open");
    expect(br.check()).toEqual({ ok: false, retryInMs: 1_000 });
    clock.advance(1_000);
    expect(br.check()).toEqual({ ok: true }); // trial
    expect(br.state).toBe("half_open");
    expect(br.check().ok).toBe(false); // only one trial at a time
    br.onSuccess();
    expect(br.state).toBe("closed");
  });

  it("a failed trial re-opens with a doubled (capped) cooldown", () => {
    const clock = fakeClock();
    const br = new CircuitBreaker({ failureThreshold: 1, openMs: 1_000, maxOpenMs: 1_500 }, clock.now);
    br.onFailure();
    clock.advance(1_000);
    br.check();
    br.onFailure();
    expect(br.state).toBe("open");
    expect(br.check()).toEqual({ ok: false, retryInMs: 1_500 });
  });

  it("successes reset the consecutive-failure count", () => {
    const br = new CircuitBreaker({ failureThreshold: 2 });
    br.onFailure();
    br.onSuccess();
    br.onFailure();
    expect(br.state).toBe("closed");
  });
});

describe("backoff and Retry-After", () => {
  it("grows exponentially with equal jitter and respects the cap", () => {
    const p = { maxRetries: 5, baseDelayMs: 100, maxDelayMs: 1_000 };
    expect(backoffDelay(0, p, () => 0)).toBe(50);
    expect(backoffDelay(0, p, () => 1)).toBe(100);
    expect(backoffDelay(3, p, () => 1)).toBe(800);
    expect(backoffDelay(10, p, () => 1)).toBe(1_000);
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(2, p);
      expect(d).toBeGreaterThanOrEqual(200);
      expect(d).toBeLessThanOrEqual(400);
    }
  });

  it("parses delta-seconds and HTTP-dates", () => {
    expect(parseRetryAfter("2")).toBe(2_000);
    expect(parseRetryAfter("0.5")).toBe(500);
    const now = Date.parse("2026-10-08T12:00:00Z");
    expect(parseRetryAfter("Thu, 08 Oct 2026 12:00:03 GMT", now)).toBe(3_000);
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe("ServerClock", () => {
  it("estimates the offset at the request/response midpoint", () => {
    const clock = new ServerClock(() => 2_000);
    clock.observe({ sentAt: 1_000, receivedAt: 1_100, serverMs: 50_000, precisionMs: 1 });
    expect(clock.offsetMs).toBe(48_951);
    expect(clock.now()).toBe(2_000 + 48_951);
  });

  it("keeps the tighter sample unless the estimate is stale; resync() forces adoption", () => {
    const clock = new ServerClock(() => 0, 60_000);
    clock.observe({ sentAt: 0, receivedAt: 20, serverMs: 10_000, precisionMs: 1 });
    const before = clock.offsetMs;
    expect(clock.observe({ sentAt: 100, receivedAt: 900, serverMs: 99_000, precisionMs: 1 })).toBe(false);
    expect(clock.offsetMs).toBe(before);
    expect(clock.observe({ sentAt: 70_000, receivedAt: 70_900, serverMs: 99_000, precisionMs: 1 })).toBe(true); // stale → replaced
    clock.resync({ sentAt: 0, receivedAt: 10_000, serverMs: 1_000_000, precisionMs: 1000 });
    expect(clock.offsetMs).toBe(1_000_000 + 500 - 5_000);
  });

  it("samples the body timestamp first, then the Date header", () => {
    expect(sampleFromResponse(0, 10, { timestamp: 1791459808063 }, "Thu, 08 Oct 2026 11:43:28 GMT")).toEqual({
      sentAt: 0,
      receivedAt: 10,
      serverMs: 1791459808063,
      precisionMs: 1,
    });
    expect(sampleFromResponse(0, 10, { data: "" }, "Thu, 08 Oct 2026 11:43:28 GMT")?.precisionMs).toBe(1000);
    expect(sampleFromResponse(0, 10, null, null)).toBeNull();
  });
});
