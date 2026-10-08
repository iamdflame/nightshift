/**
 * Documented response schemas — defi. GENERATED, then reviewed; do not hand-edit field lists.
 *
 * Transcribed from the docs' OpenAPI document (web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/1.0.0/schema.json,
 * rendered at catalog/web3-wallet/api/rest-api/{defi-data, defi-transaction}) via the operation models of the official connector
 * @binance-web3/wallet@13.0.1, which is generated from the same spec (identical operationIds). Every object is
 * .passthrough() so undocumented fields survive; telemetry reports them as doc drift.
 */
import { z } from "zod";

export const PositionCollectionDetail = z
  .object({
    /** Index of this collection within the pool. For single-asset collections this is the ABI-encoded (left-padded) token address; other pools use their own index format. */
    collectionIndex: z.string().nullable().optional(),
    /** Human-readable collection name. */
    collectionDisplayName: z.string().nullable().optional(),
    /** Health factor for lending positions. Null for non-lending positions. */
    healthFactor: z.string().nullable().optional(),
  })
  .passthrough();

export const PositionDetail = z
  .object({
    /** Position index (e.g. the Uniswap-V3-style position number). */
    positionIndex: z.string().nullable().optional(),
    /** NFT token ID for concentrated-liquidity positions, prefixed with `#` (e.g. `"#7225901"`). Null for non-NFT positions. The `#` prefix may be passed as-is to a transaction build endpoint (`lp-add` / `lp-remove` / `claim` `… */
    nftId: z.string().nullable().optional(),
    /** Unix timestamp (seconds) when the position unlocks. Null if no lock. */
    unlockTime: z.string().nullable().optional(),
    /** Whether the unlock time has been reached. */
    unlockTimeReached: z.boolean().nullable().optional(),
    /** Lower tick bound for concentrated-liquidity positions. */
    tickLower: z.string().nullable().optional(),
    /** Upper tick bound for concentrated-liquidity positions. */
    tickUpper: z.string().nullable().optional(),
    /** Whether the position is currently in-range (active). */
    active: z.boolean().nullable().optional(),
    /** Merkle proofs keyed by reward token address. Required when claiming PancakeSwap Infinity (V4) rewards. */
    proofs: z.record(z.string(), z.array(z.string())).optional(),
  })
  .passthrough();

export const PositionToken = z
  .object({
    /** Token contract address. The native-asset sentinel `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` (40 `e`s) for native coins. */
    tokenAddress: z.string().optional(),
    /** Token name. */
    tokenName: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Human-readable token amount (NOT the smallest unit). */
    tokenAmount: z.string().optional(),
    /** Current token price in USD. */
    tokenPrice: z.string().optional(),
    /** Token value in USD (amount × price). */
    tokenValue: z.string().optional(),
    /** Token decimals (string). */
    tokenDecimals: z.string().optional(),
  })
  .passthrough();

export const PositionTokenList = z
  .object({
    supply: z.array(PositionToken).optional(),
    borrow: z.array(PositionToken).optional(),
    reward: z.array(PositionToken).optional(),
    farming_reward: z.array(PositionToken).optional(),
  })
  .passthrough();

export const Position = z
  .object({
    /** Unique position identifier (64-char hex, no `0x` prefix). */
    positionId: z.string().optional(),
    /** Display name of the underlying asset (e.g. "USDT-USDC", "lisUSD"). */
    underlyingAssetName: z.string().optional(),
    /** Underlying asset identifier (64-char hex, no `0x` prefix). Hashed from the pool and underlying token addresses. */
    underlyingAssetId: z.string().optional(),
    /** Asset structure type. Null for a regular position; `locked` for a locked position (e.g. locked staking — check `unlockTime` on positionDetail); `farming` for a MasterChef-style farming position (rewards accrue under the … */
    assetType: z.string().nullable().optional(),
    /** Related investment IDs (64-char hex, no `0x` prefix). Use with `POST /api/v1/defi/data/investment/detail`. Usually a single entry; a position can relate to several investments when the pool stacks products on top of each… */
    investmentIds: z.array(z.string()).optional(),
    positionDetail: PositionDetail.nullable().optional(),
    /** Total position value in USD (sum of all token values; may be negative for borrow positions). */
    positionValue: z.string().optional(),
    tokenList: PositionTokenList.optional(),
  })
  .passthrough();

