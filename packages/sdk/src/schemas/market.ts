/**
 * Documented response schemas — market. GENERATED, then reviewed; do not hand-edit field lists.
 *
 * Transcribed from the docs' OpenAPI document (web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/1.0.0/schema.json,
 * rendered at catalog/web3-wallet/api/rest-api/{general-data, address-portfolio, web-socket-api}) via the operation models of the official connector
 * @binance-web3/wallet@13.0.1, which is generated from the same spec (identical operationIds). Every object is
 * .passthrough() so undocumented fields survive; telemetry reports them as doc drift.
 */
import { z } from "zod";

export const MarketChain = z
  .object({
    /** Unique chain identifier. */
    binanceChainId: z.string().optional(),
    /** Full chain name. */
    name: z.string().optional(),
    /** Short chain name. */
    shortName: z.string().optional(),
    /** Chain logo image URL. */
    logoUrl: z.string().optional(),
    /** Whether addresses on this chain are case-sensitive. */
    caseSensitive: z.boolean().optional(),
    /** Symbol of the chain's native asset. */
    nativeTokenSymbol: z.string().optional(),
    /** Native token decimals. */
    nativeTokenDecimals: z.number().optional(),
  })
  .passthrough();

export const TokenPrice = z
  .object({
    /** Unique chain identifier. */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Latest USD price of the token. */
    price: z.string().optional(),
    /** Token price observation time, Unix millisecond timestamp. */
    time: z.number().optional(),
  })
  .passthrough();

