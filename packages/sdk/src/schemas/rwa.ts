/**
 * Documented response schemas — rwa. GENERATED, then reviewed; do not hand-edit field lists.
 *
 * Transcribed from the docs' OpenAPI document (web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/1.0.0/schema.json,
 * rendered at catalog/web3-wallet/api/rest-api/{rwa-data}) via the operation models of the official connector
 * @binance-web3/wallet@13.0.1, which is generated from the same spec (identical operationIds). Every object is
 * .passthrough() so undocumented fields survive; telemetry reports them as doc drift.
 */
import { z } from "zod";

export const RwaChainDistribution = z
  .object({
    /** Unique chain identifier (e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana). */
    binanceChainId: z.string().optional(),
    /** Number of RWA tokens on this chain (the same underlying asset deployed on different chains is counted separately). */
    tokenCount: z.number().optional(),
  })
  .passthrough();

export const RwaPlatform = z
  .object({
    /** Unique platform identifier. Examples: ondo=Ondo Finance, bstock=bStocks. */
    platformId: z.string().optional(),
    /** Number of underlying assets corresponding to the RWA tokens. */
    tickerCount: z.number().optional(),
    /** RWA token distribution across chains. */
    chainDistribution: z.array(RwaChainDistribution).optional(),
    /** Platform official website. Null when unavailable. */
    website: z.string().nullable().optional(),
    /** Platform logo URL. Null when unavailable. */
    logoUrl: z.string().nullable().optional(),
  })
  .passthrough();

export const RwaTokenPrice = z
  .object({
    /** Unique chain identifier (e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana). */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Unique platform identifier. */
    platformId: z.string().optional(),
    /** On-chain token price (USD). */
    tokenPrice: z.string().optional(),
    /** Underlying reference price (USD). A per-share converted price derived from the on-chain token price, not an official quote from the traditional stock market. */
    referencePrice: z.string().optional(),
    /** Token price last updated time, Unix millisecond timestamp. */
    tokenPriceUpdatedAt: z.number().optional(),
  })
  .passthrough();

export const RwaSearchAsset = z
  .object({
    /** Unique platform identifier. */
    platformId: z.string().optional(),
    /** Unique chain identifier (e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana). */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Asset type. 1=Stock, 2=Pre-IPO, 3=ETF. */
    assetType: z.number().optional(),
  })
  .passthrough();

export const RwaSearchResult = z
  .object({
    /** Matched stock ticker symbol. */
    ticker: z.string().optional(),
    /** Company English name. */
    companyName: z.string().optional(),
    /** Tokenized assets for this ticker across platforms and chains. */
    assets: z.array(RwaSearchAsset).optional(),
  })
  .passthrough();

export const RwaCompanyInfo = z
  .object({
    /** CEO name. */
    ceo: z.string().nullable().optional(),
    /** Company official website. */
    website: z.string().nullable().optional(),
    /** Industry (English). */
    industry: z.string().nullable().optional(),
    /** Concept/sector tags (English). */
    conceptsEn: z.array(z.string()).nullable().optional(),
    /** Concept/sector tags (Chinese). */
    conceptsCn: z.array(z.string()).nullable().optional(),
    /** Company description (English). */
    descriptionEn: z.string().nullable().optional(),
    /** Company description (Chinese). */
    descriptionZh: z.string().nullable().optional(),
  })
  .passthrough();

export const RwaProtection = z
  .object({
    /** Whether this protection is supported. */
    supported: z.boolean().optional(),
    /** URL to related report or proof. */
    url: z.string().nullable().optional(),
  })
  .passthrough();

export const RwaUnderlyingProfile = z
  .object({
    /** Unique chain identifier (e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana). */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Unique platform identifier. */
    platformId: z.string().optional(),
    /** Underlying asset ticker symbol. */
    underlyingTicker: z.string().optional(),
    /** Underlying asset full name. */
    underlyingFullName: z.string().optional(),
    /** Asset type. 1=Stock, 2=Pre-IPO, 3=ETF. */
    assetType: z.number().optional(),
    /** Token-to-share exchange ratio. E.g. "1.003701" means 1 token ≈ 1.003701 underlying shares. */
    tokenToShareRatio: z.string().optional(),
    /** Investor protection mechanisms, keyed by mechanism type. Each entry includes whether it is supported and a related proof/report link. Known keys: dailyAttestationReport, monthlyAttestationReport, collateralReport. New ke… */
    protections: z.record(z.string(), RwaProtection).optional(),
    companyInfo: RwaCompanyInfo.nullable().optional(),
  })
  .passthrough();

export const RwaStatusInfo = z
  .object({
    /** Whether the underlying market is currently tradable. */
    openState: z.boolean().optional(),
    /** Current market status: premarket, regular (normal hours), postmarket, overnight, closed, or pause (trading halt/circuit breaker). */
    marketStatus: z.string().optional(),
    /** Reason code when the market is not tradable (returned when openState=false). Market-level: MARKET_CLOSED (closed), MARKET_PAUSED (whole market paused), MARKET_MAINTENANCE (system maintenance). Asset-level: ASSET_PAUSED (… */
    reasonCode: z.string().nullable().optional(),
    /** Human-readable reason when the market is not tradable. Common case e.g. "Weekend or Holiday". For ASSET_PAUSED (corporate actions): cash_dividend, stock_dividend, stock_split, merger, acquisition, spinoff, maintenance, c… */
    reasonMsg: z.string().nullable().optional(),
    /** Expected next market open time, Unix millisecond timestamp. */
    nextOpenTime: z.number().nullable().optional(),
    /** Expected next market close time, Unix millisecond timestamp. */
    nextCloseTime: z.number().nullable().optional(),
  })
  .passthrough();