export const PositionCollection = z
  .object({
    /** Collection unique identifier (64-char hex, no `0x` prefix). */
    positionCollectionId: z.string().optional(),
    positionCollectionDetail: PositionCollectionDetail.nullable().optional(),
    /** Total value of all positions in this collection (USD). */
    positionCollectionTotalValue: z.string().optional(),
    /** List of positions in this collection. */
    positionList: z.array(Position).optional(),
  })
  .passthrough();

export const PositionPoolDetail = z
  .object({
    /** Pool expiry timestamp (Unix seconds). Null if no expiry. */
    expiry: z.number().nullable().optional(),
    /** Fee tier. For PancakeSwap V3-style pools this is the encoded fee (e.g. "500" = 0.05%); for V4-style pools a flag-encoded value. */
    feeTier: z.string().nullable().optional(),
    /** LP fee portion in basis points (V4-style pools). */
    lpFee: z.string().nullable().optional(),
    /** Tick spacing for concentrated-liquidity pools. */
    tickSpacing: z.string().nullable().optional(),
    /** Whether the pool uses a dynamic (hook-managed) fee (V4-style pools). */
    isDynamicFee: z.boolean().nullable().optional(),
    /** Hook fee portion in basis points (V4-style pools). */
    hookFee: z.string().nullable().optional(),
    /** Current pool tick (V4-style pools). */
    tick: z.string().nullable().optional(),
    /** Hook contract address (V4-style pools). Zero address when no hook. */
    hooks: z.string().nullable().optional(),
    /** Protocol fee on swaps in basis points (V4-style pools). */
    swapProtocolFee: z.string().nullable().optional(),
    /** Encoded pool parameters, e.g. `0x` + 64-char hex (V4-style pools). */
    parameters: z.string().nullable().optional(),
    /** Total pool fee in basis points (V4-style pools). */
    fee: z.string().nullable().optional(),
    /** Spoke pool name (e.g. across-protocol bridges). */
    spokeName: z.string().nullable().optional(),
    /** Number of reserves in multi-asset pools. */
    reserveCount: z.string().nullable().optional(),
    /** Vault name for vault-style protocols. */
    vaultName: z.string().nullable().optional(),
  })
  .passthrough();

export const PositionPool = z
  .object({
    /** Pool identifier (`0x` + 64-char hex). */
    bnPoolId: z.string().optional(),
    /** Pool contract address. */
    poolCa: z.string().optional(),
    /** Pool type. Complete value set: `Lending` (supply/borrow market), `Staked` (native staking), `Yield` (yield vault / receipt token), `Deposit` (fixed deposit), `Rewards` (reward claims, e.g. PancakeSwap Infinity), `Liquidi… */
    poolType: z.string().optional(),
    positionCollectionList: z.array(PositionCollection).optional(),
    poolDetail: PositionPoolDetail.nullable().optional(),
  })
  .passthrough();

export const PositionProtocol = z
  .object({
    /** Binance chain ID. Plain numeric string for EVM chains — see Supported Chains & Protocols for the supported values. */
    binanceChainId: z.string().optional(),
    /** Protocol identifier consistent with `POST /api/v1/defi/data/protocol/list`. Use this value when calling investment/list, transaction endpoints, etc. */
    defiProtocolId: z.string().optional(),
    /** Protocol display name. */
    protocolName: z.string().optional(),
    /** Total position value in this protocol (USD). */
    protocolTotalValue: z.string().optional(),
    /** Pools with positions in this protocol. */
    poolList: z.array(PositionPool).optional(),
  })
  .passthrough();

export const PositionAddress = z
  .object({
    /** Wallet address. */
    address: z.string().optional(),
    /** Total DeFi position value of this address across all chains (USD). Same raw precision as the position values. */
    addressTotalValue: z.string().optional(),
    /** Protocol-level position summaries of this address. */
    protocolList: z.array(PositionProtocol).optional(),
  })
  .passthrough();

