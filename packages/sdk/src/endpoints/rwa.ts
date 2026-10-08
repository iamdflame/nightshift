/**
 * RWA Data (tokenized stocks): issuance platforms, prices, search, underlying profile/market.
 * Reference: catalog/web3-wallet/api/rest-api/rwa-data · Guide: products/market-api/introduction.md
 *
 * Note (docs): `referencePrice` is "a per-share converted price derived from the on-chain token
 * price, not an official quote from the traditional stock market" — it is not an independent feed.
 */
import { z } from "zod";
import type { BinanceWeb3Client } from "../client.ts";
import { type CallOptions, DOCS, endpoint } from "../endpoint.ts";
import * as S from "../schemas/rwa.ts";
import { chunk, need, toList } from "./util.ts";

const docs = `${DOCS}/rwa-data`;
/** The documented `platformId` enum (Ondo, bStocks). */
export type RwaPlatformId = "ondo" | "bstock";
export const RWA_PRICE_BATCH_MAX = 100;

export const rwaEndpoints = {
  platforms: endpoint({ id: "rwa.platforms", module: "rwa", method: "GET", path: "/api/v1/dex/market/rwa/platforms", data: z.array(S.RwaPlatform), docs }),
  price: endpoint({ id: "rwa.price", module: "rwa", method: "GET", path: "/api/v1/dex/market/rwa/price", data: z.array(S.RwaTokenPrice), docs }),
  search: endpoint({ id: "rwa.search", module: "rwa", method: "GET", path: "/api/v1/dex/market/rwa/search", data: z.array(S.RwaSearchResult), docs }),
  underlyingProfile: endpoint({ id: "rwa.underlyingProfile", module: "rwa", method: "GET", path: "/api/v1/dex/market/rwa/underlying-profile", data: S.RwaUnderlyingProfile, docs }),
  tokens: endpoint({ id: "rwa.tokens", module: "rwa", method: "GET", path: "/api/v1/dex/market/rwa/tokens", data: z.array(S.RwaToken), docs }),
  underlyingMarket: endpoint({ id: "rwa.underlyingMarket", module: "rwa", method: "GET", path: "/api/v1/dex/market/rwa/underlying-market", data: S.RwaUnderlyingMarket, docs }),
} as const;

export interface RwaTokenRef {
  binanceChainId: string;
  tokenContractAddress: string;
}

export class RwaApi {
  constructor(private readonly client: BinanceWeb3Client) {}

  /** GET /rwa/platforms — all platforms, or one when `platformId` is given. */
  platforms(params: { platformId?: RwaPlatformId } = {}, opts?: CallOptions) {
    return this.client.call(rwaEndpoints.platforms, { query: { platformId: params.platformId } }, opts);
  }

  /**
   * GET /rwa/price — on-chain price + derived reference price. The API takes ≤100 comma-separated
   * addresses; longer lists are split into sequential batches and concatenated.
   */
  async price(params: { binanceChainId: string; tokenContractAddresses: readonly string[] | string }, opts?: CallOptions) {
    const ep = "GET /api/v1/dex/market/rwa/price";
    need("rwa", ep, "binanceChainId", params.binanceChainId);
    const all = need("rwa", ep, "tokenContractAddresses", toList(params.tokenContractAddresses));
    const out: z.infer<typeof S.RwaTokenPrice>[] = [];
    for (const batch of chunk(all, RWA_PRICE_BATCH_MAX)) {
      out.push(...(await this.client.call(rwaEndpoints.price, { query: { binanceChainId: params.binanceChainId, tokenContractAddresses: batch } }, opts)));
    }
    return out;
  }

  /** GET /rwa/search — by ticker, company name or contract address (case-insensitive). */
  search(params: { keyword: string; platformId?: RwaPlatformId }, opts?: CallOptions) {
    need("rwa", "GET /api/v1/dex/market/rwa/search", "keyword", params.keyword);
    return this.client.call(rwaEndpoints.search, { query: { keyword: params.keyword, platformId: params.platformId } }, opts);
  }

  /** GET /rwa/underlying-profile — company info, token-to-share ratio, attestation reports. */
  underlyingProfile(params: RwaTokenRef, opts?: CallOptions) {
    return this.client.call(rwaEndpoints.underlyingProfile, { query: { binanceChainId: params.binanceChainId, tokenContractAddress: params.tokenContractAddress } }, opts);
  }

  /** GET /rwa/tokens — token list with market status; filter by chain, platform, sector tab. */
  tokens(params: { binanceChainId?: string; platformId?: RwaPlatformId; tabId?: number } = {}, opts?: CallOptions) {
    return this.client.call(rwaEndpoints.tokens, { query: { binanceChainId: params.binanceChainId, platformId: params.platformId, tabId: params.tabId } }, opts);
  }

  /** GET /rwa/underlying-market — session status (open/closed/next open) and underlying market data. */
  underlyingMarket(params: RwaTokenRef, opts?: CallOptions) {
    return this.client.call(rwaEndpoints.underlyingMarket, { query: { binanceChainId: params.binanceChainId, tokenContractAddress: params.tokenContractAddress } }, opts);
  }
}
