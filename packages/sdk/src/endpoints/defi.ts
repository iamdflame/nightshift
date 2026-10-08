/**
 * DeFi API — position/protocol/investment data and unsigned calldata builders.
 * Reference: catalog/web3-wallet/api/rest-api/{defi-data,defi-transaction} · Guides:
 * products/defi-api/{introduction,integration-flow,supported-chains}.md
 *
 * Builders return `dataList` (APPROVE first when needed, then the main action) and, with
 * `simulate: true`, a `preview`. They never touch chain state, so they are retry-safe. Amounts are
 * human-readable decimal strings (not smallest units) on this API.
 */
import type { BinanceWeb3Client } from "../client.ts";
import { type CallOptions, DOCS, endpoint } from "../endpoint.ts";
import * as S from "../schemas/defi.ts";
import { need } from "./util.ts";

const data = `${DOCS}/defi-data`;
const tx = `${DOCS}/defi-transaction`;
const D = "/api/v1/defi/data";
const T = "/api/v1/defi/transaction";

export const defiEndpoints = {
  positions: endpoint({ id: "defi.positions", module: "defi", method: "POST", path: `${D}/position/list`, data: S.PositionList, docs: data }),
  protocols: endpoint({ id: "defi.protocols", module: "defi", method: "POST", path: `${D}/protocol/list`, data: S.ProtocolPage, docs: data }),
  protocolDetail: endpoint({ id: "defi.protocolDetail", module: "defi", method: "POST", path: `${D}/protocol/detail`, data: S.ProtocolDetail, docs: data }),
  investments: endpoint({ id: "defi.investments", module: "defi", method: "POST", path: `${D}/investment/list`, data: S.InvestmentPage, docs: data }),
  investmentDetail: endpoint({ id: "defi.investmentDetail", module: "defi", method: "POST", path: `${D}/investment/detail`, data: S.InvestmentDetail, docs: data }),
  deposit: endpoint({ id: "defi.deposit", module: "defi", method: "POST", path: `${T}/deposit`, data: S.DefiTx, docs: tx }),
  redeem: endpoint({ id: "defi.redeem", module: "defi", method: "POST", path: `${T}/redeem`, data: S.DefiTx, docs: tx }),
  lpAdd: endpoint({ id: "defi.lpAdd", module: "defi", method: "POST", path: `${T}/lp-add`, data: S.DefiTx, docs: tx }),
  lpAddCalculate: endpoint({ id: "defi.lpAddCalculate", module: "defi", method: "POST", path: `${T}/lp-add/calculate`, data: S.LpAddCalculation, docs: tx }),
  lpRemove: endpoint({ id: "defi.lpRemove", module: "defi", method: "POST", path: `${T}/lp-remove`, data: S.DefiTx, docs: tx }),
  claim: endpoint({ id: "defi.claim", module: "defi", method: "POST", path: `${T}/claim`, data: S.DefiTx, docs: tx }),
} as const;

export type InvestType = "Earn" | "LiquidityPool";
export type ClaimType = "REWARD_PROTOCOL" | "REWARD_INVESTMENT" | "LP_FEE" | "REDEMPTION";

export interface DefiTokenAmount {
  /** Token address; 0xeeee…eeee (40 e's) is the native coin. */
  tokenAddress: string;
  /** Human-readable decimal string, e.g. "1.5". */
  amount: string;
}

interface Paging {
  sortField?: "tvl" | "apy";
  sortDirection?: "ASC" | "DESC";
  page?: number;
  size?: number;
}

export class DefiApi {
  constructor(private readonly client: BinanceWeb3Client) {}

  /** Positions for up to 3 addresses (server-configured budget shared across chains). */
  positions(params: { addresses: readonly string[]; binanceChainIds?: readonly string[] }, opts?: CallOptions) {
    need("defi", "POST /api/v1/defi/data/position/list", "addresses", params.addresses);
    return this.client.call(defiEndpoints.positions, { body: params }, opts);
  }