export const ProtocolSummary = z
  .object({
    /** DeFi protocol identifier. */
    defiProtocolId: z.string().optional(),
    /** Protocol display name. */
    protocolName: z.string().optional(),
    /** Protocol logo image URL (full URL; quote as-is). */
    protocolLogo: z.string().optional(),
    /** Total value locked in the protocol (USD). String, raw precision from the data source. */
    tvl: z.string().optional(),
    /** Highest APY across the protocol's investments, in basis points (1 bps = 0.01%). Integer value — use this for sorting / comparing / filtering, never the raw decimal. */
    apyBps: z.number().optional(),
    /** Pre-formatted, human-readable APY string for display (e.g. "12.35%"). Quote as-is; do not re-compute or transform. */
    apyDisplay: z.string().optional(),
    /** Investment types supported by this protocol — an array here (a protocol may support several). Note: the investment-level investType (in investment list/detail) is a single string. Known values: Earn, LiquidityPool. */
    investType: z.array(z.string()).optional(),
    /** Supported Binance chain IDs. */
    supportedChains: z.array(z.string()).optional(),
  })
  .passthrough();

export const InvestmentSummary = z
  .object({
    /** Binance chain ID. */
    binanceChainId: z.string().optional(),
    /** Parent DeFi protocol identifier. */
    defiProtocolId: z.string().optional(),
    /** Protocol display name. */
    protocolName: z.string().optional(),
    /** Investment product identifier (64-char hex, no `0x` prefix). Same format as the `investmentIds` returned by `POST /api/v1/defi/data/position/list` and accepted by the transaction build endpoints. */
    investmentId: z.string().optional(),
    /** Investment display name. */
    investmentName: z.string().optional(),
    /** Investment type of this product — a single string here (each product has exactly one). Note: the protocol-level investType (in protocol list/detail) is an array. Known values: Earn, LiquidityPool. */
    investType: z.string().optional(),
    /** Rate yield type. Known values: APY, APR. */
    apyType: z.string().optional(),
    /** Annual percentage yield in basis points (1 bps = 0.01%). Integer value — use this for sorting / comparing / filtering, never the raw decimal. */
    apyBps: z.number().optional(),
    /** Pre-formatted, human-readable APY string for display (e.g. "1,562.65%"). Quote as-is; do not re-compute or transform. */
    apyDisplay: z.string().optional(),
    /** Total value locked in this investment (USD). String, raw precision from the data source. */
    tvl: z.string().optional(),
  })
  .passthrough();

export const ProtocolSocialLinks = z
  .object({
    /** X (Twitter) profile URL. Null when not available. */
    x: z.string().nullable().optional(),
    /** Discord invite URL. Null when not available. */
    discord: z.string().nullable().optional(),
    /** GitHub organization URL. Null when not available. */
    github: z.string().nullable().optional(),
    /** LinkedIn company URL. Null when not available. */
    linkedin: z.string().nullable().optional(),
    /** Telegram channel URL. Null when not available. */
    telegram: z.string().nullable().optional(),
    /** GitBook documentation URL. Empty string or null when not available. */
    gitbook: z.string().nullable().optional(),
    /** Official website URL. */
    website: z.string().optional(),
  })
  .passthrough();

export const ProtocolTeamMember = z
  .object({
    /** Member name. */
    name: z.string().optional(),
    /** Member role / title. */
    role: z.string().optional(),
    /** Member's X (Twitter) handle URL. Null when not available. */
    twitter: z.string().nullable().optional(),
    /** Member's LinkedIn URL. Null when not available. */
    linkedin: z.string().nullable().optional(),
    /** Member biography. Null when not available. */
    bio: z.string().nullable().optional(),
  })
  .passthrough();

export const ProtocolFundRaising = z
  .object({
    /** Round name (e.g. "Strategic"). */
    round: z.string().optional(),
    /** Amount raised. Null when not disclosed. */
    amount: z.string().nullable().optional(),
    /** Round date. */
    date: z.string().optional(),
    /** Investor names. */
    investors: z.array(z.string()).optional(),
  })
  .passthrough();

