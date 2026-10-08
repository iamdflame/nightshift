/** Issuers of tokenized US equities, keyed the way Binance's wallet RWA list types them. */
export type Issuer = "ondo" | "xstocks" | "bstocks";

export const ISSUER_BY_TYPE: Record<number, Issuer> = { 1: "ondo", 2: "xstocks", 3: "bstocks" };

/** Binance chain identifiers as used across the Web3 API ("56" = BSC, "1" = Ethereum, "CT_501" = Solana). */
export type ChainId = string;
export const BSC: ChainId = "56";

export type AssetType = "stock" | "etf" | "pre-ipo" | "other" | "unknown";

/** One tokenized instrument: a specific issuer's token for a specific underlying on a specific chain. */
export interface Instrument {
  issuer: Issuer;
  chainId: ChainId;
  address: string; // lowercase
  symbol: string; // e.g. NVDAB, NVDAon, NVDAx
  ticker: string; // underlying, e.g. NVDA
  assetType: AssetType;
  /** Shares of the underlying represented by one token (dividend/corporate-action adjusted). */
  multiplier: number;
  decimals: number;
  /** Binance spot symbol when the token also trades on the CEX (bStocks: e.g. NVDABUSDT). */
  cexSymbol: string | null;
  updatedAt: number | null;
}

export interface TopOfBook {
  ts: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
}