  protocols(params: { binanceChainId?: string; investType?: InvestType } & Paging = {}, opts?: CallOptions) {
    return this.client.call(defiEndpoints.protocols, { body: params }, opts);
  }

  protocolDetail(params: { defiProtocolId: string }, opts?: CallOptions) {
    return this.client.call(defiEndpoints.protocolDetail, { body: params }, opts);
  }

  /** `tokenAddressList` requires `binanceChainId` (else 40001). */
  investments(params: { investType: InvestType; defiProtocolId?: string; tokenAddressList?: readonly string[]; binanceChainId?: string } & Paging, opts?: CallOptions) {
    if (params.tokenAddressList?.length) need("defi", "POST /api/v1/defi/data/investment/list", "binanceChainId (required with tokenAddressList)", params.binanceChainId);
    return this.client.call(defiEndpoints.investments, { body: params }, opts);
  }

  investmentDetail(params: { investmentId: string }, opts?: CallOptions) {
    return this.client.call(defiEndpoints.investmentDetail, { body: params }, opts);
  }

  deposit(params: { address: string; investmentId: string; token: DefiTokenAmount; simulate?: boolean }, opts?: CallOptions) {
    return this.client.call(defiEndpoints.deposit, { body: params }, opts);
  }

  /** Exact amount via `token`, or a `ratio` in (0, 1] of the current position (mutually exclusive). */
  redeem(params: { address: string; investmentId: string; token?: DefiTokenAmount; ratio?: string; slippageBps?: string; simulate?: boolean }, opts?: CallOptions) {
    return this.client.call(defiEndpoints.redeem, { body: params }, opts);
  }

  /** Pick exactly one tick source: `nftId` > `priceRange` > `tickLower`+`tickUpper` (aligned to tickSpacing). */
  lpAdd(
    params: { address: string; investmentId: string; tokenList: readonly DefiTokenAmount[]; tickLower?: string; tickUpper?: string; priceRange?: string; nftId?: string; slippageBps?: string; simulate?: boolean },
    opts?: CallOptions,
  ) {
    return this.client.call(defiEndpoints.lpAdd, { body: params }, opts);
  }

  lpAddCalculate(
    params: { address: string; investmentId: string; inputToken: DefiTokenAmount; tickLower?: string; tickUpper?: string; priceRange?: string; nftId?: string },
    opts?: CallOptions,
  ) {
    return this.client.call(defiEndpoints.lpAddCalculate, { body: params }, opts);
  }

  lpRemove(params: { address: string; investmentId: string; nftId: string; ratio: string; slippageBps?: string; simulate?: boolean }, opts?: CallOptions) {
    return this.client.call(defiEndpoints.lpRemove, { body: params }, opts);
  }

  /** REWARD_PROTOCOL needs defiProtocolId + binanceChainId; REWARD_INVESTMENT investmentId; LP_FEE investmentId + nftId; REDEMPTION investmentId + redemptionId. */
  claim(
    params: { address: string; claimType: ClaimType; binanceChainId?: string; investmentId?: string; defiProtocolId?: string; nftId?: string; redemptionId?: string; tokenAddressList?: readonly string[]; simulate?: boolean },
    opts?: CallOptions,
  ) {
    const ep = "POST /api/v1/defi/transaction/claim";
    if (params.claimType === "REWARD_PROTOCOL") {
      need("defi", ep, "defiProtocolId", params.defiProtocolId);
      need("defi", ep, "binanceChainId", params.binanceChainId);
    } else need("defi", ep, "investmentId", params.investmentId);
    if (params.claimType === "LP_FEE") need("defi", ep, "nftId", params.nftId);
    if (params.claimType === "REDEMPTION") need("defi", ep, "redemptionId", params.redemptionId);
    return this.client.call(defiEndpoints.claim, { body: params }, opts);
  }
}