export const ProtocolDimensionScores = z
  .object({
    /** Code security score. */
    codeSecurity: z.string().optional(),
    /** Fundamental health score. */
    fundamentalHealth: z.string().optional(),
    /** Operational resilience score. */
    operationalResilience: z.string().optional(),
    /** Community trust score. */
    communityTrust: z.string().optional(),
    /** Governance strength score. */
    governanceStrength: z.string().optional(),
    /** Market stability score. */
    marketStability: z.string().optional(),
  })
  .passthrough();

export const ProtocolFaq = z
  .object({
    /** FAQ question text (already translated; quote as-is). */
    title: z.string().optional(),
    /** FAQ answer text (already translated; quote as-is). May contain line-break markup `<Br/>` and paragraph-gap markup `<Gap/>` — interpret them as line / paragraph breaks. */
    answer: z.string().optional(),
  })
  .passthrough();

export const InvestmentToken = z
  .object({
    /** Token contract address. The native-asset sentinel for native coins. */
    tokenAddress: z.string().optional(),
    /** Token name. */
    tokenName: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
  })
  .passthrough();

export const DefiBalanceChange = z
  .object({
    /** Token role / type tag from the simulation. */
    tokenType: z.string().optional(),
    /** Token symbol. */
    tokenSymbol: z.string().optional(),
    /** Token contract address. */
    tokenAddress: z.string().optional(),
    /** Token decimals. */
    tokenDecimals: z.string().optional(),
    /** Signed delta (positive = received, negative = spent). */
    amount: z.string().optional(),
    /** USD value of the delta. */
    valueUsd: z.string().optional(),
    /** Optional NFT / position token ID when applicable. */
    tokenId: z.string().optional(),
  })
  .passthrough();

export const DefiNetworkFee = z
  .object({
    /** Estimated gas fee in the gas-paying token (human-readable). */
    amount: z.string().nullable().optional(),
    /** Symbol of the fee-paying token (native coin, e.g. BNB). */
    tokenSymbol: z.string().optional(),
    /** USD value of the estimated fee. */
    valueUsd: z.string().nullable().optional(),
    /** Storage / rent fee portion (human-readable), if applicable. */
    rentFeeAmount: z.string().nullable().optional(),
    /** USD value of the storage / rent fee, if applicable. */
    rentFeeValueUsd: z.string().nullable().optional(),
    /** Priority fee portion (human-readable), if broken out. */
    priorityFeeAmount: z.string().nullable().optional(),
  })
  .passthrough();

export const DefiInteractWith = z
  .object({
    /** Target contract address. */
    address: z.string().optional(),
  })
  .passthrough();

export const DefiFeeAndContract = z
  .object({
    estimatedNetworkFee: DefiNetworkFee.optional(),
    interactWith: DefiInteractWith.optional(),
  })
  .passthrough();

export const DefiHealthFactor = z
  .object({
    /** Health factor before this transaction. Null when unavailable. */
    before: z.string().nullable().optional(),
    /** Health factor after this transaction. Null when unavailable. */
    after: z.string().nullable().optional(),
  })
  .passthrough();

export const DefiWarning = z
  .object({
    /** Warning code. Known values: `HEALTH_FACTOR_WARNING`, `HEALTH_FACTOR_DANGER`, `HIGH_SLIPPAGE`, `DELAYED_REDEMPTION`, `LP_OUT_OF_RANGE`. Branch on `code` for control flow; display `message` as-is. */
    code: z.string().optional(),
    /** Severity level — INFO / WARN / DANGER. */
    level: z.string().optional(),
    /** Human-readable warning text. */
    message: z.string().optional(),
  })
  .passthrough();

export const PositionList = z
  .object({
    /** Total value of all DeFi positions of all queried addresses (USD). Same raw precision as addressTotalValue. */
    totalValue: z.string().optional(),
    /** Address-level position summaries. */
    addressList: z.array(PositionAddress).optional(),
  })
  .passthrough();

