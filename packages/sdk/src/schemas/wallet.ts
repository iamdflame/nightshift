/**
 * Documented response schemas — wallet. GENERATED, then reviewed; do not hand-edit field lists.
 *
 * Transcribed from the docs' OpenAPI document (web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/1.0.0/schema.json,
 * rendered at catalog/web3-wallet/api/rest-api/{wallet-api}) via the operation models of the official connector
 * @binance-web3/wallet@13.0.1, which is generated from the same spec (identical operationIds). Every object is
 * .passthrough() so undocumented fields survive; telemetry reports them as doc drift.
 */
import { z } from "zod";

export const WalletChain = z
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

export const TokenAsset = z
  .object({
    /** Chain identifier. */
    binanceChainId: z.string().optional(),
    /** Token contract address. Empty string for the chain's native asset. */
    tokenContractAddress: z.string().optional(),
    /** Wallet address echoed from the request. */
    address: z.string().optional(),
    /** Token ticker. */
    symbol: z.string().optional(),
    /** Token amount scaled by decimals (decimal string). */
    balance: z.string().optional(),
    /** Raw token amount in the smallest unit (integer string). Empty string when the chain doesn't expose a raw value. */
    rawBalance: z.string().optional(),
    /** Token USD price (decimal string). */
    tokenPrice: z.string().optional(),
    /** Whether the token is risk-flagged. */
    isRiskToken: z.boolean().optional(),
  })
  .passthrough();

export const AllTokenBalances = z
  .object({
    /** Current page number. */
    page: z.number().optional(),
    /** Page size. */
    pageSize: z.number().optional(),
    /** Token balance entries for this chain. */
    tokenAssets: z.array(TokenAsset).optional(),
  })
  .passthrough();

export const TokenBalanceAsset = z
  .object({
    /** Chain identifier. */
    binanceChainId: z.string().optional(),
    /** Token contract address. Empty string for the chain's native asset. */
    tokenContractAddress: z.string().optional(),
    /** Wallet address echoed from the request. */
    address: z.string().optional(),
    /** Token ticker. */
    symbol: z.string().optional(),
    /** Token amount scaled by decimals. */
    balance: z.string().optional(),
    /** Raw token amount in the smallest unit. Empty string when the chain doesn't expose a raw value. */
    rawBalance: z.string().optional(),
    /** Token USD price. */
    tokenPrice: z.string().optional(),
    /** Whether the token is risk-flagged. */
    isRiskToken: z.boolean().optional(),
  })
  .passthrough();

export const TokenBalances = z
  .object({
    /** Matched token balances for this chain. */
    tokenAssets: z.array(TokenBalanceAsset).optional(),
  })
  .passthrough();

export const AddressTxParty = z
  .object({
    /** Sender address. For multi-sig transactions, comma-separated. */
    address: z.string().optional(),
    /** Input amount (smallest unit, decimal string). */
    amount: z.string().optional(),
  })
  .passthrough();

export const AddressTxCounterparty = z
  .object({
    /** Receiver address. For multi-sig transactions, comma-separated. */
    address: z.string().optional(),
    /** Output amount. */
    amount: z.string().optional(),
  })
  .passthrough();

export const AddressTransaction = z
  .object({
    /** Chain identifier. */
    binanceChainId: z.string().optional(),
    /** On-chain transaction hash. */
    txHash: z.string().optional(),
    /** Transaction layer type. "0"=outer native-token transfer, "1"=internal contract native-token transfer, "2"=token transfer. */
    itype: z.string().optional(),
    /** Contract method ID (function selector). Null for plain native-token transfers. */
    methodId: z.string().nullable().optional(),
    /** Sender's nonce for this transaction. */
    nonce: z.string().optional(),
    /** Transaction time (Unix milliseconds, string form). */
    txTime: z.string().optional(),
    /** Inputs (sender addresses and amounts). */
    from: z.array(AddressTxParty).optional(),
    /** Outputs (receiver addresses and amounts). */
    to: z.array(AddressTxCounterparty).optional(),
    /** Token contract address. Null for native-token transfers. */
    tokenContractAddress: z.string().nullable().optional(),
    /** Transaction amount in the token's smallest unit. */
    amount: z.string().optional(),
    /** Symbol of the transferred asset. */
    symbol: z.string().optional(),
    /** Transaction fee (native-token amount, decimal string). */
    txFee: z.string().optional(),
    /** Transaction status. */
    txStatus: z.string().optional(),
    /** Whether the transaction matches a blacklist rule. */
    hitBlacklist: z.boolean().nullable().optional(),
  })
  .passthrough();