export const TokenTradingInfo = z
  .object({
    /** Chain unique identifier. */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Latest token price, denominated in USD. */
    price: z.string().optional(),
    /** Token price observation time, Unix millisecond timestamp. */
    time: z.number().optional(),
    /** Token market cap, denominated in USD. */
    marketCap: z.string().optional(),
    /** 5-minute price change percentage. "0.12" means a 0.12% increase. */
    priceChange5M: z.string().optional(),
    /** 1-hour price change percentage. "1.05" means a 1.05% increase. */
    priceChange1H: z.string().optional(),
    /** 4-hour price change percentage. "2.30" means a 2.30% increase. */
    priceChange4H: z.string().optional(),
    /** 24-hour price change percentage. "-0.85" means a 0.85% decrease. */
    priceChange24H: z.string().optional(),
    /** Trading volume in the last 5 minutes, denominated in USD. */
    volume5M: z.string().optional(),
    /** Trading volume in the last 1 hour, denominated in USD. */
    volume1H: z.string().optional(),
    /** Trading volume in the last 4 hours, denominated in USD. */
    volume4H: z.string().optional(),
    /** Trading volume in the last 24 hours, denominated in USD. */
    volume24H: z.string().optional(),
    /** Buy volume in the last 5 minutes, denominated in USD. */
    buyVolume5M: z.string().optional(),
    /** Buy volume in the last 1 hour, denominated in USD. */
    buyVolume1H: z.string().optional(),
    /** Buy volume in the last 4 hours, denominated in USD. */
    buyVolume4H: z.string().optional(),
    /** Buy volume in the last 24 hours, denominated in USD. */
    buyVolume24H: z.string().optional(),
    /** Sell volume in the last 5 minutes, denominated in USD. */
    sellVolume5M: z.string().optional(),
    /** Sell volume in the last 1 hour, denominated in USD. */
    sellVolume1H: z.string().optional(),
    /** Sell volume in the last 4 hours, denominated in USD. */
    sellVolume4H: z.string().optional(),
    /** Sell volume in the last 24 hours, denominated in USD. */
    sellVolume24H: z.string().optional(),
    /** Number of transactions in the last 5 minutes. */
    txs5M: z.number().optional(),
    /** Number of transactions in the last 1 hour. */
    txs1H: z.number().optional(),
    /** Number of transactions in the last 4 hours. */
    txs4H: z.number().optional(),
    /** Number of transactions in the last 24 hours. */
    txs24H: z.number().optional(),
    /** Number of buy transactions in the last 5 minutes. */
    buyTxs5M: z.number().optional(),
    /** Number of buy transactions in the last 1 hour. */
    buyTxs1H: z.number().optional(),
    /** Number of buy transactions in the last 4 hours. */
    buyTxs4H: z.number().optional(),
    /** Number of buy transactions in the last 24 hours. */
    buyTxs24H: z.number().optional(),
    /** Number of sell transactions in the last 5 minutes. */
    sellTxs5M: z.number().optional(),
    /** Number of sell transactions in the last 1 hour. */
    sellTxs1H: z.number().optional(),
    /** Number of sell transactions in the last 4 hours. */
    sellTxs4H: z.number().optional(),
    /** Number of sell transactions in the last 24 hours. */
    sellTxs24H: z.number().optional(),
    /** 24-hour high price, denominated in USD. */
    maxPrice: z.string().optional(),
    /** 24-hour low price, denominated in USD. */
    minPrice: z.string().optional(),
    /** Current circulating supply of the token. */
    circSupply: z.string().optional(),
    /** Token liquidity, denominated in USD. */
    liquidity: z.string().optional(),
    /** Number of holding addresses. */
    holders: z.number().optional(),
    /** Trading volume from Binance MPC wallets via Binance Web3 DEX in the last 5 minutes, denominated in USD. */
    bnVolume5M: z.string().optional(),
    /** Trading volume from Binance MPC wallets via Binance Web3 DEX in the last 1 hour, denominated in USD. */
    bnVolume1H: z.string().optional(),
    /** Trading volume from Binance MPC wallets via Binance Web3 DEX in the last 4 hours, denominated in USD. */
    bnVolume4H: z.string().optional(),
    /** Trading volume from Binance MPC wallets via Binance Web3 DEX in the last 24 hours, denominated in USD. */
    bnVolume24H: z.string().optional(),
    /** Buy volume from Binance MPC wallets via Binance Web3 DEX in the last 5 minutes, denominated in USD. */
    bnBuyVolume5M: z.string().optional(),
    /** Buy volume from Binance MPC wallets via Binance Web3 DEX in the last 1 hour, denominated in USD. */
    bnBuyVolume1H: z.string().optional(),
    /** Buy volume from Binance MPC wallets via Binance Web3 DEX in the last 4 hours, denominated in USD. */
    bnBuyVolume4H: z.string().optional(),
    /** Buy volume from Binance MPC wallets via Binance Web3 DEX in the last 24 hours, denominated in USD. */
    bnBuyVolume24H: z.string().optional(),
    /** Sell volume from Binance MPC wallets via Binance Web3 DEX in the last 5 minutes, denominated in USD. */
    bnSellVolume5M: z.string().optional(),
    /** Sell volume from Binance MPC wallets via Binance Web3 DEX in the last 1 hour, denominated in USD. */
    bnSellVolume1H: z.string().optional(),
    /** Sell volume from Binance MPC wallets via Binance Web3 DEX in the last 4 hours, denominated in USD. */
    bnSellVolume4H: z.string().optional(),
    /** Sell volume from Binance MPC wallets via Binance Web3 DEX in the last 24 hours, denominated in USD. */
    bnSellVolume24H: z.string().optional(),
    /** Number of transactions from Binance MPC wallets via Binance Web3 DEX in the last 5 minutes. */
    bnTxs5M: z.number().optional(),
    /** Number of transactions from Binance MPC wallets via Binance Web3 DEX in the last 1 hour. */
    bnTxs1H: z.number().optional(),
    /** Number of transactions from Binance MPC wallets via Binance Web3 DEX in the last 4 hours. */
    bnTxs4H: z.number().optional(),
    /** Number of transactions from Binance MPC wallets via Binance Web3 DEX in the last 24 hours. */
    bnTxs24H: z.number().optional(),
    /** Number of buy transactions from Binance MPC wallets via Binance Web3 DEX in the last 5 minutes. */
    bnBuyTxs5M: z.number().optional(),
    /** Number of buy transactions from Binance MPC wallets via Binance Web3 DEX in the last 1 hour. */
    bnBuyTxs1H: z.number().optional(),
    /** Number of buy transactions from Binance MPC wallets via Binance Web3 DEX in the last 4 hours. */
    bnBuyTxs4H: z.number().optional(),
    /** Number of buy transactions from Binance MPC wallets via Binance Web3 DEX in the last 24 hours. */
    bnBuyTxs24H: z.number().optional(),
    /** Number of sell transactions from Binance MPC wallets via Binance Web3 DEX in the last 5 minutes. */
    bnSellTxs5M: z.number().optional(),
    /** Number of sell transactions from Binance MPC wallets via Binance Web3 DEX in the last 1 hour. */
    bnSellTxs1H: z.number().optional(),
    /** Number of sell transactions from Binance MPC wallets via Binance Web3 DEX in the last 4 hours. */
    bnSellTxs4H: z.number().optional(),
    /** Number of sell transactions from Binance MPC wallets via Binance Web3 DEX in the last 24 hours. */
    bnSellTxs24H: z.number().optional(),
  })
  .passthrough();

export const TagInfo = z
  .object({
    /** True indicates the token is listed on major centralized exchanges or widely recognized by the community. */
    isRecognized: z.boolean().nullable().optional(),
  })
  .passthrough();

