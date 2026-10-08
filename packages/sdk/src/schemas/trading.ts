/**
 * Documented response schemas — trading. GENERATED, then reviewed; do not hand-edit field lists.
 *
 * Transcribed from the docs' OpenAPI document (web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/1.0.0/schema.json,
 * rendered at catalog/web3-wallet/api/rest-api/{trading-api}) via the operation models of the official connector
 * @binance-web3/wallet@13.0.1, which is generated from the same spec (identical operationIds). Every object is
 * .passthrough() so undocumented fields survive; telemetry reports them as doc drift.
 */
import { z } from "zod";

export const AggregatorChain = z
  .object({
    /** Unique chain identifier (follows EIP-155 chainId for EVM chains; e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana). */
    binanceChainId: z.string().optional(),
    /** Full chain name. */
    name: z.string().optional(),
    /** Short chain name. */
    shortName: z.string().optional(),
    /** Chain logo image URL. */
    logoUrl: z.string().optional(),
  })
  .passthrough();

export const ApproveTransaction = z
  .object({
    /** ABI-encoded calldata for the ERC-20 `approve()` call. Selector + padded spender + padded amount. */
    data: z.string().optional(),
    /** DEX router contract address (the spender in the `approve()` call). Configured per chain. */
    dexContractAddress: z.string().optional(),
    /** Gas limit ceiling for the approve transaction (integer string, gas units). */
    gasLimit: z.string().optional(),
    /** Gas price for the approve transaction (integer string, wei). */
    gasPrice: z.string().optional(),
  })
  .passthrough();

export const QuoteFromToken = z
  .object({
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Token ticker. */
    tokenSymbol: z.string().optional(),
    /** Token USD price (decimal string). */
    tokenUnitPrice: z.string().optional(),
    /** Token decimals. */
    decimal: z.string().optional(),
    /** Whether the token is a honeypot (buyable but not sellable). */
    isHoneyPot: z.boolean().optional(),
    /** Token tax rate. Range 0–1; "0.01" means 1%. */
    taxRate: z.string().optional(),
  })
  .passthrough();

export const QuoteToToken = z
  .object({
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Token ticker. */
    tokenSymbol: z.string().optional(),
    /** Token USD price (decimal string). */
    tokenUnitPrice: z.string().optional(),
    /** Token decimals. */
    decimal: z.string().optional(),
    /** Whether the token is a honeypot. */
    isHoneyPot: z.boolean().optional(),
    /** Token tax rate. */
    taxRate: z.string().optional(),
  })
  .passthrough();

export const DexProtocol = z
  .object({
    /** DEX protocol name. */
    dexName: z.string().optional(),
    /** Share of total flow routed through this DEX (2-decimal percentage string). */
    percent: z.string().optional(),
  })
  .passthrough();

export const RouteFromToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
  })
  .passthrough();

export const RouteToToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
  })
  .passthrough();

export const DexRoute = z
  .object({
    dexProtocol: DexProtocol.optional(),
    fromToken: RouteFromToken.optional(),
    /** Sell-token index after global de-duplication (string form). */
    fromTokenIndex: z.string().optional(),
    toToken: RouteToToken.optional(),
    /** Buy-token index after global de-duplication (string form). */
    toTokenIndex: z.string().optional(),
  })
  .passthrough();

