import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BinanceWeb3Client } from "./client.ts";
import { detectDrift } from "./drift.ts";
import { BinanceWeb3Error } from "./errors.ts";
import { FixtureStore, fixtureKey, redactJson, resolveMode } from "./fixtures.ts";
import { SqliteTelemetrySink } from "./sqlite-sink.ts";
import { MemorySink, summarize } from "./telemetry.ts";
import { apiError, json, mockFetch, ok } from "./testing.ts";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), `nightshift-sdk-${p}-`));

describe("detectDrift", () => {
  const Doc = z
    .object({
      a: z.string(),
      b: z.number().nullable().optional(),
      nested: z.object({ x: z.string(), y: z.string().optional() }).passthrough().optional(),
      list: z.array(z.object({ id: z.string() }).passthrough()).optional(),
      map: z.record(z.string(), z.object({ ok: z.boolean() }).passthrough()).optional(),
      either: z.union([z.object({ kind: z.string() }).passthrough(), z.string()]).optional(),
    })
    .passthrough();

  it("reports undocumented and missing keys with normalized paths", () => {
    const r = detectDrift(Doc, {
      a: "1",
      surprise: true,
      nested: { x: "1", extra: 1 },
      list: [{ id: "1" }, { id: "2", more: 1 }, {}],
      map: { anyKey: { ok: true, hidden: 1 } },
      either: { kind: "k", bonus: 1 },
    });
    expect(r.undocumented).toEqual(["either.bonus", "list[].more", "map.*.hidden", "nested.extra", "surprise"]);
    expect(r.missing).toEqual(["b", "list[].id", "nested.y"]);
  });

  it("treats present-but-null as present and ignores primitives", () => {
    expect(detectDrift(Doc, { a: "1", b: null, nested: null, list: null, map: null, either: "s" })).toEqual({ undocumented: [], missing: [] });
  });
});

describe("SQLite telemetry sink (dx_calls)", () => {
  it("creates dx_calls next to existing tape tables and records every call", async () => {
    const path = join(tmp("db"), "tape.sqlite");
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE instruments (chain_id TEXT, address TEXT)"); // a tape table already present
    db.close();
    new SqliteTelemetrySink(path).close(); // idempotent creation
    const sink = new SqliteTelemetrySink(path);
    const m = mockFetch(ok([{ binanceChainId: "56", name: "BNB Smart Chain", shortName: "BSC", logoUrl: "x", surprise: 1 }]), apiError(40001, "Parameter error"));
    const client = new BinanceWeb3Client({ apiKey: "k", secretKey: "s", mode: "live", fetch: m.fetch, telemetry: sink, rateLimit: false });
    await client.transaction.supportedChains();
    await expect(client.transaction.gasPrice({ binanceChainId: "56" })).rejects.toBeInstanceOf(BinanceWeb3Error);

    const rows = sink.records();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ module: "transaction", endpoint: "/api/v1/dex/pre-transaction/supported/chain", httpStatus: 200, apiCode: "0", undocumentedFields: ["data[].surprise"] });
    expect(rows[1]).toMatchObject({ apiCode: "40001", errorKind: "param" });
    const stats = sink.summary();
    expect(stats.map((s) => s.endpoint).sort()).toEqual(["/api/v1/dex/pre-transaction/gas-price", "/api/v1/dex/pre-transaction/supported/chain"]);
    const tables = sink.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(["dx_calls", "instruments"]));
    sink.close();
  });

  it("summarize() aggregates latency quantiles, codes and drift per endpoint", () => {
    const base = { ts: 0, module: "rwa" as const, endpoint: "/x", method: "GET", httpStatus: 200, apiCode: "0", retries: 0, requestBytes: 1, responseBytes: 1, undocumentedFields: [], missingFields: [] };
    const s = summarize([
      { ...base, latencyMs: 10 },
      { ...base, latencyMs: 30, retries: 2, undocumentedFields: ["data.z"] },
      { ...base, latencyMs: 20, apiCode: "40367", error: "closed" },
    ]);
    expect(s[0]).toMatchObject({ calls: 3, errors: 1, retries: 2, p50Ms: 20, maxMs: 30, codes: { "0": 2, "40367": 1 }, undocumentedFields: ["data.z"] });
  });
});