export const TokenSearchResult = z
  .object({
    /** Chain identifier. */
    binanceChainId: z.string().optional(),
    /** Token full name. */
    tokenName: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Token logo link. Null when no logo is available. */
    tokenLogoUrl: z.string().nullable().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Token decimals. */
    decimals: z.number().optional(),
    /** Block explorer link for the token. */
    explorerUrl: z.string().optional(),
    /** 24-hour price change. "-5.23" means a 5.23% decrease. Null when no data. */
    change: z.string().nullable().optional(),
    /** Number of holder addresses. */
    holders: z.string().optional(),
    /** Token liquidity, denominated in USD. */
    liquidity: z.string().optional(),
    /** Token market cap, denominated in USD. */
    marketCap: z.string().optional(),
    /** Latest token price, denominated in USD. */
    price: z.string().optional(),
    tagList: TagInfo.optional(),
  })
  .passthrough();

export const TokenTagInformation = z
  .object({
    /** True indicates the token is listed on major centralized exchanges or widely recognized by the community. */
    isRecognized: z.boolean().nullable().optional(),
  })
  .passthrough();

export const TokenBasicInfo = z
  .object({
    /** Unique identifier of the chain. */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Token full name. */
    tokenName: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Token logo link. Null when no logo is available. */
    tokenLogoUrl: z.string().nullable().optional(),
    /** Token decimals. */
    decimals: z.number().optional(),
    /** Token creator wallet address. */
    creatorAddress: z.string().optional(),
    /** Token creation time, Unix millisecond timestamp. */
    createTime: z.number().optional(),
    tagList: TokenTagInformation.optional(),
  })
  .passthrough();

export const TokenAdvancedInfo = z
  .object({
    /** Unique chain identifier. */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Whether the token is internal to the platform. 0 = no, 1 = yes. */
    isInternal: z.number().optional(),
    /** Protocol ID the token belongs to. Null when no protocol is associated. */
    protocolId: z.number().nullable().optional(),
    /** Token launch progress for inner-market tokens, range 0–100. */
    progress: z.string().nullable().optional(),
    /** Token creation time, Unix millisecond timestamp. */
    createTime: z.number().optional(),
    /** Token creator wallet address. */
    creatorAddress: z.string().optional(),
    /** Total tokens the developer has ever created. */
    devCreatedTokenCount: z.number().optional(),
    /** Total tokens the developer has successfully launched (migrated). */
    devMigratedTokenCount: z.number().optional(),
    /** Developer launch success rate. "53.5" means 53.5%. */
    devMigratedTokenPercent: z.string().optional(),
    /** Top 10 addresses combined holding percentage. "40.08" means 40.08%. */
    top10HoldingPercent: z.string().optional(),
    /** Developer holding percentage. "5.23" means 5.23%. */
    devHoldingPercent: z.string().optional(),
    /** Smart money holding percentage. "2.15" means 2.15%. */
    smartMoneyHoldingPercent: z.string().optional(),
    /** KOL holding percentage. "1.5" means 1.5%. */
    kolHoldingPercent: z.string().optional(),
    /** Bundler holding percentage. "12.3" means 12.3%. */
    bundlerHoldingPercent: z.string().optional(),
    /** Professional holder percentage. "4.2" means 4.2%. */
    proHoldingPercent: z.string().optional(),
    /** Fresh wallet holding percentage. "3.8" means 3.8%. */
    freshWalletHoldingPercent: z.string().optional(),
    /** Sniper holding percentage. "3.1" means 3.1%. */
    sniperHoldingPercent: z.string().optional(),
    /** Insider holding percentage. "2.5" means 2.5%. */
    insiderHoldingPercent: z.string().optional(),
    /** Number of holding addresses. */
    holders: z.number().optional(),
    /** Number of Binance MPC wallets holding this token. */
    bnHolderCount: z.number().optional(),
    /** Number of Binance MPC wallets that traded via Binance Web3 DEX in the last 7 days. */
    bnTraderCount7D: z.number().optional(),
    /** Token tags. Returns tags matched by the token. Possible values:  - `alpha` — Binance Alpha - `tge` — Binance TGE - `communityRecognized` — Highly recognized by community - `devSellAll` — Developer sold entire holding - `… */
    tokenTags: z.array(z.string()).optional(),
  })
  .passthrough();

