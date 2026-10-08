/**
 * Trading API — cross-DEX quotes/swaps, approvals, and the RFQ flow for equity (RWA) tokens.
 * Reference: catalog/web3-wallet/api/rest-api/trading-api · Guides: products/trading-api/{introduction,
 * integration-flow, fee-and-revenue-sharing}.md
 *
 * Execution modes: SWAP → sign `tx`, broadcast via Transaction API. RFQ (Ondo/bStock) → sign
 * `rfq.typedDataToSign` (EIP-712) → POST /order/submit → poll GET /order/{orderId}.
 * quoteId TTL is ~30 s (40401 QUOTE_EXPIRED). Ondo outside US hours → 40367, bStock → 40369
 * (both surface as BinanceWeb3Error kind "market_closed").
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BinanceWeb3Client } from "../client.ts";
import { type CallOptions, DOCS, endpoint } from "../endpoint.ts";
import { BinanceWeb3Error } from "../errors.ts";
import { realSleep } from "../ratelimit.ts";
import * as S from "../schemas/trading.ts";
import { need } from "./util.ts";

const docs = `${DOCS}/trading-api`;
const P = "/api/v1/dex/aggregator";

export const tradingEndpoints = {
  supportedChains: endpoint({ id: "trading.supportedChains", module: "trading", method: "GET", path: `${P}/supported/chain`, data: z.array(S.AggregatorChain), docs }),
  approveTransaction: endpoint({ id: "trading.approveTransaction", module: "trading", method: "GET", path: `${P}/approve-transaction`, data: z.array(S.ApproveTransaction), docs }),
  quote: endpoint({ id: "trading.quote", module: "trading", method: "GET", path: `${P}/quote`, data: z.array(S.QuoteRoute), docs }),
  swap: endpoint({ id: "trading.swap", module: "trading", method: "GET", path: `${P}/swap`, data: S.SwapData, docs }),
  quoteAndSwap: endpoint({ id: "trading.quoteAndSwap", module: "trading", method: "GET", path: `${P}/quote-and-swap`, data: S.QuoteAndSwapData, docs }),
  swapInstruction: endpoint({ id: "trading.swapInstruction", module: "trading", method: "GET", path: `${P}/swap-instruction`, data: S.SolanaSwapInstructions, docs }),
  history: endpoint({ id: "trading.history", module: "trading", method: "GET", path: `${P}/history`, data: S.SwapTransactionStatus, docs }),
  /** Idempotent by `requestId` ("re-submitting with the same requestId returns the original result"). */
  submitOrder: endpoint({ id: "trading.submitOrder", module: "trading", method: "POST", path: `${P}/order/submit`, data: S.RfqOrderSubmitted, retry: "idempotent-key", docs }),
  orderStatus: endpoint({ id: "trading.orderStatus", module: "trading", method: "GET", path: `${P}/order/{orderId}`, data: S.RfqOrderStatus, docs }),
} as const;

export type QuoteVendor = "LiquidMesh" | "Pancake" | "Jupiter";
export type RfqVendor = "InchFusion" | "CowSwap" | "PcsXRfq";
export type FeeSource = "FROM_TOKEN" | "TO_TOKEN";
export type GasLevel = "slow" | "average" | "fast";
export const RFQ_TERMINAL_STATUSES = ["FILLED", "FAILED", "EXPIRED", "CANCELLED"] as const;

export interface QuoteParams {
  binanceChainId: string;
  /** Sell amount in the token's smallest unit (integer string). */
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  vendor?: QuoteVendor;
  /** Required for RFQ routes (Ondo / bStock): the RFQ receiver and EIP-712 signer. */
  userWalletAddress?: string;
  feePercent?: string;
  feeSource?: FeeSource;
}

interface SwapCommon {
  binanceChainId: string;
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  userWalletAddress: string;
  /** One of `slippagePercent` / `autoSlippage` is required. */
  slippagePercent?: string;
  autoSlippage?: boolean;
  maxAutoSlippagePercent?: string;
  approveTransaction?: boolean;
  approveAmount?: string;
  gasLimit?: string;
  gasLevel?: GasLevel;
  /** Default protection threshold 90%; pass "100" to disable (40463). */
  priceImpactProtectionPercent?: string;
  computeUnitLimit?: string;
  computeUnitPrice?: string;
  tips?: string;
  feePercent?: string;
  /** Mutually exclusive with `toTokenReferrerWalletAddress` (40468). */
  fromTokenReferrerWalletAddress?: string;
  toTokenReferrerWalletAddress?: string;
}