export const QuoteRoute = z
  .object({
    /** Per-route quote identifier (UUID, no dashes). Pass to the swap endpoint to lock in this route. */
    quoteId: z.string().optional(),
    /** Source vendor display name. Possible values include LiquidMesh, Lifi, 1inch, Pancake, Jupiter. */
    vendorName: z.string().optional(),
    /** Chain identifier echoed from the request. */
    binanceChainId: z.string().optional(),
    /** Sell amount echoed from the request (smallest unit, integer string). */
    fromTokenAmount: z.string().optional(),
    /** Estimated buy-token amount returned by the vendor (smallest unit, integer string). */
    toTokenAmount: z.string().optional(),
    /** Estimated network fee for this route in USD. Null when the vendor does not return one. */
    tradeFee: z.string().nullable().optional(),
    /** Estimated gas in the chain's smallest unit (e.g. wei). May be null on Solana. */
    estimateGasFee: z.string().nullable().optional(),
    /** Estimated price impact percentage. Null when the vendor does not return one. */
    priceImpactPercent: z.string().nullable().optional(),
    /** Routing path description, addresses joined with "--". */
    router: z.string().optional(),
    fromToken: QuoteFromToken.optional(),
    toToken: QuoteToToken.optional(),
    /** Routing path segments. Each segment corresponds to one hop on one DEX protocol; multi-DEX hops are flattened. */
    dexRouterList: z.array(DexRoute).optional(),
    /** Execution mode for this route. `SWAP` = standard on-chain swap (sign the `tx` object from `/swap` and broadcast). `RFQ` = signed order flow (sign `rfq.typedDataToSign` from `/swap` with EIP-712, submit via `POST /order/s… */
    executionMode: z.string().optional(),
    /** The spender contract address the backend will encode into the approve calldata for this route. To obtain that calldata, call `/approve-transaction` with `vendor=<vendorName>` (the string name, e.g. `"PcsXRfq"`) — the bac… */
    approveTarget: z.string().nullable().optional(),
    /** Whether this route has the highest `toTokenAmount` among all routes returned in this response. At most one route per response has `isBest=true`. */
    isBest: z.boolean().optional(),
    /** Fee amount deducted for this route (smallest unit, integer string). Only populated when the request enabled the custom fee (`feePercent` + `feeSource` both present); `null` otherwise. `FROM_TOKEN` direction = `originalFr… */
    feeAmount: z.string().nullable().optional(),
    /** Contract address of the token in which the fee is denominated. `FROM_TOKEN` direction = sell-token address; `TO_TOKEN` direction = buy-token address. `null` when the custom fee is not enabled. */
    feeToken: z.string().nullable().optional(),
    /** Actual amount participating in the DEX swap (smallest unit, integer string). `FROM_TOKEN` direction = net amount after fee deduction (`fromTokenAmount − feeAmount`, i.e. the amountIn sent to the DEX); `TO_TOKEN` directio… */
    actualSwapAmount: z.string().nullable().optional(),
  })
  .passthrough();

export const SwapDexProtocol = z
  .object({
    dexName: z.string().optional(),
    percent: z.string().optional(),
  })
  .passthrough();

export const SwapRouteFromToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
  })
  .passthrough();

export const SwapRouteToToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
  })
  .passthrough();

export const SwapDexRoute = z
  .object({
    dexProtocol: SwapDexProtocol.optional(),
    fromToken: SwapRouteFromToken.optional(),
    fromTokenIndex: z.string().optional(),
    toToken: SwapRouteToToken.optional(),
    toTokenIndex: z.string().optional(),
  })
  .passthrough();

export const SwapFromToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
    tokenUnitPrice: z.string().optional(),
    decimal: z.string().optional(),
    isHoneyPot: z.boolean().optional(),
    taxRate: z.string().optional(),
  })
  .passthrough();

export const SwapToToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
    tokenUnitPrice: z.string().optional(),
    decimal: z.string().optional(),
    isHoneyPot: z.boolean().optional(),
    taxRate: z.string().optional(),
  })
  .passthrough();

export const SwapRouterResult = z
  .object({
    /** Chain identifier echoed from the request. */
    binanceChainId: z.string().optional(),
    /** Vendor that supplied the executed quote (e.g. LiquidMesh, Lifi, 1inch, Pancake, Jupiter). */
    vendorName: z.string().optional(),
    /** Sell-token amount (smallest unit, integer string). */
    fromTokenAmount: z.string().optional(),
    /** Estimated buy-token amount (smallest unit, integer string). */
    toTokenAmount: z.string().optional(),
    /** Estimated network fee in USD. */
    tradeFee: z.string().nullable().optional(),
    /** Estimated gas in the chain's smallest unit (e.g. wei). */
    estimateGasFee: z.string().nullable().optional(),
    /** Routing path description, addresses joined with "--". */
    router: z.string().optional(),
    /** Price impact percentage. Formula (received_value − sent_value) / sent_value. */
    priceImpactPercent: z.string().optional(),
    /** Routing path segments. Same shape as the `dexRouterList` returned by `/quote`. */
    dexRouterList: z.array(SwapDexRoute).optional(),
    fromToken: SwapFromToken.optional(),
    toToken: SwapToToken.optional(),
    /** Fee amount deducted for this swap (smallest unit, integer string). Only populated when the request enabled the custom fee; `null` otherwise. `FROM_TOKEN` direction = `originalFromCoinAmount × feePercent/100` (HALF_UP); `… */
    feeAmount: z.string().nullable().optional(),
    /** Contract address of the token in which the fee is denominated. `FROM_TOKEN` direction = sell-token address; `TO_TOKEN` direction = buy-token address. `null` when the custom fee is not enabled. */
    feeToken: z.string().nullable().optional(),
    /** Actual amount participating in the DEX swap (smallest unit, integer string). `FROM_TOKEN` direction = net amount after fee deduction (`fromTokenAmount − feeAmount`); `TO_TOKEN` direction = original input amount (fee is t… */
    actualSwapAmount: z.string().nullable().optional(),
  })
  .passthrough();