export const HotToken = z
  .object({
    /** Unique identifier of the chain. */
    binanceChainId: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Token logo URL. */
    tokenLogoUrl: z.string().nullable().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Market cap, denominated in USD. */
    marketCap: z.string().optional(),
    /** Trading volume within the specified time, denominated in USD. */
    volume: z.string().optional(),
    /** Price change percentage within the specified time. "-5.23" means a 5.23% decrease. */
    change: z.string().optional(),
    /** Number of unique trading addresses. */
    uniqueTraders: z.string().optional(),
    /** Buy transaction count. */
    buyTxs: z.string().optional(),
    /** Sell transaction count. */
    sellTxs: z.string().optional(),
    /** Total transaction count. */
    txs: z.string().optional(),
    /** Liquidity, denominated in USD. */
    liquidity: z.string().optional(),
    /** Token price, denominated in USD. */
    price: z.string().optional(),
    /** Holder count. */
    holders: z.string().optional(),
    /** Net inflow, denominated in USD. Positive means net inflow, negative means net outflow. */
    inflowUsd: z.string().optional(),
    /** Developer holding percentage. "5.23" means 5.23%. */
    devHoldingPercent: z.string().optional(),
    /** Number of Binance MPC wallets holding this token. */
    bnHolderCount: z.string().optional(),
    /** Top 10 addresses holding percentage. "35.2" means 35.2%. */
    top10HoldingPercent: z.string().optional(),
    /** Sniper holding percentage. "8.3" means 8.3%. */
    sniperHoldingPercent: z.string().optional(),
    /** Professional holder percentage. "12.1" means 12.1%. */
    proHoldingPercent: z.string().optional(),
    /** Fresh wallet holding percentage. "3.5" means 3.5%. */
    freshWalletHoldingPercent: z.string().optional(),
    /** Smart money holding percentage. "1.52" means 1.52%. */
    smartMoneyHoldingPercent: z.string().optional(),
    /** KOL holding percentage. "6.5" means 6.5%. */
    kolHoldingPercent: z.string().optional(),
    /** Insider holding percentage. "2.8" means 2.8%. */
    insiderHoldingPercent: z.string().optional(),
    /** Bundler holding percentage. "6.2" means 6.2%. */
    bundlerHoldingPercent: z.string().optional(),
    /** Developer-created token count. */
    devCreatedTokenCount: z.string().optional(),
    /** Developer-migrated token count. */
    devMigratedTokenCount: z.string().optional(),
    /** Developer migrated token percentage. "33.3" means 33.3%. */
    devMigratedTokenPercent: z.string().optional(),
    /** Token tags. */
    tokenTags: z.array(z.string()).optional(),
  })
  .passthrough();

export const HotTokenPage = z
  .object({
    /** Current page number. Null when no more data is available. */
    page: z.number().nullable().optional(),
    /** Hot token list. */
    items: z.array(HotToken).optional(),
  })
  .passthrough();

export const FundingSourceLabel = z
  .object({
    /** Tag category name. */
    tagName: z.string().optional(),
    /** Tag value. */
    tagValue: z.string().optional(),
  })
  .passthrough();

export const TokenHolder = z
  .object({
    /** Holder wallet address. */
    holderWalletAddress: z.string().optional(),
    /** Current holding amount. */
    holdAmount: z.string().optional(),
    /** Holding percentage. "5.23" means 5.23%. */
    holdingPercent: z.string().optional(),
    /** Native token symbol. */
    nativeTokenSymbol: z.string().optional(),
    /** Native token balance of the address. */
    nativeTokenBalance: z.string().optional(),
    /** Total buy amount. */
    boughtAmount: z.string().optional(),
    /** Average buy price, denominated in USD. */
    avgBuyPrice: z.string().optional(),
    /** Cumulative sold amount (token units). */
    soldAmount: z.string().optional(),
    /** Average sell price, denominated in USD. */
    avgSellPrice: z.string().optional(),
    /** Maximum historical holding amount. */
    maxHoldAmount: z.string().optional(),
    /** Time of the holder's last trade of this token, Unix millisecond timestamp. */
    lastTradeTime: z.number().optional(),
    /** Realized PnL, denominated in USD. Positive means profit, negative means loss. */
    realizedPnlUsd: z.string().optional(),
    /** Funding source address, i.e., the originator of the first inbound native-token transfer. Null when no inbound transfer is recorded. */
    fundingSource: z.string().nullable().optional(),
    fundingSourceLabel: FundingSourceLabel.nullable().optional(),
    /** Transaction hash of the first inbound native-token transfer. */
    fundingSourceHash: z.string().nullable().optional(),
    /** Time of the first native token inbound transfer, Unix millisecond timestamp. */
    fundingSourceTime: z.number().nullable().optional(),
    /** Amount of the first native token inbound transfer. e.g. 0.5 means 0.5 ETH. */
    fundingSourceAmount: z.string().nullable().optional(),
  })
  .passthrough();

export const TopTrader = z
  .object({
    /** Trader wallet address. */
    holderWalletAddress: z.string().optional(),
    /** Current holding amount. */
    holdAmount: z.string().optional(),
    /** Current holding percentage. "3.5" means 3.5%. */
    holdingPercent: z.string().optional(),
    /** Total bought amount (token units). */
    boughtAmount: z.string().optional(),
    /** Average buy price, denominated in USD. */
    avgBuyPrice: z.string().optional(),
    /** Total sold amount (token units). */
    soldAmount: z.string().optional(),
    /** Average sell price, denominated in USD. */
    avgSellPrice: z.string().optional(),
    /** Maximum historical holding amount. */
    maxHoldAmount: z.string().optional(),
    /** Time of the holder's last trade of this token, Unix millisecond timestamp. */
    lastTradeTime: z.number().optional(),
    /** Realized PnL, denominated in USD. Positive means profit, negative means loss. */
    realizedPnlUsd: z.string().optional(),
    /** Funding source address, i.e., the originator of the first inbound native-token transfer. Null when no inbound transfer is recorded. */
    fundingSource: z.string().nullable().optional(),
    fundingSourceLabel: FundingSourceLabel.nullable().optional(),
    /** Transaction hash of the first inbound native-token transfer. */
    fundingSourceHash: z.string().nullable().optional(),
    /** Time of the first native token inbound transfer, Unix millisecond timestamp. */
    fundingSourceTime: z.number().nullable().optional(),
    /** Amount of the first native token inbound transfer. e.g. 0.5 means 0.5 ETH. */
    fundingSourceAmount: z.string().nullable().optional(),
  })
  .passthrough();