describe("record / replay", () => {
  it("resolves BINANCE_WEB3_MODE", () => {
    expect(resolveMode(undefined)).toBe("live");
    expect(resolveMode("REPLAY")).toBe("replay");
    expect(() => resolveMode("dry-run")).toThrow(/live\|record\|replay/);
  });

  it("records fixtures without secrets or signatures, then replays them offline", async () => {
    const dir = tmp("fx");
    const token = "eyJhbGciOiJIUzI1NiJ9.secret.jwt";
    const rec = mockFetch(
      json({ code: 0, msg: "success", data: { token }, timestamp: Date.now(), success: true }, { headers: { "x-oc-trace-id": "trace-1", "set-cookie": "a=b" } }),
      ok({ orderId: "o-1", status: "PENDING_VENDOR", createdAt: 1 }),
    );
    const recorder = new BinanceWeb3Client({ apiKey: "real-key", secretKey: "real-secret", mode: "record", fixtures: dir, fetch: rec.fetch, rateLimit: false });
    await recorder.market.wsAuthToken();
    const submit = { userSignature: `0x${"cd".repeat(65)}`, vendor: "PcsXRfq", quoteId: "q-1", requestId: "11111111-2222-4333-8444-555555555555" };
    await recorder.trading.submitOrder(submit);

    const files = readdirSync(join(dir, "market")).concat(readdirSync(join(dir, "trading")));
    expect(files).toHaveLength(2);
    const all = [join(dir, "market", readdirSync(join(dir, "market"))[0]!), join(dir, "trading", readdirSync(join(dir, "trading"))[0]!)].map((f) => readFileSync(f, "utf8")).join("\n");
    for (const secret of ["real-key", "real-secret", token, "cd".repeat(65), "x-oc-sign", "set-cookie"]) expect(all).not.toContain(secret);
    expect(all).toContain("[redacted]");
    expect(all).toContain("trace-1");

    // Replay: no credentials, and any network access would throw.
    const replay = new BinanceWeb3Client({ mode: "replay", fixtures: dir, apiKey: "", secretKey: "", fetch: (() => { throw new Error("network used in replay"); }) as typeof fetch });
    const sink = new MemorySink();
    replay.addSink(sink);
    expect(await replay.market.wsAuthToken()).toEqual({ token: "[redacted]" });
    expect(await replay.trading.submitOrder(submit)).toMatchObject({ orderId: "o-1", requestId: submit.requestId });
    expect(sink.records.every((r) => r.mode === "replay")).toBe(true);

    await expect(replay.trading.orderStatus("never-recorded")).rejects.toMatchObject({ kind: "replay_miss" });
  });

  it("keys fixtures by method + path + canonical query + body", () => {
    const a = fixtureKey({ method: "GET", path: "/p", query: "b=2&a=1", body: "" });
    expect(a).toBe(fixtureKey({ method: "get", path: "/p", query: "a=1&b=2", body: "" }));
    expect(a).not.toBe(fixtureKey({ method: "GET", path: "/p", query: "a=1&b=3", body: "" }));
    expect(fixtureKey({ method: "POST", path: "/p", query: "", body: "{}" })).not.toBe(fixtureKey({ method: "POST", path: "/p", query: "", body: "[]" }));
    expect(new FixtureStore("/fx").file("rwa", { method: "GET", path: "/api/v1/dex/market/rwa/price", query: "", body: "" })).toMatch(/rwa[\\/]GET_dex_market_rwa_price_[0-9a-f]{16}\.json$/);
  });

  it("redacts signatures, credentials and full authorization payloads (per the B402 logging guidance)", () => {
    expect(
      redactJson({ body: { paymentPayload: { payload: { signature: "0xsig", authorization: { nonce: "n" }, permit2Authorization: { nonce: "1" } }, accepted: { amount: "1" } } }, apiKey: "k" }),
    ).toEqual({
      body: { paymentPayload: { payload: { signature: "[redacted]", authorization: "[redacted]", permit2Authorization: "[redacted]" }, accepted: { amount: "1" } } },
      apiKey: "[redacted]",
    });
  });
});
