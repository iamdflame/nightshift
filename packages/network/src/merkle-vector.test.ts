import { describe, expect, it } from "vitest";
import { MerkleTree, leafHash, toE8 } from "./merkle.ts";

// Cross-implementation test vector from docs/contracts.md (asserted in contracts/test/ForecastBook.t.sol,
// computed independently with cast). The TypeScript committer must produce byte-identical leaves and root.
const anchor = 1791811800n;
const L = (token: string, m: number, lo: number, hi: number) => leafHash({ round: 42n, token: token as `0x${string}`, medianE8: toE8(m), lowerE8: toE8(lo), upperE8: toE8(hi), anchorTime: anchor });

describe("ForecastBook leaf encoding matches the Solidity contract", () => {
  const leaves = {
    NVDAB: L("0x02fca66c1d1afb4e2a7884261eb00f63598a7436", 236, 220, 250),
    TSLAB: L("0x5b1910eaad6450e50f816082aa078c41f10c292f", 430, 400, 460),
    SPYB: L("0x7138b48df7d98d7e3cc221bfe7192d0a178182d8", 670, 655, 685),
    TEST: L("0x1111111111111111111111111111111111111111", 1, 0.95, 1.05),
  };
  it("leaf hashes are byte-identical", () => {
    expect(leaves.NVDAB).toBe("0xb6476578ac615829d4157df6a99711134873b67ecee1e2d54b5fa1d7fd97184f");
    expect(leaves.TSLAB).toBe("0x94be875fcafb102fd7b1465e8a092e1a576936504a20b2ec35f0ee0031783e0f");
    expect(leaves.SPYB).toBe("0x86356732510532068af2acbb3392dabdffe9f61f5c292b4c0de0f41b12f46a20");
    expect(leaves.TEST).toBe("0x3b97602ef9fd456d397b71f714fb4ea53a4f42c8d96810682f4f44b48213c13c");
  });
  it("root matches", () => {
    const root = new MerkleTree(Object.values(leaves)).root;
    expect(root.startsWith("0xe06290fe")).toBe(true);
    expect(root.endsWith("2fb0")).toBe(true);
  });
});
