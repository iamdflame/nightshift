import { describe, expect, it } from "vitest";
import { BinanceWeb3Client, type BinanceWeb3ClientOptions } from "./client.ts";
import { BinanceWeb3Error } from "./errors.ts";
import { buildPrehash, hmacSha256Base64 } from "./sign.ts";
import { MemorySink } from "./telemetry.ts";
import { apiError, json, mockFetch, ok, type Scripted } from "./testing.ts";

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const PRICE_ROW = {
  binanceChainId: "56",
  tokenContractAddress: NVDAB,
  platformId: "bstock",
  tokenPrice: "181.2",
  referencePrice: "181.05",
  tokenPriceUpdatedAt: 1791459800000,
};

function setup(script: Scripted[], opts: Partial<BinanceWeb3ClientOptions> = {}) {
  const m = mockFetch(...script);
  const sink = new MemorySink();
  const slept: number[] = [];
  const client = new BinanceWeb3Client({
    apiKey: "test-key",
    secretKey: "test-secret",
    mode: "live",
    fetch: m.fetch,
    telemetry: sink,
    rateLimit: false,
    random: () => 0.5,
    sleep: async (ms) => void slept.push(ms),
    ...opts,
  });
  return { client, m, sink, slept };
}

async function caught(p: Promise<unknown>): Promise<BinanceWeb3Error> {
  try {
    await p;
  } catch (e) {
    if (e instanceof BinanceWeb3Error) return e;
    throw e;
  }
  throw new Error("expected a BinanceWeb3Error");
}

describe("request construction and signing", () => {
  it("sends /build-prefixed, strictly-encoded, verifiably signed requests", async () => {
    const { client, m, sink } = setup([ok([PRICE_ROW])]);
    const data = await client.rwa.price({ binanceChainId: "56", tokenContractAddresses: [NVDAB] });
    expect(data[0]?.tokenPrice).toBe("181.2");
    const req = m.requests[0]!;
    expect(req.url).toBe(`https://web3.binance.com/build/api/v1/dex/market/rwa/price?binanceChainId=56&tokenContractAddresses=${NVDAB}`);
    expect(req.redirect).toBe("manual");
    expect(req.headers["x-oc-apikey"]).toBe("test-key");
    expect(req.headers["x-oc-nonce"]).toMatch(/^[0-9a-f-]{36}$/);
    const expected = hmacSha256Base64(
      buildPrehash({ timestamp: req.headers["x-oc-timestamp"]!, method: "GET", requestPath: new URL(req.url).pathname + new URL(req.url).search }),
      "test-secret",
    );
    expect(req.headers["x-oc-sign"]).toBe(expected);
    const rec = sink.records[0]!;
    expect(rec).toMatchObject({ module: "rwa", endpoint: "/api/v1/dex/market/rwa/price", method: "GET", httpStatus: 200, apiCode: "0", retries: 0 });
    expect(rec.undocumentedFields).toEqual([]);
    expect(rec.missingFields).toEqual([]);
    expect(rec.requestBytes).toBeGreaterThan(0);
    expect(rec.responseBytes).toBeGreaterThan(0);
  });

  it("signs the exact POST body it sends (array body for /market/price)", async () => {
    const { client, m } = setup([ok([{ binanceChainId: "56", tokenContractAddress: NVDAB, price: "1", time: 1 }])]);
    await client.market.price([{ binanceChainId: "56", tokenContractAddress: NVDAB }]);
    const req = m.requests[0]!;
    expect(req.body).toBe(JSON.stringify([{ binanceChainId: "56", tokenContractAddress: NVDAB }]));
    expect(req.headers["content-type"]).toBe("application/json");
    const prehash = buildPrehash({ timestamp: req.headers["x-oc-timestamp"]!, method: "POST", requestPath: "/build/api/v1/dex/market/price", body: req.body });
    expect(req.headers["x-oc-sign"]).toBe(hmacSha256Base64(prehash, "test-secret"));
  });

  it("wraps and signs B402 bodies as {\"body\": ...}", async () => {
    const supported = { kinds: [], extensions: [], signers: {} };
    const { client, m } = setup([json({ status: "OK", code: "000000000", data: supported })]);
    expect(await client.b402.supported()).toEqual(supported);
    expect(m.requests[0]!.body).toBe('{"body":{}}');
  });

  it("chunks RWA price batches at the documented 100-address limit", async () => {
    const addrs = Array.from({ length: 150 }, (_, i) => `0x${i.toString(16).padStart(40, "0")}`);
    const { client, m } = setup([ok([]), ok([])]);
    await client.rwa.price({ binanceChainId: "56", tokenContractAddresses: addrs });
    expect(m.requests).toHaveLength(2);
    expect(new URL(m.requests[0]!.url).searchParams.get("tokenContractAddresses")!.split(",")).toHaveLength(100);
  });

  it("fails fast without credentials (no network call)", async () => {
    const { client, m } = setup([], { apiKey: "", secretKey: "" });
    const err = await caught(client.rwa.platforms());
    expect(err.kind).toBe("config");
    expect(m.requests).toHaveLength(0);
  });
});

