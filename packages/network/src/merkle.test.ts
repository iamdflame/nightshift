import { describe, expect, it } from "vitest";
import { type ForecastLeaf, MerkleTree, leafHash, toE8, verifyProof } from "./merkle.ts";

const leaf = (i: number): ForecastLeaf => ({
  round: 29_337_123n,
  token: `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
  medianE8: toE8(100 + i),
  lowerE8: toE8(95 + i),
  upperE8: toE8(105 + i),
  anchorTime: 1_791_466_200n,
});

describe("forecast Merkle commitments", () => {
  it("proves every leaf against the root for odd and even sizes", () => {
    for (const n of [1, 2, 3, 7, 8, 91]) {
      const hashes = Array.from({ length: n }, (_, i) => leafHash(leaf(i)));
      const tree = new MerkleTree(hashes);
      for (const h of hashes) expect(verifyProof(tree.proof(h), tree.root, h)).toBe(true);
    }
  });

  it("root is independent of input order and changes if any forecast changes", () => {
    const hashes = Array.from({ length: 10 }, (_, i) => leafHash(leaf(i)));
    const a = new MerkleTree(hashes).root;
    const b = new MerkleTree([...hashes].reverse()).root;
    expect(a).toBe(b);
    const tampered = [...hashes];
    tampered[3] = leafHash({ ...leaf(3), medianE8: leaf(3).medianE8 + 1n });
    expect(new MerkleTree(tampered).root).not.toBe(a);
  });

  it("rejects a proof for a forecast that was not committed", () => {
    const hashes = Array.from({ length: 10 }, (_, i) => leafHash(leaf(i)));
    const tree = new MerkleTree(hashes);
    const forged = leafHash({ ...leaf(2), upperE8: leaf(2).upperE8 + 1n });
    expect(verifyProof(tree.proof(hashes[2]!), tree.root, forged)).toBe(false);
  });
});