export interface SwapParams extends SwapCommon {
  /** Route id from /quote; expires after ~30 s. */
  quoteId: string;
}

export interface QuoteAndSwapParams extends SwapCommon {
  /** Currently only LiquidMesh. */
  vendor: "LiquidMesh";
  excludeDexes?: string;
  enableRFQ?: boolean;
}

export interface SubmitOrderParams {
  /** EIP-712 signature (0x + 65 bytes) of `rfq.typedDataToSign`, by the quote's `userWalletAddress`. */
  userSignature: string;
  vendor: RfqVendor | (string & {});
  /** Per the docs: `rfq.orderId` from /swap — NOT the /quote route id. See `rfqOrderIdFrom()`. */
  quoteId: string;
  /** Idempotency key (UUID v4); generated when omitted and reused across retries. */
  requestId?: string;
  signingScheme?: string;
}

const isSolana = (chain: string) => chain === "CT_501";

/** Client-side check of the documented custom-fee rules (fails fast instead of a 40466/40468 round trip). */
export function assertFeeParams(module: "trading", endpointLabel: string, p: { binanceChainId: string; feePercent?: string; feeSource?: FeeSource; fromTokenReferrerWalletAddress?: string; toTokenReferrerWalletAddress?: string }, stage: "quote" | "swap"): void {
  const fail = (msg: string, code: string) => {
    throw new BinanceWeb3Error({ message: `${endpointLabel}: ${msg}`, kind: "param", module, endpoint: endpointLabel, apiCode: code, codeName: "CLIENT_VALIDATION" });
  };
  if (p.fromTokenReferrerWalletAddress && p.toTokenReferrerWalletAddress) fail("fromTokenReferrerWalletAddress and toTokenReferrerWalletAddress are mutually exclusive", "40468");
  if (stage === "quote" && (p.feePercent === undefined) !== (p.feeSource === undefined)) fail("feePercent and feeSource must be both present or both absent", "40001");
  if (p.feePercent !== undefined) {
    const max = isSolana(p.binanceChainId) ? 10 : 5;
    const v = Number(p.feePercent);
    if (!/^\d+(\.\d{1,2})?$/.test(p.feePercent) || !(v > 0 && v <= max)) fail(`feePercent must be a decimal string in (0, ${max}] with at most 2 decimals`, "40466");
  }
}

export class TradingApi {
  constructor(private readonly client: BinanceWeb3Client) {}

  supportedChains(params: { binanceChainId?: string } = {}, opts?: CallOptions) {
    return this.client.call(tradingEndpoints.supportedChains, { query: { binanceChainId: params.binanceChainId } }, opts);
  }

  /** ERC-20 approve calldata. `vendor` is required for equity (RFQ) tokens: pass /quote's `vendorName`. */
  approveTransaction(params: { binanceChainId: string; tokenContractAddress: string; approveAmount: string; vendor?: string }, opts?: CallOptions) {
    return this.client.call(tradingEndpoints.approveTransaction, { query: { ...params } }, opts);
  }

  /** Aggregated quote: one entry per route; pick by `isBest`, honour `executionMode`. */
  quote(params: QuoteParams, opts?: CallOptions) {
    assertFeeParams("trading", "GET /api/v1/dex/aggregator/quote", params, "quote");
    return this.client.call(tradingEndpoints.quote, { query: { ...params } }, opts);
  }

  /** Build the unsigned swap (SWAP) or the RFQ typed data (RFQ) for a quoteId. */
  swap(params: SwapParams, opts?: CallOptions) {
    const ep = "GET /api/v1/dex/aggregator/swap";
    need("trading", ep, "quoteId", params.quoteId);
    need("trading", ep, "userWalletAddress", params.userWalletAddress);
    if (params.slippagePercent === undefined && params.autoSlippage !== true) need("trading", ep, "slippagePercent or autoSlippage=true", undefined);
    assertFeeParams("trading", ep, params, "swap");
    return this.client.call(tradingEndpoints.swap, { query: { ...params } }, opts);
  }