export const PoolTokenAmount = z
  .object({
    /** Token amount in the pool. */
    tokenAmount: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Token full name. */
    tokenName: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Token logo link. Null when no logo. */
    tokenLogoUrl: z.string().nullable().optional(),
  })
  .passthrough();

export const LiquidityPool = z
  .object({
    /** Pool name, e.g. "PEPE/WETH". */
    pool: z.string().optional(),
    /** DEX protocol name. Null when unknown. */
    protocolName: z.string().nullable().optional(),
    /** Protocol logo link. Null when no logo. */
    protocolLogoUrl: z.string().nullable().optional(),
    /** Pool liquidity, denominated in USD. */
    liquidityUsd: z.string().optional(),
    /** Pool contract address. */
    poolAddress: z.string().optional(),
    /** Detailed information for each token in the pool. */
    liquidityAmount: z.array(PoolTokenAmount).optional(),
  })
  .passthrough();

export const TradeChangedToken = z
  .object({
    /** Token amount traded. */
    amount: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
  })
  .passthrough();

export const TokenTrade = z
  .object({
    /** Chain identifier. */
    binanceChainId: z.string().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** On-chain transaction hash. */
    txHash: z.string().optional(),
    /** Trader wallet address. */
    userAddress: z.string().optional(),
    /** Name of the DEX protocol where the trade was executed. */
    dexName: z.string().optional(),
    /** Trade direction relative to the queried token. "buy" or "sell". */
    type: z.string().optional(),
    /** Trade price, denominated in USD. */
    price: z.string().optional(),
    /** Trade amount, denominated in USD. */
    volume: z.string().optional(),
    /** Trade time, Unix millisecond timestamp. */
    time: z.number().optional(),
    /** Token details involved in this trade. [0] = queried token; [1] = paired token. */
    changedTokenInfo: z.array(TradeChangedToken).optional(),
  })
  .passthrough();

export const TokenTradesPage = z
  .object({
    /** Cursor for the next page. Empty string when no more data. */
    cursor: z.string().optional(),
    /** Trades sorted by trade time (descending). */
    trades: z.array(TokenTrade).optional(),
  })
  .passthrough();

export const DevLaunchedInfo = z
  .object({
    /** Total number of tokens launched by this developer via launch platforms. */
    totalToken: z.string().optional(),
    /** Number of tokens successfully migrated to external DEX by this developer. */
    migratedCount: z.string().optional(),
  })
  .passthrough();

export const DevHoldingInfo = z
  .object({
    /** Developer's current holding percentage for this token. No percent sign included. Empty string means fully sold. */
    devHoldingPercent: z.string().optional(),
    /** Developer (creator) wallet address. */
    devAddress: z.string().optional(),
    /** Funding source address — the originator of the first inbound native-token transfer. Empty string when no inbound transfer is recorded. */
    fundingSource: z.string().optional(),
    /** Funding source name (e.g. exchange name). Empty string when unknown. */
    fundingSourceLabel: z.string().optional(),
    /** Transaction hash of the first inbound native-token transfer. */
    fundingSourceHash: z.string().optional(),
    /** Timestamp of the first inbound native-token transfer, Unix millisecond timestamp. */
    fundingSourceTime: z.string().optional(),
    /** Amount of the first inbound native-token transfer (native token units). */
    fundingSourceAmount: z.string().optional(),
    /** Developer wallet's native token balance (e.g. SOL). Empty string when unavailable. */
    devBalance: z.string().optional(),
  })
  .passthrough();

export const TokenDevInfo = z
  .object({
    devLaunchedInfo: DevLaunchedInfo.optional(),
    devHoldingInfo: DevHoldingInfo.optional(),
  })
  .passthrough();