export const SwapTx = z
  .object({
    /** User wallet address (transaction sender). */
    from: z.string().optional(),
    /** DEX router contract address (the transaction's `to` field). */
    to: z.string().optional(),
    /** ABI-encoded calldata. */
    data: z.string().optional(),
    /** Native-token amount sent with the transaction (wei). "0" for ERC-20 swaps. */
    value: z.string().optional(),
    /** Gas limit estimate. */
    gas: z.string().optional(),
    /** Gas price (wei). */
    gasPrice: z.string().optional(),
    /** EIP-1559 max priority fee per gas (wei). */
    maxPriorityFeePerGas: z.string().optional(),
    /** Minimum buy-token amount the user accepts at the slippage limit (smallest unit, integer string). */
    minReceiveAmount: z.string().optional(),
    /** Slippage value applied to this transaction (percentage string). */
    slippagePercent: z.string().optional(),
    /** Auxiliary signature data. When `approveTransaction=true` was passed, this contains the spender address and approve calldata. */
    signatureData: z.array(z.string()).optional(),
    /** Solana priority fee per compute unit (micro-lamports). Echoed when supplied; computed by the platform otherwise. Null on EVM chains. */
    computeUnitPrice: z.string().nullable().optional(),
    /** Solana compute-unit ceiling. Echoed when supplied; not returned otherwise. Null on EVM chains. */
    computeUnitLimit: z.string().nullable().optional(),
  })
  .passthrough();

export const SwapRfq = z
  .object({
    /** RFQ vendor that will settle this order on-chain. Pass this as the `vendor` field in `POST /order/submit`. */
    vendor: z.string().optional(),
    /** Transaction type for this RFQ order. Currently always `EIP712` (all three RFQ vendors use EIP-712 typed-data signing); reserved for future signing schemes. */
    txType: z.string().optional(),
    /** EIP-712 typed data payload for `eth_signTypedData_v4`, serialized as a hex string (or JSON-encoded string). Sign with the wallet that matches `userWalletAddress` from `/quote`. Pass the resulting signature as `userSignat… */
    typedDataToSign: z.string().optional(),
    /** Signing scheme required by this vendor. Pass this as `signingScheme` in `POST /order/submit`. */
    signingScheme: z.string().optional(),
    /** Approve transaction data, present only when `approveTransaction=true` was passed and the from-token is an EVM ERC-20. Each element is a JSON string containing `approveContract` (the spender address, resolved per vendor: … */
    signatureData: z.array(z.string()).optional(),
  })
  .passthrough();

export const SwapData = z
  .object({
    routerResult: SwapRouterResult.optional(),
    tx: SwapTx.optional(),
    /** Execution mode for this swap. `SWAP` = sign the `tx` object and broadcast to the chain. `RFQ` = sign `rfq.typedDataToSign` with EIP-712 (`eth_signTypedData_v4`), then submit via `POST /order/submit` and poll `GET /order/… */
    executionMode: z.string().optional(),
    rfq: SwapRfq.nullable().optional(),
  })
  .passthrough();

export const QuoteAndSwapRfq = z
  .object({
    /** RFQ vendor that will settle this order on-chain. Pass this as the `vendor` field in `POST /order/submit`. */
    vendor: z.string().optional(),
    /** Transaction type for this RFQ order. Currently always `EIP712` (all three RFQ vendors use EIP-712 typed-data signing); reserved for future signing schemes. */
    txType: z.string().optional(),
    /** EIP-712 typed data payload for `eth_signTypedData_v4`, serialized as a hex string (or JSON-encoded string). Sign with the wallet that matches `userWalletAddress` from `/quote`. Pass the resulting signature as `userSignat… */
    typedDataToSign: z.string().optional(),
    /** Signing scheme required by this vendor. Pass this as `signingScheme` in `POST /order/submit`. */
    signingScheme: z.string().optional(),
    /** Approve transaction data, present only when `approveTransaction=true` was passed and the from-token is an EVM ERC-20. Each element is a JSON string containing `approveContract` (the spender address, resolved per vendor: … */
    signatureData: z.array(z.string()).optional(),
  })
  .passthrough();