  /** Flash API: quote + build in one call (no quoteId; vendor=LiquidMesh). */
  quoteAndSwap(params: QuoteAndSwapParams, opts?: CallOptions) {
    const ep = "GET /api/v1/dex/aggregator/quote-and-swap";
    if (params.slippagePercent === undefined && params.autoSlippage !== true) need("trading", ep, "slippagePercent or autoSlippage=true", undefined);
    assertFeeParams("trading", ep, params, "swap");
    return this.client.call(tradingEndpoints.quoteAndSwap, { query: { ...params } }, opts);
  }

  /** Solana-only (CT_501) swap instructions. */
  swapInstruction(params: SwapParams & { binanceChainId: "CT_501"; slippagePercent: string }, opts?: CallOptions) {
    assertFeeParams("trading", "GET /api/v1/dex/aggregator/swap-instruction", params, "swap");
    return this.client.call(tradingEndpoints.swapInstruction, { query: { ...params } }, opts);
  }

  /** Swap transaction status by txHash. */
  history(params: { binanceChainId: string; txHash: string }, opts?: CallOptions) {
    return this.client.call(tradingEndpoints.history, { query: { ...params } }, opts);
  }

  /**
   * Submit a signed RFQ order. A `requestId` is generated if absent and reused on every retry, which
   * the docs make idempotent for 30 minutes; 42901 (submit in progress) is retried with backoff.
   */
  submitOrder(params: SubmitOrderParams, opts?: CallOptions) {
    const ep = "POST /api/v1/dex/aggregator/order/submit";
    need("trading", ep, "userSignature", params.userSignature);
    need("trading", ep, "vendor", params.vendor);
    need("trading", ep, "quoteId", params.quoteId);
    const body = { requestId: params.requestId ?? randomUUID(), userSignature: params.userSignature, vendor: params.vendor, quoteId: params.quoteId, signingScheme: params.signingScheme };
    return this.client.callWithMeta(tradingEndpoints.submitOrder, { body }, opts).then((r) => ({ ...r.data, requestId: body.requestId }));
  }

  orderStatus(orderId: string, opts?: CallOptions) {
    need("trading", "GET /api/v1/dex/aggregator/order/{orderId}", "orderId", orderId);
    return this.client.call(tradingEndpoints.orderStatus, { pathParams: { orderId } }, opts);
  }

  /** Poll an RFQ order until FILLED / FAILED / EXPIRED / CANCELLED (or the deadline). */
  async waitForOrder(orderId: string, o: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}) {
    const deadline = Date.now() + (o.timeoutMs ?? 120_000);
    for (;;) {
      const status = await this.orderStatus(orderId, { signal: o.signal });
      if (status.status && (RFQ_TERMINAL_STATUSES as readonly string[]).includes(status.status)) return status;
      if (Date.now() + (o.intervalMs ?? 2_000) > deadline) return status;
      await realSleep(o.intervalMs ?? 2_000, o.signal);
    }
  }
}

/**
 * The `quoteId` for POST /order/submit. The integration guide says it is `rfq.orderId` from /swap,
 * but the documented `rfq` schema has no `orderId` (vendor, txType, typedDataToSign, signingScheme,
 * signatureData). We read `rfq.orderId` if the server sends it (passthrough keeps it) and otherwise
 * fail loudly instead of guessing.
 */
export function rfqOrderIdFrom(swap: z.infer<typeof S.SwapData>): string {
  const rfq = swap.rfq as (Record<string, unknown> & { orderId?: unknown }) | null | undefined;
  if (rfq && typeof rfq.orderId === "string" && rfq.orderId) return rfq.orderId;
  throw new BinanceWeb3Error({
    message: "swap response has no rfq.orderId; the docs say POST /order/submit's quoteId must be rfq.orderId, but the documented rfq schema lacks it — pass quoteId explicitly",
    kind: "schema",
    module: "trading",
    endpoint: "GET /api/v1/dex/aggregator/swap",
  });
}