export const PortfolioChain = z
  .object({
    /** Unique chain identifier (e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana). */
    binanceChainId: z.string().optional(),
    /** Full chain name. */
    name: z.string().optional(),
    /** Short chain name (uppercase). */
    shortName: z.string().optional(),
    /** Chain logo image URL. */
    logoUrl: z.string().optional(),
    /** Whether addresses on this chain are case-sensitive. true=case-sensitive (e.g. Solana), false=case-insensitive (e.g. EVM chains). */
    caseSensitive: z.boolean().optional(),
    /** Symbol of the chain's native asset (uppercase). */
    nativeTokenSymbol: z.string().optional(),
    /** Native token decimals. Display value = raw value / 10^nativeTokenDecimals. */
    nativeTokenDecimals: z.number().optional(),
  })
  .passthrough();

export const DailyPnl = z
  .object({
    /** Date in YYYY-MM-DD format. */
    date: z.string().optional(),
    /** Realized PnL for this day, denominated in USD. Positive means profit, negative means loss. */
    pnlUsd: z.string().optional(),
  })
  .passthrough();

export const TokenCountByPnlPercent = z
  .object({
    /** Number of tokens with realized PnL ≥500%. */
    over500Percent: z.string().optional(),
    /** Number of tokens with realized PnL in [200%, 500%). */
    from200To500Percent: z.string().optional(),
    /** Number of tokens with realized PnL in [50%, 200%). */
    from50To200Percent: z.string().optional(),
    /** Number of tokens with realized PnL in [0%, 50%). */
    zeroTo50Percent: z.string().optional(),
    /** Number of tokens with realized PnL in [-50%, 0%). */
    zeroToMinus50Percent: z.string().optional(),
    /** Number of tokens with realized PnL < -50%. */
    overMinus50Percent: z.string().optional(),
  })
  .passthrough();

export const TopPnlToken = z
  .object({
    /** Token contract address. EVM addresses are lowercase; Solana addresses are case-sensitive. */
    tokenContractAddress: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Realized PnL for this token, denominated in USD. Positive means profit, negative means loss. */
    tokenPnLUsd: z.string().optional(),
    /** Realized PnL percentage for this token. No percent sign included. */
    tokenPnLPercent: z.string().optional(),
  })
  .passthrough();

export const PortfolioOverview = z
  .object({
    /** Total realized PnL within the time frame, denominated in USD. Positive means profit, negative means loss. */
    realizedPnlUsd: z.string().optional(),
    /** Realized PnL percentage within the time frame. "16.44" means +16.44%. No percent sign included. */
    realizedPnlPercent: z.string().optional(),
    /** Daily realized PnL breakdown, sorted by date descending (most recent first). Number of entries matches the timeFrame. */
    dailyPnl: z.array(DailyPnl).optional(),
    /** Win rate within the time frame. "61.11" means 61.11%. No percent sign included. */
    winRate: z.string().optional(),
    tokenCountByPnlPercent: TokenCountByPnlPercent.optional(),
    /** Number of buy transactions within the time frame. */
    buyTxCount: z.string().optional(),
    /** Number of sell transactions within the time frame. */
    sellTxCount: z.string().optional(),
    /** Total number of distinct tokens traded within the time frame. */
    totalTokenCount: z.string().optional(),
    /** Total buy volume within the time frame, denominated in USD. */
    buyTxVolume: z.string().optional(),
    /** Total sell volume within the time frame, denominated in USD. */
    sellTxVolume: z.string().optional(),
    /** Average buy value per transaction within the time frame, denominated in USD. */
    avgBuyValueUsd: z.string().optional(),
    /** Total realized PnL of the top 3 profit tokens, denominated in USD. */
    top3PnlTokenSumUsd: z.string().optional(),
    /** Percentage of total realized PnL contributed by the top 3 profit tokens. No percent sign included. */
    top3PnlTokenPercent: z.string().optional(),
    /** Top 3 tokens by realized PnL. Returns fewer items if fewer than 3 tokens were traded. */
    topPnlTokenList: z.array(TopPnlToken).optional(),
  })
  .passthrough();

export const TokenPositionDuration = z
  .object({
    /** Timestamp of the first buy for this token, Unix millisecond timestamp. */
    holdingTimestamp: z.string().optional(),
  })
  .passthrough();

export const RecentPnl = z
  .object({
    /** Unique chain identifier. */
    binanceChainId: z.string().optional(),
    /** Token contract address. EVM addresses are lowercase; Solana addresses are case-sensitive. */
    tokenContractAddress: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Timestamp of the last transaction for this token, Unix millisecond timestamp. */
    lastActiveTimestamp: z.string().optional(),
    /** Realized PnL for this token, denominated in USD. Positive means profit, negative means loss. */
    realizedPnlUsd: z.string().optional(),
    /** Realized PnL percentage for this token. No percent sign included. */
    realizedPnlPercent: z.string().optional(),
    /** Current market value of the address's holding in this token, denominated in USD. */
    tokenBalanceUsd: z.string().optional(),
    /** Current holding amount of this token (token units). */
    tokenBalanceAmount: z.string().optional(),
    tokenPositionDuration: TokenPositionDuration.optional(),
    /** Number of buy transactions for this token. */
    buyTxCount: z.string().optional(),
    /** Total buy spend for this token, denominated in USD. */
    buyTxVolume: z.string().optional(),
    /** Average buy price for this token, denominated in USD. */
    buyAvgPrice: z.string().optional(),
    /** Number of sell transactions for this token. */
    sellTxCount: z.string().optional(),
    /** Total sell proceeds for this token, denominated in USD. */
    sellTxVolume: z.string().optional(),
    /** Average sell price for this token, denominated in USD. */
    sellAvgPrice: z.string().optional(),
  })
  .passthrough();

