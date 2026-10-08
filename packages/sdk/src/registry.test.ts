import { describe, expect, it } from "vitest";
import { allEndpoints, ENDPOINTS } from "./registry.ts";

describe("endpoint registry", () => {
  it("covers all 65 REST operations listed in llms.txt, each once", () => {
    const all = allEndpoints();
    expect(all).toHaveLength(65);
    expect(new Set(all.map((e) => `${e.method} ${e.path}`)).size).toBe(65);
    expect(new Set(all.map((e) => e.id)).size).toBe(65);
    expect(Object.fromEntries(Object.entries(ENDPOINTS).map(([k, v]) => [k, Object.keys(v).length]))).toEqual({
      rwa: 6,
      market: 21,
      trading: 9,
      transaction: 7,
      wallet: 5,
      defi: 11,
      b402: 6,
    });
  });

  it("uses documented path shapes and retry classes", () => {
    for (const e of allEndpoints()) {
      expect(e.path).toMatch(/^\/api\/v[12]\/(dex|defi|b402)\//);
      expect(e.path.startsWith("/build")).toBe(false);
      if (e.method === "GET") expect(e.retry).toBe("safe");
    }
    const writes = allEndpoints().filter((e) => e.retry !== "safe").map((e) => `${e.id}:${e.retry}`);
    expect(writes.sort()).toEqual(["b402.settle:idempotent-key", "b402.settleV1:idempotent-key", "trading.submitOrder:idempotent-key", "transaction.broadcast:never"]);
  });
});
