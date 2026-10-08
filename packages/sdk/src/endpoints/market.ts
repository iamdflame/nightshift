/**
 * Market API — general data, address portfolio, WebSocket auth token.
 * Reference: catalog/web3-wallet/api/rest-api/{general-data,address-portfolio,web-socket-api}
 * Guide: products/market-api/introduction.md
 */
import { z } from "zod";
import type { BinanceWeb3Client } from "../client.ts";
import { type CallOptions, DOCS, endpoint } from "../endpoint.ts";
import * as S from "../schemas/market.ts";
import type { QueryParams } from "../sign.ts";
import { chunk, need } from "./util.ts";

const general = `${DOCS}/general-data`;
const portfolio = `${DOCS}/address-portfolio`;
const P = "/api/v1/dex/market";

export const marketEndpoints = {
  supportedChains: endpoint({ id: "market.supportedChains", module: "market", method: "GET", path: `${P}/supported/chain`, data: z.array(S.MarketChain), docs: general }),
  price: endpoint({ id: "market.price", module: "market", method: "POST", path: `${P}/price`, data: z.array(S.TokenPrice), docs: general }),
  priceInfo: endpoint({ id: "market.priceInfo", module: "market", method: "POST", path: `${P}/price-info`, data: z.array(S.TokenTradingInfo), docs: general }),
  candles: endpoint({ id: "market.candles", module: "market", method: "GET", path: `${P}/candles`, data: z.array(z.array(z.number())), docs: general }),
  tokenSearch: endpoint({ id: "market.tokenSearch", module: "market", method: "GET", path: `${P}/token/search`, data: z.array(S.TokenSearchResult), docs: general }),
  /** Documented as POST with *query* parameters and no body. */
  basicInfo: endpoint({ id: "market.basicInfo", module: "market", method: "POST", path: `${P}/token/basic-info`, data: S.TokenBasicInfo, docs: general }),
  advancedInfo: endpoint({ id: "market.advancedInfo", module: "market", method: "GET", path: `${P}/token/advanced-info`, data: S.TokenAdvancedInfo, docs: general }),
  hotTokens: endpoint({ id: "market.hotTokens", module: "market", method: "GET", path: `${P}/token/hot-token`, data: S.HotTokenPage, docs: general }),
  holders: endpoint({ id: "market.holders", module: "market", method: "GET", path: `${P}/token/holder`, data: z.array(S.TokenHolder), docs: general }),
  topTraders: endpoint({ id: "market.topTraders", module: "market", method: "GET", path: `${P}/token/top-trader`, data: z.array(S.TopTrader), docs: general }),
  topLiquidity: endpoint({ id: "market.topLiquidity", module: "market", method: "GET", path: `${P}/token/top-liquidity`, data: z.array(S.LiquidityPool), docs: general }),
  trades: endpoint({ id: "market.trades", module: "market", method: "GET", path: `${P}/trades`, data: S.TokenTradesPage, docs: general }),
  devInfo: endpoint({ id: "market.devInfo", module: "market", method: "GET", path: `${P}/memepump/tokenDevInfo`, data: S.TokenDevInfo, docs: general }),
  portfolioChains: endpoint({ id: "market.portfolioChains", module: "market", method: "GET", path: `${P}/portfolio/supported/chain`, data: z.array(S.PortfolioChain), docs: portfolio }),
  portfolioOverview: endpoint({ id: "market.portfolioOverview", module: "market", method: "GET", path: `${P}/portfolio/overview`, data: S.PortfolioOverview, docs: portfolio }),
  recentPnl: endpoint({ id: "market.recentPnl", module: "market", method: "GET", path: `${P}/portfolio/recent-pnl`, data: S.RecentPnlPage, docs: portfolio }),
  tokenPnl: endpoint({ id: "market.tokenPnl", module: "market", method: "GET", path: `${P}/portfolio/token/latest-pnl`, data: S.TokenPnl, docs: portfolio }),
  dexHistory: endpoint({ id: "market.dexHistory", module: "market", method: "GET", path: `${P}/portfolio/dex-history`, data: S.DexTradeHistoryPage, docs: portfolio }),
  leaderboard: endpoint({ id: "market.leaderboard", module: "market", method: "GET", path: `${P}/leaderboard/list`, data: S.LeaderboardPage, docs: portfolio }),
  trackedTrades: endpoint({ id: "market.trackedTrades", module: "market", method: "GET", path: `${P}/address-tracker/trades`, data: S.TrackedTradesPage, docs: portfolio }),
  wsAuthToken: endpoint({ id: "market.wsAuthToken", module: "market", method: "GET", path: `${P}/wss/auth/token`, data: S.WsAuthToken, docs: `${DOCS}/web-socket-api` }),
} as const;

export const MARKET_BATCH_MAX = 100;

export type CandleBar = "1s" | "5s" | "30s" | "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Candle time, epoch ms. */
  ts: number;
  trades: number;
}

