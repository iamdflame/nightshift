/**
 * On-chain pool snapshots for BSC tokens (DexScreener public API, ≤30 tokens per call).
 * Gives every pool's price and liquidity so the tape can see cross-pool dislocations and
 * thin/impostor pools. Replaced by the Binance Web3 Market API (`token/top-liquidity`) when
 * an API key is configured; both are kept so the two can be cross-checked.
 */
import { getJson, setHostSpacing } from "./http.ts";

setHostSpacing("api.dexscreener.com", 250);

export interface PoolSnapshot {
  ts: number;
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseAddress: string;
  baseSymbol: string;
  quoteSymbol: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24h: number;
}

interface RawPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
}

export async function poolsForTokens(addresses: string[]): Promise<PoolSnapshot[]> {
  const out: PoolSnapshot[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const chunk = addresses.slice(i, i + 30);
    const ts = Date.now();
    const pairs = await getJson<RawPair[]>(`https://api.dexscreener.com/tokens/v1/bsc/${chunk.join(",")}`);
    for (const p of pairs) {
      if (p.chainId !== "bsc") continue;
      out.push({
        ts,
        chainId: "56",
        dexId: p.dexId,
        pairAddress: p.pairAddress.toLowerCase(),
        baseAddress: p.baseToken.address.toLowerCase(),
        baseSymbol: p.baseToken.symbol,
        quoteSymbol: p.quoteToken.symbol,
        priceUsd: Number(p.priceUsd ?? Number.NaN),
        liquidityUsd: p.liquidity?.usd ?? 0,
        volume24h: p.volume?.h24 ?? 0,
      });
    }
  }
  return out;
}