export const RecentPnlPage = z
  .object({
    /** Pagination cursor for the next page. Empty string when no more data. */
    cursor: z.string().optional(),
    /** PnL records sorted by lastActiveTimestamp descending. */
    pnlList: z.array(RecentPnl).optional(),
  })
  .passthrough();

export const TokenPnl = z
  .object({
    /** Cumulative realized PnL for this token, denominated in USD. Positive means profit, negative means loss. */
    realizedPnlUsd: z.string().optional(),
    /** Realized PnL percentage. No percent sign included. */
    realizedPnlPercent: z.string().optional(),
    /** Cumulative buy spend for this token, denominated in USD. */
    buyTxVolume: z.string().optional(),
    /** Cumulative buy quantity (token units). */
    buyAmount: z.string().optional(),
    /** Number of buy transactions. */
    buyTxCount: z.string().optional(),
    /** Cumulative sell proceeds for this token, denominated in USD. */
    sellTxVolume: z.string().optional(),
    /** Cumulative sell quantity (token units). */
    sellAmount: z.string().optional(),
    /** Number of sell transactions. */
    sellTxCount: z.string().optional(),
    /** Average buy price, denominated in USD. */
    buyAvgPrice: z.string().optional(),
    /** Average sell price, denominated in USD. */
    sellAvgPrice: z.string().optional(),
    /** Current market value of the address's holding in this token, denominated in USD. Returns "0" when fully sold. */
    tokenBalanceUsd: z.string().optional(),
    /** Current holding amount (token units). Returns "0" when fully sold. */
    tokenBalanceAmount: z.string().optional(),
    /** Maximum historical holding amount (token units). */
    maxBalanceAmount: z.string().optional(),
    /** Cumulative holding duration in milliseconds. Counts only actual holding periods; gaps between sell and re-buy are excluded. If still holding, counts up to the current time. */
    holdingDuration: z.string().optional(),
    /** Whether PnL calculation is meaningful for this token. true=supported; false=not supported. Returns false for stablecoins (USDT/USDC/DAI etc.), native tokens (ETH/BNB/SOL etc.), and wrapped tokens (WETH/WBNB/WSOL etc.). R… */
    isPnlSupported: z.boolean().optional(),
  })
  .passthrough();

export const DexTrade = z
  .object({
    /** Trade type. 1=Buy, 2=Sell. */
    type: z.string().optional(),
    /** Unique chain identifier. */
    binanceChainId: z.string().optional(),
    /** Token contract address. EVM addresses are lowercase; Solana addresses are case-sensitive. */
    tokenContractAddress: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Transaction value, denominated in USD. */
    valueUsd: z.string().optional(),
    /** Token quantity involved in this transaction (token units). */
    amount: z.string().optional(),
    /** Execution price of this transaction, denominated in USD. */
    price: z.string().optional(),
    /** Token market cap at the time of this transaction, denominated in USD. */
    marketCap: z.string().optional(),
    /** On-chain transaction hash. */
    txHash: z.string().optional(),
    /** Chain logo image URL. */
    chainLogoUrl: z.string().optional(),
    /** Transaction on-chain time, Unix millisecond timestamp. */
    time: z.string().optional(),
  })
  .passthrough();

export const DexTradeHistoryPage = z
  .object({
    /** Pagination cursor for the next page. Empty string when no more data. */
    cursor: z.string().optional(),
    /** DEX transaction records sorted by time descending. */
    transactionList: z.array(DexTrade).optional(),
  })
  .passthrough();

export const LeaderboardDailyPnl = z
  .object({
    /** Date in YYYY-MM-DD format. */
    date: z.string().optional(),
    /** Realized PnL for this day, denominated in USD. */
    pnlUsd: z.string().optional(),
  })
  .passthrough();

export const LeaderboardTokenCountByPnlPercent = z
  .object({
    /** Number of tokens with realized PnL >500%. */
    above500Percent: z.string().optional(),
    /** Number of tokens with realized PnL in [0%, 500%]. */
    between0And500Percent: z.string().optional(),
    /** Number of tokens with realized PnL in [-50%, 0%]. */
    betweenNeg50And0Percent: z.string().optional(),
    /** Number of tokens with realized PnL < -50%. */
    belowNeg50Percent: z.string().optional(),
  })
  .passthrough();