export const ProtocolPage = z
  .object({
    /** Current page number (1-based). */
    page: z.number().optional(),
    /** Page size. */
    size: z.number().optional(),
    /** Total number of records. */
    total: z.number().optional(),
    /** Protocols for the current page. */
    list: z.array(ProtocolSummary).optional(),
  })
  .passthrough();

export const ProtocolDetail = z
  .object({
    /** DeFi protocol identifier. */
    defiProtocolId: z.string().optional(),
    /** Protocol display name. */
    protocolName: z.string().optional(),
    /** Protocol logo image URL (full URL under `https://bin.bnbstatic.com`). */
    protocolLogo: z.string().optional(),
    /** Protocol description (already translated; quote as-is). */
    description: z.string().optional(),
    /** Official website URL. */
    websiteUrl: z.string().optional(),
    /** Investment types supported by this protocol — an array here (a protocol may support several). Note: the investment-level investType (in investment list/detail) is a single string. Known values: Earn, LiquidityPool. */
    investType: z.array(z.string()).optional(),
    /** Supported Binance chain IDs. */
    supportedChains: z.array(z.string()).optional(),
    /** Total value locked (USD). String, raw precision from the data source. */
    tvl: z.string().optional(),
    /** Protocol tags / categories. */
    tags: z.array(z.string()).optional(),
    /** Founding year (YYYY). */
    founded: z.string().optional(),
    /** Fully diluted valuation. */
    fdv: z.string().optional(),
    /** Total funding raised. Null when not disclosed. */
    totalFunding: z.string().nullable().optional(),
    socialLinks: ProtocolSocialLinks.optional(),
    /** Team members. */
    team: z.array(ProtocolTeamMember).optional(),
    /** Fundraising history. */
    fundRaising: z.array(ProtocolFundRaising).optional(),
    /** Overall CertiK security score. */
    securityScore: z.string().optional(),
    dimensionScores: ProtocolDimensionScores.optional(),
    /** Protocol highlights (already translated; quote as-is). */
    highlights: z.array(z.string()).optional(),
    /** FAQ entries (question and answer text, already translated). */
    faq: z.array(ProtocolFaq).optional(),
  })
  .passthrough();

export const InvestmentPage = z
  .object({
    /** Current page number (1-based). */
    page: z.number().optional(),
    /** Page size. */
    size: z.number().optional(),
    /** Total number of records. */
    total: z.number().optional(),
    /** Investments for the current page. */
    list: z.array(InvestmentSummary).optional(),
  })
  .passthrough();

export const InvestmentDetail = z
  .object({
    /** Binance chain ID. */
    binanceChainId: z.string().optional(),
    /** Parent DeFi protocol identifier. */
    defiProtocolId: z.string().optional(),
    /** Protocol display name. */
    protocolName: z.string().optional(),
    /** Protocol logo image URL (full URL; quote as-is). */
    protocolLogo: z.string().optional(),
    /** Investment product identifier (64-char hex, no `0x` prefix). Same format as the `investmentIds` returned by `POST /api/v1/defi/data/position/list` and accepted by the transaction build endpoints. */
    investmentId: z.string().optional(),
    /** Investment display name. */
    investmentName: z.string().optional(),
    /** Investment type of this product — a single string here (each product has exactly one). Note: the protocol-level investType (in protocol list/detail) is an array. Known values: Earn, LiquidityPool. */
    investType: z.string().optional(),
    /** Whether this investment is currently investable. */
    investable: z.boolean().optional(),
    /** Annual percentage yield in basis points (1 bps = 0.01%). Integer value — use this for sorting / comparing / filtering, never the raw decimal. */
    apyBps: z.number().optional(),
    /** Pre-formatted, human-readable APY string for display (e.g. "1,562.65%"). Quote as-is; do not re-compute or transform. */
    apyDisplay: z.string().optional(),
    /** Rate yield type. Known values: APY, APR. */
    apyType: z.string().optional(),
    /** Total value locked (USD). String, raw precision from the data source. */
    tvl: z.string().optional(),
    /** Pool / strategy contract address. */
    poolAddress: z.string().optional(),
    /** Fee rate string (e.g. "0.001" = 0.1%). */
    feeRate: z.string().optional(),
    /** Tokens to supply / deposit. */
    assetTokenList: z.array(InvestmentToken).optional(),
    /** Reward tokens. */
    rewardTokenList: z.array(InvestmentToken).optional(),
    /** LP tokens (for liquidity positions). */
    lpTokenList: z.array(InvestmentToken).optional(),
    /** Borrow tokens (for lending borrow positions). */
    borrowTokenList: z.array(InvestmentToken).optional(),
  })
  .passthrough();

