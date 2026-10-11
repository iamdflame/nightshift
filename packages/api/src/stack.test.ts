import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DX_CALLS_SCHEMA } from "@nightshift/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queries } from "./queries.js";

const NOW = Date.parse("2026-10-11T05:00:00Z");
let dir: string;
let q: Queries;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ns-stack-"));
  const path = join(dir, "tape.sqlite");
  const db = new DatabaseSync(path);
  db.exec(DX_CALLS_SCHEMA);
  const insert = db.prepare(
    `INSERT INTO dx_calls (ts, module, endpoint, method, http_status, api_code, latency_ms, retries, request_bytes, response_bytes, error_kind, undocumented_fields, missing_fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 100, 1000, ?, ?, '[]')`,
  );
  const hour = 3_600_000;
  for (let i = 0; i < 10; i++) insert.run(NOW - hour, "rwa", "/api/v1/rwa/price", "GET", 200, "0", 100 + i * 10, null, i === 0 ? '["referencePrice"]' : "[]");
  insert.run(NOW - hour, "trading", "/api/v1/dex/aggregator/quote", "GET", 200, "40374", 400, null, "[]");
  insert.run(NOW - 3 * 24 * hour, "trading", "/api/v1/dex/aggregator/swap", "GET", 200, "0", 900, null, "[]");
  insert.run(NOW - hour, "trading", "/api/v1/dex/aggregator/quote", "GET", null, null, 0, "circuit_open", "[]");
  // RWA from a host Binance won't serve: earlier successes (another machine), now a compliance refusal.
  insert.run(NOW - 30 * 60_000, "rwa", "/api/v1/rwa/price", "GET", 200, "40304", 300, "compliance", "[]");
  db.close();
  q = new Queries(path);
});

afterAll(() => {
  q.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Queries.stack", () => {
  it("counts calls per module and endpoint, 24 h and all time, with latency percentiles", () => {
    const s = q.stack(NOW);
    expect(s.totalCalls).toBe(13);
    expect(s.calls24h).toBe(12);
    const rwa = s.modules.find((m) => m.module === "rwa")!;
    expect(rwa.calls24h).toBe(11);
    const price = rwa.endpoints[0]!;
    expect(price.p50Ms).toBe(150);
    expect(price.p95Ms).toBe(300);
    expect(price.drift.undocumented).toEqual(["referencePrice"]);
  });

  it("uses all-time latency for endpoints quiet in the last day, and never counts unsent calls", () => {
    const s = q.stack(NOW);
    const trading = s.modules.find((m) => m.module === "trading")!;
    const swap = trading.endpoints.find((e) => e.endpoint.endsWith("/swap"))!;
    expect(swap).toMatchObject({ calls24h: 0, callsAll: 1, p50Ms: 900, latencyWindow: "all" });
    const quote = trading.endpoints.find((e) => e.endpoint.endsWith("/quote"))!;
    expect(quote).toMatchObject({ callsAll: 1, notSent: 1 });
    expect(s.notSent.total).toBe(1);
  });

  it("marks a module refused when every endpoint's latest answer is a compliance code, whatever came before", () => {
    const s = q.stack(NOW);
    const rwa = s.modules.find((m) => m.module === "rwa")!;
    expect(rwa).toMatchObject({ refusedWith: "40304" });
    expect(rwa.endpoints[0]).toMatchObject({ lastCode: "40304", codes: { "0": 10, "40304": 1 } });
    expect(s.modules.find((m) => m.module === "trading")!.refusedWith).toBeNull();
    expect(s.codes.find((c) => c.code === "40304")!.ourHandling).toMatch(/never routed around/i);
  });

  it("explains every outcome code from the evidence or the SDK catalog", () => {
    const codes = Object.fromEntries(q.stack(NOW).codes.map((c) => [c.code, c]));
    expect(codes["0"]).toMatchObject({ ok: true, count: 11 });
    expect(codes["40374"]!.meaning).toMatch(/liquidity/i);
    expect(codes.circuit_open).toMatchObject({ sent: false });
  });

  it("returns zero calls (not an error) when the table doesn't exist yet", () => {
    const empty = mkdtempSync(join(tmpdir(), "ns-stack-empty-"));
    const db = new DatabaseSync(join(empty, "tape.sqlite"));
    db.exec("CREATE TABLE instruments (address TEXT, symbol TEXT, chain_id TEXT)");
    db.close();
    const eq = new Queries(join(empty, "tape.sqlite"));
    const s = eq.stack(NOW);
    eq.close();
    expect(s.totalCalls).toBe(0);
    expect(s.sdk.endpoints).toBeGreaterThan(0);
    rmSync(empty, { recursive: true, force: true });
  });
});
