/**
 * Forecast commitments: a Merkle tree over one forecaster's forecasts for one round. The root
 * goes on-chain (ForecastBook.commit) before the market opens — "proof of foresight" — and any
 * single forecast can later be proven against it with ForecastBook.verifyForecast.
 *
 * Leaf encoding (must match ForecastBook.sol exactly):
 *   leaf = keccak256(bytes.concat(keccak256(abi.encode(round, token, medianE8, lowerE8, upperE8, anchorTime))))
 * Internal nodes hash the sorted pair (OpenZeppelin MerkleProof's commutative keccak).
 * abi.encode pads every static field to 32 bytes, so the uint widths chosen on-chain do not
 * change the bytes; the field ORDER is what matters.
 */
import { type Hex, encodeAbiParameters, keccak256 } from "viem";

export interface ForecastLeaf {
  round: bigint;
  token: `0x${string}`;
  medianE8: bigint; // USD per token × 1e8
  lowerE8: bigint;
  upperE8: bigint;
  anchorTime: bigint; // unix seconds
}

export function leafHash(l: ForecastLeaf): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { type: "uint64" },
        { type: "address" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint64" },
      ],
      [l.round, l.token, l.medianE8, l.lowerE8, l.upperE8, l.anchorTime],
    ),
  );
  return keccak256(inner);
}

const hashPair = (a: Hex, b: Hex): Hex => (BigInt(a) < BigInt(b) ? keccak256(`0x${a.slice(2)}${b.slice(2)}`) : keccak256(`0x${b.slice(2)}${a.slice(2)}`));

export class MerkleTree {
  readonly layers: Hex[][];

  constructor(leaves: Hex[]) {
    if (leaves.length === 0) throw new Error("empty tree");
    // Sort leaves so the tree (and its root) is independent of input order.
    const sorted = [...leaves].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
    this.layers = [sorted];
    while (this.layers[this.layers.length - 1]!.length > 1) {
      const prev = this.layers[this.layers.length - 1]!;
      const next: Hex[] = [];
      for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i]!, prev[i + 1]!) : prev[i]!);
      this.layers.push(next);
    }
  }

  get root(): Hex {
    return this.layers[this.layers.length - 1]![0]!;
  }

  proof(leaf: Hex): Hex[] {
    let idx = this.layers[0]!.indexOf(leaf);
    if (idx < 0) throw new Error("leaf not in tree");
    const proof: Hex[] = [];
    for (let level = 0; level < this.layers.length - 1; level++) {
      const layer = this.layers[level]!;
      const sib = idx ^ 1;
      if (sib < layer.length) proof.push(layer[sib]!);
      idx >>= 1;
    }
    return proof;
  }
}

/** Mirror of OpenZeppelin MerkleProof.verify, for tests and the public verifier. */
export function verifyProof(proof: Hex[], root: Hex, leaf: Hex): boolean {
  let h = leaf;
  for (const p of proof) h = hashPair(h, p);
  return h.toLowerCase() === root.toLowerCase();
}

export const toE8 = (usd: number): bigint => BigInt(Math.round(usd * 1e8));