export const QuoteAndSwapData = z
  .object({
    routerResult: SwapRouterResult.optional(),
    tx: SwapTx.optional(),
    /** Always `SWAP` for this endpoint — returns executable calldata / swapTransaction to sign and broadcast on-chain (no `RFQ` mode). */
    executionMode: z.string().optional(),
    rfq: QuoteAndSwapRfq.nullable().optional(),
  })
  .passthrough();

export const SolanaInstructionAccount = z
  .object({
    /** Account public key (Base58). */
    pubkey: z.string().optional(),
    /** Whether the account must sign the transaction. */
    isSigner: z.boolean().optional(),
    /** Whether the account is writable. */
    isWritable: z.boolean().optional(),
  })
  .passthrough();

export const SolanaInstruction = z
  .object({
    /** Program that owns the instruction (Base58). */
    programId: z.string().optional(),
    /** Instruction data, Base64-encoded. May be an empty string for instructions without data. */
    data: z.string().optional(),
    /** Accounts referenced by the instruction, in ABI order. */
    accounts: z.array(SolanaInstructionAccount).optional(),
  })
  .passthrough();

export const SolanaDexProtocol = z
  .object({
    dexName: z.string().optional(),
    percent: z.string().optional(),
  })
  .passthrough();

export const SolanaRouteFromToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
  })
  .passthrough();

export const SolanaRouteToToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
  })
  .passthrough();

export const SolanaDexRoute = z
  .object({
    dexProtocol: SolanaDexProtocol.optional(),
    fromToken: SolanaRouteFromToken.optional(),
    fromTokenIndex: z.string().optional(),
    toToken: SolanaRouteToToken.optional(),
    toTokenIndex: z.string().optional(),
  })
  .passthrough();

export const SolanaFromToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
    decimal: z.string().optional(),
  })
  .passthrough();

export const SolanaToToken = z
  .object({
    tokenContractAddress: z.string().optional(),
    tokenSymbol: z.string().optional(),
    decimal: z.string().optional(),
  })
  .passthrough();

export const SolanaRouterResult = z
  .object({
    /** Chain identifier (always `CT_501`). */
    binanceChainId: z.string().optional(),
    /** Vendor that supplied the executed quote (Solana vendors include Jupiter, LiquidMesh). */
    vendorName: z.string().optional(),
    /** Sell-token amount (smallest unit, integer string). */
    fromTokenAmount: z.string().optional(),
    /** Estimated buy-token amount (smallest unit, integer string). */
    toTokenAmount: z.string().optional(),
    /** Estimated network fee in USD. */
    tradeFee: z.string().nullable().optional(),
    /** Estimated compute units for the transaction (echoes `computeUnitLimit`). */
    estimateGasFee: z.string().nullable().optional(),
    /** Routing path description, mints joined with "--". */
    router: z.string().optional(),
    /** Price impact percentage. */
    priceImpactPercent: z.string().optional(),
    /** Routing path segments (same shape as `/quote`'s `dexRouterList`). */
    dexRouterList: z.array(SolanaDexRoute).optional(),
    fromToken: SolanaFromToken.optional(),
    toToken: SolanaToToken.optional(),
    /** Fee amount deducted for this swap (smallest unit, integer string). Only populated when the request enabled the custom fee; `null` otherwise. `FROM_TOKEN` direction = `originalFromCoinAmount × feePercent/100` (HALF_UP); `… */
    feeAmount: z.string().nullable().optional(),
    /** Contract address of the token in which the fee is denominated. `FROM_TOKEN` direction = sell-token address; `TO_TOKEN` direction = buy-token address. `null` when the custom fee is not enabled. */
    feeToken: z.string().nullable().optional(),
    /** Actual amount participating in the DEX swap (smallest unit, integer string). `FROM_TOKEN` direction = net amount after fee deduction (`fromTokenAmount − feeAmount`); `TO_TOKEN` direction = original input amount (fee is t… */
    actualSwapAmount: z.string().nullable().optional(),
  })
  .passthrough();

export const SolanaSwapTx = z
  .object({
    /** User wallet address (transaction sender / fee payer). */
    from: z.string().optional(),
    /** Platform Router program address (the swap target program). */
    to: z.string().optional(),
    /** Minimum buy-token amount the user accepts at the slippage limit (smallest unit, integer string). */
    minReceiveAmount: z.string().optional(),
    /** Slippage value applied to this transaction (percentage string). */
    slippagePercent: z.string().optional(),
  })
  .passthrough();

