/**
 * Wallet API — supported chains, balances, address history, transaction detail by hash.
 * Reference: catalog/web3-wallet/api/rest-api/wallet-api · Guide: products/wallet-api/introduction.md
 */
import { z } from "zod";
import type { BinanceWeb3Client } from "../client.ts";
import { type CallOptions, DOCS, endpoint } from "../endpoint.ts";
import * as S from "../schemas/wallet.ts";
import { chunk, need } from "./util.ts";

const docs = `${DOCS}/wallet-api`;

export const walletEndpoints = {
  supportedChains: endpoint({ id: "wallet.supportedChains", module: "wallet", method: "GET", path: "/api/v1/dex/balance/supported/chain", data: z.array(S.WalletChain), docs }),
  allTokenBalances: endpoint({ id: "wallet.allTokenBalances", module: "wallet", method: "GET", path: "/api/v1/dex/balance/all-token-balances-by-address", data: z.array(S.AllTokenBalances), docs }),
  tokenBalances: endpoint({ id: "wallet.tokenBalances", module: "wallet", method: "POST", path: "/api/v1/dex/balance/token-balances-by-address", data: z.array(S.TokenBalances), docs }),
  transactions: endpoint({ id: "wallet.transactions", module: "wallet", method: "GET", path: "/api/v1/dex/post-transaction/transactions-by-address", data: z.array(S.AddressTransactionsPage), docs }),
  transactionDetail: endpoint({ id: "wallet.transactionDetail", module: "wallet", method: "GET", path: "/api/v1/dex/post-transaction/transaction-detail-by-txhash", data: z.array(S.TransactionDetail), docs }),
} as const;

export const TOKEN_BALANCES_BATCH_MAX = 20;

export class WalletApi {
  constructor(private readonly client: BinanceWeb3Client) {}

  supportedChains(params: { binanceChainId?: string } = {}, opts?: CallOptions) {
    return this.client.call(walletEndpoints.supportedChains, { query: { binanceChainId: params.binanceChainId } }, opts);
  }

  /** All balances; `chains` currently accepts a single chain id (multi-chain returns an error per docs). */
  allTokenBalances(params: { address: string; chains: string; excludeRiskToken?: boolean; page?: number; pageSize?: number }, opts?: CallOptions) {
    const ep = "GET /api/v1/dex/balance/all-token-balances-by-address";
    need("wallet", ep, "address", params.address);
    need("wallet", ep, "chains", params.chains);
    return this.client.call(walletEndpoints.allTokenBalances, { query: { ...params } }, opts);
  }

  /**
   * Balances for specific tokens (≤20 per request; longer lists are split). Note the documented
   * `excludeRiskToken` here is a string enum: "0" = exclude (default), "1" = include.
   */
  async tokenBalances(
    params: { address: string; tokenContractAddresses: readonly { binanceChainId: string; tokenContractAddress: string }[]; excludeRiskToken?: "0" | "1" },
    opts?: CallOptions,
  ) {
    need("wallet", "POST /api/v1/dex/balance/token-balances-by-address", "tokenContractAddresses", params.tokenContractAddresses);
    const out: z.infer<typeof S.TokenBalances>[] = [];
    for (const batch of chunk(params.tokenContractAddresses, TOKEN_BALANCES_BATCH_MAX)) {
      const body = { address: params.address, tokenContractAddresses: batch, excludeRiskToken: params.excludeRiskToken };
      out.push(...(await this.client.call(walletEndpoints.tokenBalances, { body }, opts)));
    }
    return out;
  }

  transactions(
    params: { address: string; chains: readonly string[] | string; tokenContractAddress?: string; begin?: number; end?: number; cursor?: string; limit?: number },
    opts?: CallOptions,
  ) {
    return this.client.call(walletEndpoints.transactions, { query: { ...params } }, opts);
  }

  /**
   * Transaction detail (`data[].txStatus`: pending/success/fail). Right after broadcast the array may
   * be empty while indexing catches up — treat as "not indexed yet" and poll.
   */
  transactionDetail(params: { binanceChainId: string; txHash: string; itype?: string }, opts?: CallOptions) {
    const ep = "GET /api/v1/dex/post-transaction/transaction-detail-by-txhash";
    need("wallet", ep, "binanceChainId", params.binanceChainId);
    need("wallet", ep, "txHash", params.txHash);
    return this.client.call(walletEndpoints.transactionDetail, { query: { ...params } }, opts);
  }
}