export const DefiCallData = z
  .object({
    /** Action kind of this item: - `APPROVE` — ERC-20 approval, must be signed/broadcast and confirmed before the main action - `DEPOSIT` / `REDEEM` / `LP_ADD` / `LP_REMOVE` / `CLAIM` — the main action.   `LP_ADD` / `LP_REMOVE`… */
    callDataType: z.string().optional(),
    /** User wallet address (the signer / sender). EIP-55 checksummed — normalize with `to_checksum_address` before signing if your signer requires it. */
    from: z.string().optional(),
    /** Target contract address. EIP-55 checksummed, same format as `from`. Non-null for currently supported protocols. */
    to: z.string().nullable().optional(),
    /** Native-asset value as a `0x`-prefixed hex string. Non-null for currently supported protocols. */
    value: z.string().nullable().optional(),
    /** Serialized transaction data, as a `0x`-prefixed hex calldata string. */
    data: z.string().optional(),
    /** Suggested gas limit (decimal string). `null` when estimation fails. */
    gasLimit: z.string().nullable().optional(),
    /** Legacy gas price, decimal string. `null` on EIP-1559 chains such as BSC (use `maxFeePerGas` / `maxPriorityFeePerGas` instead). */
    gasPrice: z.string().nullable().optional(),
    /** EIP-1559 priority fee in wei (decimal string). `null` on non-1559 chains. */
    maxPriorityFeePerGas: z.string().nullable().optional(),
    /** EIP-1559 max fee per gas in wei (decimal string). `null` on non-1559 chains. */
    maxFeePerGas: z.string().nullable().optional(),
  })
  .passthrough();

export const DefiTxPreview = z
  .object({
    /** Whether the simulated transaction is expected to succeed on-chain. */
    success: z.boolean().optional(),
    /** Signed token balance deltas from the simulation. Each entry has `tokenType`, `tokenSymbol`, `tokenAddress`, `tokenDecimals`, `amount` (positive = received, negative = spent), `valueUsd`, and an optional `tokenId`. */
    balanceChange: z.array(DefiBalanceChange).optional(),
    feeAndContract: DefiFeeAndContract.optional(),
    healthFactor: DefiHealthFactor.optional(),
    /** Non-blocking risk warnings. Empty array when there are no warnings. */
    warnings: z.array(DefiWarning).optional(),
    /** Error message when the simulated transaction is expected to fail. */
    errorMessage: z.string().optional(),
  })
  .passthrough();

export const DefiTx = z
  .object({
    /** Ordered unsigned transactions; APPROVE precedes the main action. */
    dataList: z.array(DefiCallData).optional(),
    preview: DefiTxPreview.optional(),
    /** Redeem waiting period as a `[min, max]` day pair of decimal strings. Populated **only** by `/transaction/redeem`; `null` on the other build endpoints or when unavailable. Interpretation: `[]` (empty) = instant, no waitin… */
    redeemDelayDays: z.array(z.string()).optional(),
  })
  .passthrough();

export const LpAddCalculation = z
  .object({
    /** Echo of the input token amount (human-readable). */
    inputTokenAmount: z.string().optional(),
    /** The paired token contract address derived from the investment. */
    pairedTokenAddress: z.string().optional(),
    /** Calculated paired token amount (human-readable). */
    pairedTokenAmount: z.string().optional(),
  })
  .passthrough();