/** Documented record order: open, high, low, close, volume, timestamp (ms), tradeCount. */
export function toCandle(row: readonly number[]): Candle {
  const [open, high, low, close, volume, ts, trades] = row;
  return { open: open!, high: high!, low: low!, close: close!, volume: volume!, ts: ts!, trades: trades! };
}

export interface TokenRef {
  binanceChainId: string;
  tokenContractAddress: string;
}

/** Address-tag filter: 1=KOL, 2=Developer, 3=Smart Money, 4=Insider, 5=Sniper, 6=Bundler (7 on trades/top-trader). */
export type TagFilter = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Documented numeric/boolean filters of GET /token/hot-token. */
export const HOT_TOKEN_FILTERS = [
  "priceChangePercentMin", "priceChangePercentMax", "volumeMin", "volumeMax", "txsMin", "txsMax", "marketCapMin", "marketCapMax",
  "liquidityMin", "liquidityMax", "devHoldingPercentMin", "devHoldingPercentMax", "inflowUsdMin", "inflowUsdMax", "holdersMin", "holdersMax",
  "bnHolderCountMin", "bnHolderCountMax", "top10HoldingPercentMin", "top10HoldingPercentMax", "sniperHoldingPercentMin", "sniperHoldingPercentMax",
  "smartMoneyHoldingPercentMin", "smartMoneyHoldingPercentMax", "kolHoldingPercentMin", "kolHoldingPercentMax", "proHoldingPercentMin",
  "proHoldingPercentMax", "freshWalletHoldingPercentMin", "freshWalletHoldingPercentMax", "insiderHoldingPercentMin", "insiderHoldingPercentMax",
  "bundlerHoldingPercentMin", "bundlerHoldingPercentMax", "devCreatedTokenCountMin", "devCreatedTokenCountMax", "devMigratedTokenCountMin",
  "devMigratedTokenCountMax", "devMigratedTokenPercentMin", "devMigratedTokenPercentMax", "isDevSoldAll", "isDevBurned", "isMint", "isFreeze",
  "isHideWashTradingTokens", "isHideDevWashTradingTokens", "isHideInternalWashTradingTokens",
] as const;
export type HotTokenFilter = (typeof HOT_TOKEN_FILTERS)[number];

export interface HotTokenParams extends Partial<Record<HotTokenFilter, string | number | boolean>> {
  binanceChainId: string;
  /** 1=price, 2=price change, 3=transactions, 4=volume, 5=market cap, 6=liquidity, 7=creation time, 8=holders, 9=Binance MPC holders, 10=net inflow. */
  rankBy?: number;
  /** 1=1m, 2=5m, 3=1h (default), 4=4h, 5=24h. */
  rankingTimeFrame?: number;
  pageId?: number;
  size?: number;
}

const ref = (p: TokenRef): QueryParams => ({ binanceChainId: p.binanceChainId, tokenContractAddress: p.tokenContractAddress });

export class MarketApi {
  constructor(private readonly client: BinanceWeb3Client) {}

  supportedChains(opts?: CallOptions) {
    return this.client.call(marketEndpoints.supportedChains, {}, opts);
  }

  /** POST /price — latest USD prices; batches of ≤100 (longer lists are split automatically). */
  async price(tokens: readonly TokenRef[], opts?: CallOptions) {
    need("market", "POST /api/v1/dex/market/price", "tokens", tokens);
    const out: z.infer<typeof S.TokenPrice>[] = [];
    for (const batch of chunk(tokens.map(ref), MARKET_BATCH_MAX)) out.push(...(await this.client.call(marketEndpoints.price, { body: batch }, opts)));
    return out;
  }

  /** POST /price-info — price + volume/txs/market cap/holders windows; batches of ≤100. */
  async priceInfo(tokens: readonly TokenRef[], opts?: CallOptions) {
    need("market", "POST /api/v1/dex/market/price-info", "tokens", tokens);
    const out: z.infer<typeof S.TokenTradingInfo>[] = [];
    for (const batch of chunk(tokens.map(ref), MARKET_BATCH_MAX)) out.push(...(await this.client.call(marketEndpoints.priceInfo, { body: batch }, opts)));
    return out;
  }

  /** GET /candles — raw rows as documented: [open, high, low, close, volume, ts, tradeCount]. */
  candles(params: TokenRef & { bar?: CandleBar; after?: number; before?: number; limit?: number }, opts?: CallOptions) {
    return this.client.call(marketEndpoints.candles, { query: { ...ref(params), bar: params.bar, after: params.after, before: params.before, limit: params.limit } }, opts);
  }

  /** Candles mapped to named fields. */
  async candleObjects(params: TokenRef & { bar?: CandleBar; after?: number; before?: number; limit?: number }, opts?: CallOptions): Promise<Candle[]> {
    return (await this.candles(params, opts)).map(toCandle);
  }

  /** GET /token/search — `chains` is a comma-separated chain-id list. */
  tokenSearch(params: { chains: readonly string[] | string; search: string }, opts?: CallOptions) {
    return this.client.call(marketEndpoints.tokenSearch, { query: { chains: params.chains, search: params.search } }, opts);
  }

