/**
 * Transaction API — gas estimation, simulation, broadcasting, broadcast-order status.
 * Reference: catalog/web3-wallet/api/rest-api/transaction-api · Guide: products/transaction-api/introduction.md
 *
 * Broadcast is the one non-idempotent write: it is attempted exactly once (retry class "never").
 * Transaction detail by hash is documented under the Wallet API; `detailByHash` delegates to it.
 */
import { z } from "zod";
import type { BinanceWeb3Client } from "../client.ts";
import { type CallOptions, DOCS, endpoint } from "../endpoint.ts";
import * as S from "../schemas/transaction.ts";
import { need } from "./util.ts";

const docs = `${DOCS}/transaction-api`;
const PRE = "/api/v1/dex/pre-transaction";

export const transactionEndpoints = {
  supportedChains: endpoint({ id: "transaction.supportedChains", module: "transaction", method: "GET", path: `${PRE}/supported/chain`, data: z.array(S.TransactionChain), docs }),
  gasPrice: endpoint({ id: "transaction.gasPrice", module: "transaction", method: "GET", path: `${PRE}/gas-price`, data: S.GasPrice, docs }),
  blockHeight: endpoint({ id: "transaction.blockHeight", module: "transaction", method: "GET", path: `${PRE}/block-height`, data: S.BlockHeight, docs }),
  gasLimit: endpoint({ id: "transaction.gasLimit", module: "transaction", method: "POST", path: `${PRE}/gas-limit`, data: S.GasLimit, docs }),
  simulate: endpoint({ id: "transaction.simulate", module: "transaction", method: "POST", path: `${PRE}/simulate`, data: S.Simulation, docs }),
  broadcast: endpoint({ id: "transaction.broadcast", module: "transaction", method: "POST", path: `${PRE}/broadcast-transaction`, data: S.BroadcastResult, retry: "never", docs }),
  orders: endpoint({ id: "transaction.orders", module: "transaction", method: "GET", path: "/api/v1/dex/post-transaction/orders", data: S.BroadcastOrdersPage, docs }),
} as const;

export interface EvmTx {
  from: string;
  to: string;
  /** Wei, integer string ("0" for ERC-20 calls). */
  value: string;
  data?: string;
}

export interface TronTx {
  from: string;
  txType: "TRIGGER_SMART_CONTRACT" | "TRANSFER_CONTRACT";
  triggerSmartContractParams?: Record<string, unknown>;
  transferContractParams?: Record<string, unknown>;
}

/** Exactly one of evmTx / solTx / tronTx, matching the chain. */
export type TxEnvelope = { binanceChainId: string } & ({ evmTx: EvmTx } | { solTx: { base64Tx: string } } | { tronTx: TronTx });

export interface BroadcastParams {
  binanceChainId: string;
  /** EVM: 0x-hex RLP; Solana: base64; Tron: signed JSON string ({raw_data, signature}). */
  signedTransaction: string;
  /** Sender address (EVM: data.tx.from). */
  address: string;
  /** EVM only: route via a private mempool. */
  enableMevProtection?: boolean;
}

export class TransactionApi {
  constructor(private readonly client: BinanceWeb3Client) {}

  supportedChains(opts?: CallOptions) {
    return this.client.call(transactionEndpoints.supportedChains, {}, opts);
  }

  gasPrice(params: { binanceChainId: string }, opts?: CallOptions) {
    return this.client.call(transactionEndpoints.gasPrice, { query: { binanceChainId: params.binanceChainId } }, opts);
  }

  /** Latest block height (slot on Solana) synced by the Binance Web3 node — a node-lag risk signal. */
  blockHeight(params: { binanceChainId: string }, opts?: CallOptions) {
    return this.client.call(transactionEndpoints.blockHeight, { query: { binanceChainId: params.binanceChainId } }, opts);
  }

  gasLimit(params: TxEnvelope, opts?: CallOptions) {
    return this.client.call(transactionEndpoints.gasLimit, { body: params }, opts);
  }

  simulate(params: TxEnvelope, opts?: CallOptions) {
    return this.client.call(transactionEndpoints.simulate, { body: params }, opts);
  }

  /** Broadcast a signed transaction. Never retried automatically: on any failure, reconcile first. */
  broadcast(params: BroadcastParams, opts?: CallOptions) {
    const ep = "POST /api/v1/dex/pre-transaction/broadcast-transaction";
    need("transaction", ep, "binanceChainId", params.binanceChainId);
    need("transaction", ep, "signedTransaction", params.signedTransaction);
    need("transaction", ep, "address", params.address);
    return this.client.call(transactionEndpoints.broadcast, { body: params }, opts);
  }

  orders(params: { address: string; binanceChainId: string; txStatus?: string; orderId?: string; cursor?: string; limit?: number }, opts?: CallOptions) {
    return this.client.call(transactionEndpoints.orders, { query: { ...params } }, opts);
  }

  /** Alias of wallet.transactionDetail (documented under the Wallet API). */
  detailByHash(params: { binanceChainId: string; txHash: string }, opts?: CallOptions) {
    return this.client.wallet.transactionDetail(params, opts);
  }
}
