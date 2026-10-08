/**
 * Documented response schemas — transaction. GENERATED, then reviewed; do not hand-edit field lists.
 *
 * Transcribed from the docs' OpenAPI document (web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/1.0.0/schema.json,
 * rendered at catalog/web3-wallet/api/rest-api/{transaction-api}) via the operation models of the official connector
 * @binance-web3/wallet@13.0.1, which is generated from the same spec (identical operationIds). Every object is
 * .passthrough() so undocumented fields survive; telemetry reports them as doc drift.
 */
import { z } from "zod";

export const TransactionChain = z
  .object({
    /** Unique chain identifier (follows EIP-155 chainId for EVM chains; e.g. "1"=Ethereum, "56"=BSC, "CT_501"=Solana, "CT_195"=Tron). */
    binanceChainId: z.string().optional(),
    /** Full chain name. */
    name: z.string().optional(),
    /** Short chain name / ticker. */
    shortName: z.string().optional(),
    /** Chain logo image URL. */
    logoUrl: z.string().optional(),
  })
  .passthrough();

export const EvmLegacyGasPrice = z
  .object({
    /** Slow tier gas price in wei. */
    lowGasPrice: z.string().optional(),
    /** Average tier gas price in wei. */
    mediumGasPrice: z.string().optional(),
    /** Fast tier gas price in wei. */
    highGasPrice: z.string().optional(),
  })
  .passthrough();

export const Eip1559GasPrice = z
  .object({
    /** Current block base fee in wei. */
    baseFee: z.string().optional(),
    /** Slow tier max priority fee per gas (wei). */
    lowPriorityFee: z.string().optional(),
    /** Slow tier max fee per gas (wei). */
    lowMaxFee: z.string().optional(),
    /** Average tier max priority fee per gas (wei). */
    mediumPriorityFee: z.string().optional(),
    /** Average tier max fee per gas (wei). */
    mediumMaxFee: z.string().optional(),
    /** Fast tier max priority fee per gas (wei). */
    highPriorityFee: z.string().optional(),
    /** Fast tier max fee per gas (wei). */
    highMaxFee: z.string().optional(),
  })
  .passthrough();

export const SolanaGasPrice = z
  .object({
    /** Slow tier compute-unit price (micro-lamports per compute unit). */
    lowComputeUnitPrice: z.string().optional(),
    /** Slow tier Jito tip in lamports. */
    lowJitoTip: z.string().optional(),
    mediumComputeUnitPrice: z.string().optional(),
    mediumJitoTip: z.string().optional(),
    highComputeUnitPrice: z.string().optional(),
    highJitoTip: z.string().optional(),
  })
  .passthrough();

export const GasPrice = z
  .object({
    evmLegacyGasPrice: EvmLegacyGasPrice.nullable().optional(),
    eip1559GasPrice: Eip1559GasPrice.nullable().optional(),
    solanaGasPrice: SolanaGasPrice.nullable().optional(),
  })
  .passthrough();

export const BlockHeight = z
  .object({
    /** The chain identifier echoed back from the request. */
    binanceChainId: z.string().optional(),
    /** Latest block height (slot for Solana) tracked by the Binance Web3 node. Represented as a 64-bit integer. */
    blockHeight: z.number().optional(),
  })
  .passthrough();

export const GasLimit = z
  .object({
    /** Estimated gas limit (EVM), compute-unit ceiling (Solana), or fee limit in sun (Tron), as an integer string. */
    gasLimit: z.string().optional(),
    /** Energy consumed by the Tron transaction (integer string). Null on non-Tron chains. */
    energyRequired: z.string().nullable().optional(),
    /** Bandwidth consumed by the Tron transaction (integer string). Null on non-Tron chains. */
    bandwidthRequired: z.string().nullable().optional(),
    /** Free energy available to the account on Tron (integer string). Null on non-Tron chains. */
    freeEnergy: z.string().nullable().optional(),
    /** Free bandwidth available to the account on Tron (integer string). Null on non-Tron chains. */
    freeBandwidth: z.string().nullable().optional(),
    /** Unit price of energy on Tron (sun per energy, integer string). Null on non-Tron chains. */
    energyFee: z.string().nullable().optional(),
    /** Unit price of bandwidth on Tron (sun per byte, integer string). Null on non-Tron chains. */
    bandwidthFee: z.string().nullable().optional(),
  })
  .passthrough();

export const SimulatedBalanceChange = z
  .object({
    /** Token contract address. Empty / native marker for the chain's native asset. */
    contractAddress: z.string().optional(),
    /** Token standard. */
    tokenType: z.string().optional(),
    /** Signed balance delta in the smallest token unit (integer string). Negative for outflows, positive for inflows. */
    change: z.string().optional(),
    /** Address whose balance is changing. */
    owner: z.string().optional(),
  })
  .passthrough();

export const SimulatedAllowanceChange = z
  .object({
    /** ERC-20 token contract address. */
    tokenAddress: z.string().optional(),
    /** Token owner address. */
    owner: z.string().optional(),
    /** Spender address whose allowance is changing. */
    spender: z.string().optional(),
    /** Allowance before the transaction (smallest unit, integer string). */
    preAmount: z.string().optional(),
    /** Allowance after the transaction (smallest unit, integer string). */
    postAmount: z.string().optional(),
  })
  .passthrough();

export const Simulation = z
  .object({
    /** Predicted execution status. */
    status: z.string().optional(),
    /** Failure reason when `status=FAILED`; otherwise null. */
    failReason: z.string().nullable().optional(),
    /** Predicted balance changes for the simulated transaction. */
    balanceChanges: z.array(SimulatedBalanceChange).optional(),
    /** Predicted ERC-20 allowance changes (EVM chains only). */
    allowanceChanges: z.array(SimulatedAllowanceChange).optional(),
  })
  .passthrough();

export const BroadcastResult = z
  .object({
    /** Internal order identifier. Use this to query on-chain status via the post-transaction service. */
    orderId: z.string().optional(),
    /** On-chain transaction hash. EVM chains return a hex hash; Tron returns a base58check hash; Solana returns a base58 hash. */
    txHash: z.string().optional(),
  })
  .passthrough();

export const BroadcastOrder = z
  .object({
    /** Internal order identifier. */
    orderId: z.string().optional(),
    /** Chain identifier. */
    binanceChainId: z.string().optional(),
    /** Sender wallet address. */
    address: z.string().optional(),
    /** On-chain transaction hash. Null while the order is pending. */
    txHash: z.string().nullable().optional(),
    /** Transaction status (server-defined string, e.g. "pending", "success", "fail"). */
    txStatus: z.string().optional(),
    /** Failure reason. Populated when the transaction failed; null otherwise. */
    failReason: z.string().nullable().optional(),
  })
  .passthrough();

export const BroadcastOrdersPage = z
  .object({
    /** Cursor for the next page. Empty string when no more pages. */
    cursor: z.string().optional(),
    /** Order list. */
    orders: z.array(BroadcastOrder).optional(),
  })
  .passthrough();