export const RwaToken = z
  .object({
    /** Unique chain identifier (e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana). */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Unique platform identifier. */
    platformId: z.string().optional(),
    /** Asset type. 1=Stock, 2=Pre-IPO, 3=ETF. */
    assetType: z.number().optional(),
    /** Token full name. */
    tokenName: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Token logo URL. */
    tokenLogoUrl: z.string().optional(),
    /** Token decimals. */
    decimals: z.string().optional(),
    /** Underlying asset ticker symbol. */
    underlyingTicker: z.string().optional(),
    /** Underlying company English name. */
    underlyingName: z.string().optional(),
    /** Underlying company Chinese name. Falls back to English if unavailable. */
    underlyingNameZh: z.string().nullable().optional(),
    /** Token-to-share exchange ratio. E.g. "1.003701" means 1 token ≈ 1.003701 underlying shares. */
    tokenToShareRatio: z.string().optional(),
    /** Token tag array. Enum: alpha, communityRecognized, volumeSurge, volumePlunge. */
    tags: z.array(z.string()).nullable().optional(),
    statusInfo: RwaStatusInfo.optional(),
    /** On-chain token price (USD). */
    tokenPrice: z.string().optional(),
    /** Underlying reference price (USD). A per-share converted price derived from the on-chain token price, not an official quote from the traditional stock market. */
    referencePrice: z.string().optional(),
    /** 24-hour trading volume (USD). */
    volume24H: z.string().optional(),
    /** Market capitalization (USD). */
    marketCap: z.string().optional(),
    /** Price-to-Earnings ratio (TTM). Null when unavailable. */
    peRatioTTM: z.string().nullable().optional(),
  })
  .passthrough();

export const RwaMarketStatusInfo = z
  .object({
    /** Whether the underlying market is currently tradable. */
    openState: z.boolean().optional(),
    /** Current market status: premarket, regular (normal hours), postmarket, overnight, closed, or pause (trading halt/circuit breaker). */
    marketStatus: z.string().optional(),
    /** Reason code when the market is not tradable (returned when openState=false). Market-level: MARKET_CLOSED (closed), MARKET_PAUSED (whole market paused), MARKET_MAINTENANCE (system maintenance). Asset-level: ASSET_PAUSED (… */
    reasonCode: z.string().nullable().optional(),
    /** Human-readable reason when the market is not tradable. Common case e.g. "Weekend or Holiday". For ASSET_PAUSED (corporate actions): cash_dividend, stock_dividend, stock_split, merger, acquisition, spinoff, maintenance, c… */
    reasonMsg: z.string().nullable().optional(),
    /** Expected next market open time, Unix millisecond timestamp. */
    nextOpenTime: z.number().nullable().optional(),
    /** Expected next market close time, Unix millisecond timestamp. */
    nextCloseTime: z.number().nullable().optional(),
  })
  .passthrough();

export const RwaMarketData = z
  .object({
    /** Underlying reference price (USD). A per-share converted price derived from the on-chain token price, not an official quote from the traditional stock market. */
    referencePrice: z.string().optional(),
    /** 52-week high price. Applicable to Stock and ETF only. */
    high52W: z.string().optional(),
    /** 52-week low price. Applicable to Stock and ETF only. */
    low52W: z.string().optional(),
    /** 24-hour trading volume in shares. */
    volumeShares24H: z.string().optional(),
    /** 1-year average daily volume. Applicable to Stock and ETF only. */
    avgDailyVolume1Y: z.string().optional(),
    /** Total outstanding shares (Stock) or total units (ETF). Applicable to Stock and ETF only. */
    totalShares: z.string().optional(),
    /** Market capitalization (USD) for Stock/ETF, or implied total valuation for Pre-IPO. */
    marketCap: z.string().optional(),
    /** Turnover rate. "23.81" means 23.81%. Applicable to Stock and ETF only. */
    turnoverRate: z.string().optional(),
    /** Price amplitude (intraday). "3.05" means 3.05%, i.e. (intraday high − low) / previous close. Applicable to Stock and ETF only. */
    amplitude: z.string().nullable().optional(),
    /** Price-to-Earnings ratio (TTM = Trailing Twelve Months, based on earnings of the most recent 12 months). Applicable to Stock only. */
    peRatioTTM: z.string().nullable().optional(),
    /** Price-to-Book ratio. Applicable to Stock only. */
    pbRatio: z.string().nullable().optional(),
    /** Dividend yield. "0.85" means 0.85%. Applicable to Stock and ETF only. */
    dividendYield: z.string().nullable().optional(),
    /** Latest dividend amount (USD). Applicable to Stock and ETF only. */
    latestDividend: z.string().nullable().optional(),
  })
  .passthrough();

export const RwaUnderlyingMarket = z
  .object({
    /** Unique chain identifier (e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana). */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Unique platform identifier. */
    platformId: z.string().optional(),
    /** Asset type. 1=Stock, 2=Pre-IPO, 3=ETF. */
    assetType: z.number().optional(),
    statusInfo: RwaMarketStatusInfo.optional(),
    marketData: RwaMarketData.optional(),
  })
  .passthrough();