export const AddressTransactionsPage = z
  .object({
    /** Cursor for the next page within this chain. Empty string when no more pages. */
    cursor: z.string().optional(),
    /** Transaction history items, sorted by time (descending). */
    transactionList: z.array(AddressTransaction).optional(),
  })
  .passthrough();

export const TxFromDetail = z
  .object({
    /** Sender / input address. */
    address: z.string().optional(),
    /** Current transaction input index (UTXO chains). */
    vinIndex: z.string().nullable().optional(),
    /** Linked previous output index (UTXO chains). */
    preVoutIndex: z.string().nullable().optional(),
    /** Previous transaction hash (UTXO chains, locates the input UTXO together with `preVoutIndex`). */
    txHash: z.string().nullable().optional(),
    /** Whether the sender address is a contract. */
    isContract: z.boolean().nullable().optional(),
    /** Input amount. */
    amount: z.string().optional(),
  })
  .passthrough();

export const TxToDetail = z
  .object({
    /** Receiver / output address. */
    address: z.string().optional(),
    /** Output index (UTXO chains). */
    voutIndex: z.string().nullable().optional(),
    /** Whether the receiver address is a contract. */
    isContract: z.boolean().nullable().optional(),
    /** Output amount. */
    amount: z.string().optional(),
  })
  .passthrough();

export const TxInternalDetail = z
  .object({
    /** Sender address. */
    from: z.string().optional(),
    /** Receiver address. */
    to: z.string().optional(),
    /** Whether the sender is a contract. */
    isFromContract: z.boolean().nullable().optional(),
    /** Whether the receiver is a contract. */
    isToContract: z.boolean().nullable().optional(),
    /** Internal call amount. */
    amount: z.string().optional(),
    /** Internal call status. */
    txStatus: z.string().optional(),
  })
  .passthrough();

export const TxTokenTransfer = z
  .object({
    /** Sender address. */
    from: z.string().optional(),
    /** Receiver address. */
    to: z.string().optional(),
    /** Whether the sender is a contract. */
    isFromContract: z.boolean().nullable().optional(),
    /** Whether the receiver is a contract. */
    isToContract: z.boolean().nullable().optional(),
    /** Token contract address. */
    tokenContractAddress: z.string().optional(),
    /** Token ticker. */
    symbol: z.string().optional(),
    /** Transfer amount (smallest unit, decimal string). */
    amount: z.string().optional(),
  })
  .passthrough();

export const TransactionDetail = z
  .object({
    /** Chain identifier. */
    chainIndex: z.string().optional(),
    /** Block height (decimal string). */
    height: z.string().optional(),
    /** Transaction time (Unix milliseconds, string form). */
    txTime: z.string().optional(),
    /** On-chain transaction hash. */
    txhash: z.string().optional(),
    /** Transaction status. One of: "success", "fail", "pending". */
    txStatus: z.string().optional(),
    /** Gas limit (decimal string). */
    gasLimit: z.string().nullable().optional(),
    /** Gas actually consumed. */
    gasUsed: z.string().nullable().optional(),
    /** Gas price (wei, decimal string). */
    gasPrice: z.string().nullable().optional(),
    /** Transaction fee in the chain's native token. */
    txFee: z.string().optional(),
    /** Sender nonce. */
    nonce: z.string().optional(),
    /** Transaction amount. */
    amount: z.string().optional(),
    /** Symbol of the transferred asset. */
    symbol: z.string().optional(),
    /** Contract method ID (function selector). Null for plain native-token transfers. */
    methodId: z.string().nullable().optional(),
    /** L1 origin transaction hash for rollup / L2 transactions; null otherwise. */
    l1OriginHash: z.string().nullable().optional(),
    /** Transaction inputs (sender details). */
    fromDetails: z.array(TxFromDetail).optional(),
    /** Transaction outputs (receiver details). */
    toDetails: z.array(TxToDetail).optional(),
    /** Internal transaction details. */
    internalTransactionDetails: z.array(TxInternalDetail).optional(),
    /** Token transfer details emitted by this transaction. */
    tokenTransferDetails: z.array(TxTokenTransfer).optional(),
  })
  .passthrough();
