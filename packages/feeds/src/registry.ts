/**
 * Canonical instrument registry from Binance Wallet's public RWA list.
 *
 * This is the same list Binance's own Agentic Wallet skill resolves tickers against
 * (type 1 = Ondo "…on", type 2 = xStocks "…x", type 3 = bStocks "…B"). It carries the
 * dividend-adjusted `multiplier` (shares per token) that makes issuers comparable, and for
 * bStocks the Binance spot symbol (`cs`) where the same token trades 24/7 on the CEX.
 */
import { type AssetType, ISSUER_BY_TYPE, type Instrument } from "@nightshift/core";
import { getJson } from "./http.ts";

const RWA_LIST_URL =
  "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai";

interface RawRwa {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: number;
  assetType?: number | null;
  multiplier?: string | null;
  cs?: string | null;
  lastUpdateTime?: number | null;
  d?: number | null;
}

const ASSET_TYPES: Record<number, AssetType> = { 1: "stock", 2: "pre-ipo", 3: "etf", 4: "other" };

export async function fetchRegistry(): Promise<Instrument[]> {
  const out: Instrument[] = [];
  for (const type of [1, 2, 3]) {
    const res = await getJson<{ code: string; data: RawRwa[] }>(`${RWA_LIST_URL}?type=${type}`, { timeoutMs: 30_000 });
    if (res.code !== "000000" || !Array.isArray(res.data)) throw new Error(`RWA list type ${type}: code ${res.code}`);
    for (const r of res.data) {
      const issuer = ISSUER_BY_TYPE[r.type];
      if (!issuer) continue;
      const multiplier = Number(r.multiplier ?? 1);
      out.push({
        issuer,
        chainId: r.chainId,
        address: r.chainId.startsWith("CT_") ? r.contractAddress : r.contractAddress.toLowerCase(),
        symbol: r.symbol,
        ticker: r.ticker,
        assetType: r.assetType == null ? "unknown" : (ASSET_TYPES[r.assetType] ?? "unknown"),
        multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
        decimals: r.d ?? 18,
        cexSymbol: r.cs ?? null,
        updatedAt: r.lastUpdateTime ?? null,
      });
    }
  }
  return out;
}