describe("retries and backoff", () => {
  it("honours Retry-After on 429 and then succeeds", async () => {
    const { client, sink, slept } = setup([apiError(42900, "Request rate limit exceeded", 429, { "retry-after": "2" }), ok([PRICE_ROW])]);
    await client.rwa.price({ binanceChainId: "56", tokenContractAddresses: NVDAB });
    expect(slept).toEqual([2_000]);
    expect(sink.records[0]!.retries).toBe(1);
  });

  it("retries 5xx with exponential backoff, then surfaces a typed error with attempt count", async () => {
    const r = () => apiError(50000, "Internal server error, please retry later", 500);
    const { client, m, slept } = setup([r(), r(), r(), r()], { breaker: false });
    const err = await caught(client.market.supportedChains());
    expect(err.kind).toBe("server");
    expect(err.attempts).toBe(4);
    expect(m.requests).toHaveLength(4);
    expect(slept).toEqual([225, 450, 900]); // equal jitter at random()=0.5 on 300 ms base
  });

  it("retries network errors on read endpoints", async () => {
    const { client, m } = setup([new TypeError("fetch failed"), ok({ binanceChainId: "56", blockHeight: 123 })]);
    expect(await client.transaction.blockHeight({ binanceChainId: "56" })).toEqual({ binanceChainId: "56", blockHeight: 123 });
    expect(m.requests).toHaveLength(2);
  });

  it("does not retry business errors (40367 market closed → kind market_closed)", async () => {
    const { client, m } = setup([apiError(40367, "ONDO_MARKET_STATE_NOT_TRADABLE")]);
    const err = await caught(client.trading.quote({ binanceChainId: "56", amount: "1", fromTokenAddress: "0xa", toTokenAddress: "0xb" }));
    expect(err).toMatchObject({ kind: "market_closed", apiCode: "40367", codeName: "ONDO_MARKET_STATE_NOT_TRADABLE", httpStatus: 200 });
    expect(m.requests).toHaveLength(1);
  });

  it("re-syncs the clock from a 40103 response and retries once with a corrected timestamp", async () => {
    const serverAhead = 90_000;
    const { client, m } = setup([
      () => json({ code: 40103, msg: "Timestamp expired", data: "", timestamp: Date.now() + serverAhead }, { status: 401 }),
      () => ok({ binanceChainId: "56", blockHeight: 1 }, { timestamp: Date.now() + serverAhead }),
    ]);
    await client.transaction.blockHeight({ binanceChainId: "56" });
    const t1 = Date.parse(m.requests[0]!.headers["x-oc-timestamp"]!);
    const t2 = Date.parse(m.requests[1]!.headers["x-oc-timestamp"]!);
    expect(t2 - t1).toBeGreaterThan(serverAhead - 5_000);
    expect(client.clock.offsetMs).toBeGreaterThan(serverAhead - 5_000);
  });
});