export const LeaderboardTopPnlToken = z
  .object({
    /** Token contract address. EVM addresses are lowercase; Solana addresses are case-sensitive. */
    tokenContractAddress: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Token logo URL. */
    tokenLogoUrl: z.string().optional(),
    /** Realized PnL for this token, denominated in USD. Positive means profit, negative means loss. */
    tokenPnLUsd: z.string().optional(),
    /** Realized PnL percentage for this token. No percent sign included. */
    tokenPnLPercent: z.string().optional(),
  })
  .passthrough();

export const LeaderboardEntry = z
  .object({
    /** Wallet address. */
    walletAddress: z.string().optional(),
    /** Wallet display name. Empty string when unavailable. */
    walletName: z.string().optional(),
    /** Wallet avatar URL. Empty string when unavailable. */
    walletLogoUrl: z.string().optional(),
    /** Associated Twitter/X profile URL. Empty string when unavailable. */
    walletTwitterUrl: z.string().optional(),
    /** Wallet type tags, comma-separated if multiple. 1=Smart Money, 2=KOL, 3=Hot List. Empty string when no tag applies. */
    walletType: z.string().optional(),
    /** Native token balance of this address on the queried chain. */
    nativeTokenBalance: z.string().optional(),
    /** Native token balance of this address, denominated in USD. */
    nativeTokenBalanceUsd: z.string().optional(),
    /** Cumulative realized PnL within the time frame, denominated in USD. Positive means profit, negative means loss. */
    realizedPnlUsd: z.string().optional(),
    /** Realized PnL percentage within the time frame. No percent sign included. */
    realizedPnlPercent: z.string().optional(),
    /** Daily realized PnL within the selected time frame, sorted by date descending. */
    dailyPnl: z.array(LeaderboardDailyPnl).optional(),
    /** Win rate within the time frame. No percent sign included. */
    winRatePercent: z.string().optional(),
    /** Total transaction volume within the time frame, denominated in USD. Equals buyTxVolume + sellTxVolume. */
    txVolume: z.string().optional(),
    /** Total buy volume within the time frame, denominated in USD. */
    buyTxVolume: z.string().optional(),
    /** Total sell volume within the time frame, denominated in USD. */
    sellTxVolume: z.string().optional(),
    /** Average buy value per transaction within the time frame, denominated in USD. Returns "0" when no buy transactions. */
    avgBuyValueUsd: z.string().optional(),
    /** Total transaction count within the time frame. Equals buyTxCount + sellTxCount. */
    txs: z.string().optional(),
    /** Buy transaction count within the time frame. */
    buyTxCount: z.string().optional(),
    /** Sell transaction count within the time frame. */
    sellTxCount: z.string().optional(),
    /** Top 3 tokens by realized PnL. Returns fewer items if fewer than 3 tokens were traded. */
    topPnlTokenList: z.array(LeaderboardTopPnlToken).optional(),
    tokenCountByPnlPercent: LeaderboardTokenCountByPnlPercent.optional(),
    /** Timestamp of the address's last trade, Unix millisecond timestamp. */
    lastActiveTimestamp: z.string().optional(),
  })
  .passthrough();

export const LeaderboardPage = z
  .object({
    /** Pagination cursor for the next page. Empty string when no more data. */
    cursor: z.string().optional(),
    /** List of leaderboard wallet entries. */
    items: z.array(LeaderboardEntry).optional(),
  })
  .passthrough();

export const TrackedTrade = z
  .object({
    /** On-chain transaction hash. */
    txHash: z.string().optional(),
    /** Wallet address that initiated this trade. EVM addresses are lowercase; Solana addresses are case-sensitive. */
    walletAddress: z.string().optional(),
    /** Symbol of the traded token. */
    tokenSymbol: z.string().optional(),
    /** Contract address of the traded token. EVM addresses are lowercase; Solana addresses are case-sensitive. */
    tokenContractAddress: z.string().optional(),
    /** Unique chain identifier of the traded token. */
    binanceChainId: z.string().optional(),
    /** Token price at the time of this trade, denominated in USD. */
    tokenPrice: z.string().optional(),
    /** Token market cap at the time of this trade, denominated in USD. */
    marketCap: z.string().optional(),
    /** Trade type. 1=Buy, 2=Sell, 3=Add position, 4=Reduce position, 5=Open position, 6=Close position, 7=Transfer in, 8=Transfer out. */
    tradeType: z.string().optional(),
    /** On-chain time of this trade, Unix millisecond timestamp. */
    tradeTime: z.string().optional(),
  })
  .passthrough();

export const TrackedTradesPage = z
  .object({
    /** List of tracked address trades. */
    trades: z.array(TrackedTrade).optional(),
  })
  .passthrough();

export const WsAuthToken = z
  .object({
    /** WebSocket auth token (JWT). */
    token: z.string().optional(),
  })
  .passthrough();