export const SolanaSwapInstructions = z
  .object({
    /** Address Lookup Table addresses (Base58) referenced by the transaction, including the platform-injected custom ALT. The caller must fetch each ALT account (`getAccountInfo`) and pass the parsed lookup data when compiling … */
    addressLookupTableAccount: z.array(z.string()).optional(),
    /** Ordered uncompiled instructions to assemble into the v0 transaction. */
    instructionLists: z.array(SolanaInstruction).optional(),
    routerResult: SolanaRouterResult.optional(),
    tx: SolanaSwapTx.optional(),
  })
  .passthrough();

export const StatusFromTokenDetail = z
  .object({
    /** Token ticker. Null when metadata cannot be resolved. */
    symbol: z.string().nullable().optional(),
    /** Token amount in the smallest unit (integer string). "1500000" = 1.5 USDT (decimals=6). */
    amount: z.string().optional(),
    /** Token contract address. */
    tokenAddress: z.string().optional(),
  })
  .passthrough();

export const StatusToTokenDetail = z
  .object({
    symbol: z.string().nullable().optional(),
    /** Token amount in the smallest unit (integer string). */
    amount: z.string().optional(),
    /** Token contract address. */
    tokenAddress: z.string().optional(),
  })
  .passthrough();

export const SwapTransactionStatus = z
  .object({
    /** Chain identifier. */
    binanceChainId: z.string().optional(),
    /** Transaction hash. */
    txHash: z.string().optional(),
    /** Block height the transaction was included in (decimal string). */
    height: z.string().optional(),
    /** Transaction timestamp (Unix epoch milliseconds, string form). */
    txTime: z.string().optional(),
    /** Transaction status. Typical values "success" or "failed". */
    status: z.string().optional(),
    /** Sender address. */
    fromAddress: z.string().optional(),
    /** Recipient address (typically the DEX router). */
    toAddress: z.string().optional(),
    /** Error message when `status=failed`; null otherwise. */
    errorMsg: z.string().nullable().optional(),
    /** Gas limit (decimal string). Null on Solana. */
    gasLimit: z.string().nullable().optional(),
    /** Gas actually consumed (decimal string, wei). Null on Solana. */
    gasUsed: z.string().nullable().optional(),
    /** Gas price (decimal string, wei). Null on Solana. */
    gasPrice: z.string().nullable().optional(),
    /** Transaction fee in the chain's native unit. Null on Solana. */
    txFee: z.string().nullable().optional(),
    /** EIP-1559 priority fee (wei) on EVM, prioritization fee (lamports) on Solana, null on legacy EVM transactions. */
    priorityFee: z.string().nullable().optional(),
    /** Transaction action; currently fixed to "Swap" when an aggregator event is present. Null otherwise. */
    txType: z.string().nullable().optional(),
    /** DEX router contract address (mirrors `toAddress`). Null when no aggregator event is present. */
    dexRouter: z.string().nullable().optional(),
    /** Sell-token details. Populated when an aggregator event is present; null otherwise. */
    fromTokenDetails: z.array(StatusFromTokenDetail).nullable().optional(),
    /** Buy-token details. Populated when an aggregator event is present; null otherwise. */
    toTokenDetails: z.array(StatusToTokenDetail).nullable().optional(),
  })
  .passthrough();

export const RfqOrderSubmitted = z
  .object({
    /** Platform-generated order ID. Use this to poll `GET /order/{orderId}` for the final settlement status. */
    orderId: z.string().optional(),
    /** Initial order status after submission. Typical value: `PENDING_VENDOR` (forwarded to vendor, awaiting settlement). */
    status: z.string().optional(),
    /** Order creation timestamp (Unix epoch milliseconds). */
    createdAt: z.number().optional(),
  })
  .passthrough();

export const RfqOrderStatus = z
  .object({
    /** Platform order ID. */
    orderId: z.string().optional(),
    /** Current order status. - **Terminal**: `FILLED` (settled on-chain), `FAILED` (settlement failed),   `EXPIRED` (vendor could not settle before the order deadline), `CANCELLED`   (cancelled by the user or vendor).  - **Inte… */
    status: z.string().optional(),
    /** On-chain transaction hash. Present only when `status=FILLED`. */
    txHash: z.string().nullable().optional(),
    /** Actual sell-token amount settled (smallest unit, integer string). Present when filled. */
    fromAmount: z.string().nullable().optional(),
    /** Actual buy-token amount received (smallest unit, integer string). Present when filled. */
    toAmount: z.string().nullable().optional(),
    /** Settlement timestamp (Unix epoch milliseconds). Present when filled. */
    filledAt: z.number().nullable().optional(),
    /** Order creation timestamp (Unix epoch milliseconds). */
    createdAt: z.number().optional(),
  })
  .passthrough();