  basicInfo(params: TokenRef, opts?: CallOptions) {
    return this.client.call(marketEndpoints.basicInfo, { query: ref(params) }, opts);
  }

  advancedInfo(params: TokenRef, opts?: CallOptions) {
    return this.client.call(marketEndpoints.advancedInfo, { query: ref(params) }, opts);
  }

  hotTokens(params: HotTokenParams, opts?: CallOptions) {
    return this.client.call(marketEndpoints.hotTokens, { query: { ...params } }, opts);
  }

  holders(params: TokenRef & { tagFilter?: TagFilter }, opts?: CallOptions) {
    return this.client.call(marketEndpoints.holders, { query: { ...ref(params), tagFilter: params.tagFilter } }, opts);
  }

  topTraders(params: TokenRef & { tagFilter?: TagFilter }, opts?: CallOptions) {
    return this.client.call(marketEndpoints.topTraders, { query: { ...ref(params), tagFilter: params.tagFilter } }, opts);
  }

  topLiquidity(params: TokenRef, opts?: CallOptions) {
    return this.client.call(marketEndpoints.topLiquidity, { query: ref(params) }, opts);
  }

  /** GET /trades — cursor-paginated; `limit` ≤ 500; `walletAddressFilter` ≤ 2 addresses. */
  trades(params: TokenRef & { cursor?: string; limit?: number; tagFilter?: TagFilter; walletAddressFilter?: readonly string[] | string }, opts?: CallOptions) {
    return this.client.call(
      marketEndpoints.trades,
      { query: { ...ref(params), cursor: params.cursor, limit: params.limit, tagFilter: params.tagFilter, walletAddressFilter: params.walletAddressFilter } },
      opts,
    );
  }

  devInfo(params: TokenRef, opts?: CallOptions) {
    return this.client.call(marketEndpoints.devInfo, { query: ref(params) }, opts);
  }

  portfolioChains(opts?: CallOptions) {
    return this.client.call(marketEndpoints.portfolioChains, {}, opts);
  }

  /** `timeFrame`: 1=1D, 2=7D, 3=1M, 4=3M (differs from leaderboard's encoding!). */
  portfolioOverview(params: { binanceChainId: string; walletAddress: string; timeFrame: "1" | "2" | "3" | "4" }, opts?: CallOptions) {
    return this.client.call(marketEndpoints.portfolioOverview, { query: { ...params } }, opts);
  }

  recentPnl(params: { binanceChainId: string; walletAddress: string; cursor?: string; limit?: number }, opts?: CallOptions) {
    return this.client.call(marketEndpoints.recentPnl, { query: { ...params } }, opts);
  }

  tokenPnl(params: { binanceChainId: string; walletAddress: string; tokenContractAddress: string }, opts?: CallOptions) {
    return this.client.call(marketEndpoints.tokenPnl, { query: { ...params } }, opts);
  }

  /** `type`: 1=Buy, 2=Sell; `begin`/`end` epoch ms (inclusive). */
  dexHistory(
    params: { binanceChainId: string; walletAddress: string; begin?: number; end?: number; tokenContractAddress?: string; type?: "1" | "2"; cursor?: string; limit?: number },
    opts?: CallOptions,
  ) {
    return this.client.call(marketEndpoints.dexHistory, { query: { ...params } }, opts);
  }

  /** `timeFrame`: 1=7D, 2=1M, 3=3M; `sortBy`: 1=PnL, 2=win rate, 3=tx count, 4=volume, 5=PnL %; `walletType`: 1=Smart Money, 2=KOL, 3=Hot List. */
  leaderboard(
    params: {
      binanceChainId: string;
      timeFrame: "1" | "2" | "3";
      sortBy: "1" | "2" | "3" | "4" | "5";
      walletType?: "1" | "2" | "3";
      minRealizedPnlUsd?: string;
      maxRealizedPnlUsd?: string;
      minWinRatePercent?: string;
      maxWinRatePercent?: string;
      minTxs?: string;
      maxTxs?: string;
      minTxVolume?: string;
      maxTxVolume?: string;
      cursor?: string;
      limit?: number;
    },
    opts?: CallOptions,
  ) {
    return this.client.call(marketEndpoints.leaderboard, { query: { ...params } }, opts);
  }

  /** `trackerType`: 1=Smart Money, 2=KOL, 3=custom list (`walletAddress` required, ≤20). */
  trackedTrades(
    params: {
      trackerType: "1" | "2" | "3";
      walletAddress?: readonly string[] | string;
      tradeType?: string;
      binanceChainId?: string;
      minVolume?: string;
      maxVolume?: string;
      minMarketCap?: string;
      maxMarketCap?: string;
      isHideRiskToken?: boolean;
      limit?: number;
    },
    opts?: CallOptions,
  ) {
    return this.client.call(marketEndpoints.trackedTrades, { query: { ...params } }, opts);
  }

  /** GET /wss/auth/token — JWT for wss://web3-stream.binance.com/w3w/stream?token=… */
  wsAuthToken(opts?: CallOptions) {
    return this.client.call(marketEndpoints.wsAuthToken, {}, opts);
  }
}