describe("never auto-retry non-idempotent writes", () => {
  const broadcast = { binanceChainId: "56", signedTransaction: "0xf86c", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" };

  it.each([
    ["HTTP 503", () => apiError(50001, "Service temporarily unavailable", 503)],
    ["network error", () => new TypeError("socket hang up")],
    ["429", () => apiError(42900, "Request rate limit exceeded", 429, { "retry-after": "1" })],
    ["40103", () => json({ code: 40103, msg: "Timestamp expired", data: "", timestamp: Date.now() + 60_000 }, { status: 401 })],
  ] as const)("broadcast is attempted exactly once on %s", async (_, response) => {
    const { client, m, slept } = setup([response()]);
    await caught(client.transaction.broadcast(broadcast));
    expect(m.requests).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  it("RFQ order submit IS retried (documented idempotent by requestId) and reuses the same requestId", async () => {
    const { client, m } = setup([
      apiError(50000, "Internal server error", 500),
      apiError(42901, "ORDER_SUBMIT_IN_PROGRESS"),
      ok({ orderId: "o-1", status: "PENDING_VENDOR", createdAt: 1 }),
    ]);
    const res = await client.trading.submitOrder({ userSignature: `0x${"ab".repeat(65)}`, vendor: "PcsXRfq", quoteId: "q-1" });
    expect(res).toMatchObject({ orderId: "o-1", status: "PENDING_VENDOR" });
    const ids = m.requests.map((r) => (JSON.parse(r.body!) as { requestId: string }).requestId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(res.requestId);
  });

  it("B402 settle is retried on 1160102 (busy) with the identical signed body", async () => {
    const settled = { success: true, transaction: "0xabc", payer: "0x5", network: "eip155:56", amount: "1" };
    const { client, m } = setup([json({ code: "1160102", status: "ERROR", errorData: "System busy" }), json({ code: "000000000", status: "OK", data: settled })]);
    const body = { x402Version: 2 as const, paymentPayload: {} as never, paymentRequirements: {} as never };
    expect(await client.b402.settle(body)).toEqual(settled);
    expect(m.requests).toHaveLength(2);
    expect(m.requests[0]!.body).toBe(m.requests[1]!.body);
  });
});

describe("error mapping", () => {
  it("maps the real gateway 401 (observed body: data \"\") with the X-OC-Trace-Id request id", async () => {
    const { client } = setup([
      json({ data: "", msg: "API Key is required", timestamp: 1791459808063, code: 40101 }, { status: 401, headers: { "x-oc-trace-id": "unknown-gateway-80f2a5" } }),
    ]);
    const err = await caught(client.market.supportedChains());
    expect(err).toMatchObject({ kind: "auth", httpStatus: 401, apiCode: "40101", requestId: "unknown-gateway-80f2a5", retryable: false });
    expect(err.docsUrl).toMatch(/market-api\/error-codes/);
  });

  it("disambiguates 40102: user EIP-712 signature (HTTP 200 on /order/submit) vs gateway HMAC (401)", async () => {
    const { client } = setup([apiError(40102, "Signature error"), apiError(40102, "Invalid signature", 401)]);
    const a = await caught(client.trading.submitOrder({ userSignature: "0x1", vendor: "PcsXRfq", quoteId: "q" }));
    expect(a.kind).toBe("user_signature");
    const b = await caught(client.trading.orderStatus("o-1"));
    expect(b.kind).toBe("signature");
  });

  it("refuses redirects instead of forwarding credentials (bare /api → api.binance.com, observed)", async () => {
    const { client, m } = setup([new Response("moved", { status: 301, headers: { location: "https://api.binance.com/api/v1/dex/market/supported/chain" } })]);
    const err = await caught(client.market.supportedChains());
    expect(err.kind).toBe("redirect");
    expect(err.message).toMatch(/api\.binance\.com/);
    expect(m.requests).toHaveLength(1);
  });

  it("recognizes an AWS WAF challenge (HTTP 202, empty body)", async () => {
    const { client } = setup([new Response("", { status: 202, headers: { "x-amzn-waf-action": "challenge" } })], { retry: { maxRetries: 0 } });
    expect((await caught(client.market.supportedChains())).kind).toBe("waf");
  });

  it("times out slow attempts (kind timeout) and does not hang", async () => {
    const hang = (_req: unknown, signal?: AbortSignal | null) =>
      new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
    const { client } = setup([hang], { timeoutMs: 20, retry: { maxRetries: 0 } });
    expect((await caught(client.market.supportedChains())).kind).toBe("timeout");
  });

  it("propagates a caller abort without retrying", async () => {
    const ac = new AbortController();
    const hang = (_req: unknown, signal?: AbortSignal | null) =>
      new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
    const { client, m } = setup([hang]);
    const p = client.market.supportedChains({ signal: ac.signal });
    ac.abort(new Error("caller gave up"));
    await expect(p).rejects.toThrow("caller gave up");
    expect(m.requests).toHaveLength(1);
  });
});

describe("circuit breaker", () => {
  it("opens after consecutive availability failures and fails fast without touching the network", async () => {
    const r = () => apiError(50001, "Service temporarily unavailable", 503);
    const { client, m } = setup([r(), r()], { breaker: { failureThreshold: 2, openMs: 60_000 }, retry: { maxRetries: 0 } });
    await caught(client.market.supportedChains());
    await caught(client.market.supportedChains());
    const err = await caught(client.market.supportedChains());
    expect(err.kind).toBe("circuit_open");
    expect(m.requests).toHaveLength(2);
    // Other endpoints keep their own breakers.
    m.push(ok([]));
    await client.market.portfolioChains();
  });

  it("business errors do not trip the breaker", async () => {
    const { client } = setup([apiError(40001, "Parameter error"), apiError(40001, "Parameter error"), ok([])], { breaker: { failureThreshold: 2 } });
    await caught(client.market.supportedChains());
    await caught(client.market.supportedChains());
    await client.market.supportedChains();
  });
});

describe("validation and drift", () => {
  it("warn mode returns data, records schema issues and doc drift", async () => {
    const row = { ...PRICE_ROW, tokenPrice: 181.2, brandNewField: "x" } as Record<string, unknown>;
    delete row.tokenPriceUpdatedAt;
    const { client, sink } = setup([ok([row])]);
    const data = await client.rwa.price({ binanceChainId: "56", tokenContractAddresses: NVDAB });
    expect((data[0] as Record<string, unknown>).brandNewField).toBe("x");
    const rec = sink.records[0]!;
    expect(rec.undocumentedFields).toEqual(["data[].brandNewField"]);
    expect(rec.missingFields).toEqual(["data[].tokenPriceUpdatedAt"]);
    expect(rec.schemaIssues?.[0]).toMatch(/^\[0\]\.tokenPrice/);
  });

  it("strict mode throws a schema error (and still records the call)", async () => {
    const { client, sink } = setup([ok([{ ...PRICE_ROW, tokenPrice: 1 }])], { validation: "strict" });
    expect((await caught(client.rwa.price({ binanceChainId: "56", tokenContractAddresses: NVDAB }))).kind).toBe("schema");
    expect(sink.records).toHaveLength(1);
  });

  it("flags envelope drift on gateway errors (observed `success` absent is documented; data type differs)", async () => {
    const { client, sink } = setup([json({ code: 40101, msg: "Invalid API Key", timestamp: 1, data: "", extraGatewayField: 1 }, { status: 401 })]);
    await caught(client.market.supportedChains());
    expect(sink.records[0]!.undocumentedFields).toEqual(["extraGatewayField"]);
  });
});
