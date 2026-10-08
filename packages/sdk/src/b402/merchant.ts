/**
 * B402 merchant kit: build x402 V2 payment requirements from live `/supported` configuration,
 * validate buyer payloads against server-held requirements, verify → settle via the facilitator,
 * and guard against double delivery.
 *
 * Rules implemented from products/b402-api/{integration-guide,permit2-signing,payment-methods}.md:
 *  - `extra` is copied verbatim from `/supported` kinds[].extra — signer/spender/name/version are
 *    never hardcoded ("They can change when facilitator configuration or Permit2 proxy contracts
 *    are upgraded").
 *  - "reject the buyer payload unless `paymentPayload.accepted` exactly matches the server-held
 *    `paymentRequirements`", then send both unchanged to B402.
 *  - Permit2 checklist: spender = extra.spenderAddress, witness.to = payTo, permitted.token = asset,
 *    upto: witness.facilitator = extra.signerAddress and 0 < settleAmount ≤ permitted.amount.
 *  - Settle "is idempotent for the same signed authorization"; results are persisted keyed by it.
 */
import { createHash } from "node:crypto";
import { BinanceWeb3Error } from "../errors.ts";
import type { B402KindV2, B402SettleResultV2, B402SupportedV2, B402VerifyResultV2 } from "../schemas/b402.ts";
import { type IdempotencyStore, MemoryIdempotencyStore, type PaymentRecord } from "./idempotency.ts";
import {
  type AssetTransferMethod,
  decodeHeader,
  PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type ResourceInfo,
  type SettlementResponse,
  type SettleRequest,
  type VerifyRequest,
} from "./types.ts";
import type { z } from "zod";

type Supported = z.infer<typeof B402SupportedV2>;
type Kind = z.infer<typeof B402KindV2>;
type VerifyResult = z.infer<typeof B402VerifyResultV2>;
type SettleResult = z.infer<typeof B402SettleResultV2>;

/** Structural facilitator interface — `client.b402` satisfies it. */
export interface Facilitator {
  supported(): Promise<Supported>;
  verify(body: VerifyRequest): Promise<VerifyResult>;
  settle(body: SettleRequest): Promise<SettleResult>;
}

export interface PriceSpec {
  /** Atomic units (integer string). For permit2-upto this is the maximum. */
  amount: string;
  /** Token contract address (e.g. U / USD1 / USDT on BSC — see payment-methods.md). */
  asset: string;
  /** Default "eip3009". */
  method?: AssetTransferMethod;
  /** EIP-712 domain `name` to pick among several matching kinds (e.g. two EIP-3009 tokens). */
  assetName?: string;
  /** CAIP-2; default the merchant's network (eip155:56). */
  network?: string;
  maxTimeoutSeconds?: number;
}

export interface MerchantOptions {
  facilitator: Facilitator;
  /** The write-once receiving address configured during B402 onboarding. */
  payTo: string;
  network?: string;
  supportedTtlMs?: number;
  store?: IdempotencyStore;
  now?: () => number;
  onEvent?: (e: MerchantEvent) => void;
}

export interface MerchantEvent {
  type: "supported_refreshed" | "supported_stale" | "verify_invalid" | "settled" | "settle_failed" | "reconcile" | "replay_blocked" | "rejected";
  key?: string;
  txHash?: string;
  reason?: string;
}

export const SCHEME_FOR_METHOD: Record<AssetTransferMethod, "exact" | "upto"> = { eip3009: "exact", "permit2-exact": "exact", "permit2-upto": "upto" };

const isAddress = (s: unknown): s is string => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Canonical form for "exact match": sorted keys, addresses lower-cased (EIP-55 case is not identity). */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    );
  return isAddress(v) ? v.toLowerCase() : v;
}

export function sameRequirements(a: PaymentRequirements, b: PaymentRequirements): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export type VerifiedPayment = { payload: PaymentPayload; requirement: PaymentRequirements; key: string; payer: string | null };

export type PaymentCheck = { ok: true; value: VerifiedPayment } | { ok: false; status: 400 | 402 | 503 | 500; reason: string; settlement?: SettlementResponse; retryAfterMs?: number };

export class B402Merchant {
  readonly payTo: string;
  readonly network: string;
  readonly store: IdempotencyStore;
  private cache: { at: number; supported: Supported } | null = null;
  private readonly ttl: number;
  private readonly now: () => number;

  constructor(private readonly opts: MerchantOptions) {
    if (!isAddress(opts.payTo)) throw new Error(`payTo must be an EVM address, got ${opts.payTo}`);
    this.payTo = opts.payTo;
    this.network = opts.network ?? "eip155:56";
    this.ttl = opts.supportedTtlMs ?? 10 * 60_000;
    this.now = opts.now ?? Date.now;
    this.store = opts.store ?? new MemoryIdempotencyStore();
  }

  private event(e: MerchantEvent) {
    try {
      this.opts.onEvent?.(e);
    } catch {
      /* observers must not break payments */
    }
  }

  /** Cached `/supported`; serves a stale copy if the facilitator is temporarily unreachable. */
  async supported(force = false): Promise<Supported> {
    if (!force && this.cache && this.now() - this.cache.at < this.ttl) return this.cache.supported;
    try {
      const supported = await this.opts.facilitator.supported();
      this.cache = { at: this.now(), supported };
      this.event({ type: "supported_refreshed" });
      return supported;
    } catch (e) {
      if (this.cache) {
        this.event({ type: "supported_stale", reason: (e as Error).message });
        return this.cache.supported;
      }
      throw e;
    }
  }

  /** Pick the `/supported` kind for a price and build the requirement around its verbatim `extra`. */
  async requirementsFor(price: PriceSpec): Promise<PaymentRequirements> {
    const method = price.method ?? "eip3009";
    const network = price.network ?? this.network;
    const scheme = SCHEME_FOR_METHOD[method];
    const kinds = (await this.supported()).kinds.filter(
      (k: Kind) => k.x402Version === 2 && k.network === network && k.scheme === scheme && k.extra.assetTransferMethod === method,
    );
    // The documented kind has no asset field; if the server adds one (drift), honour it.
    const assetOf = (k: Kind) => (k as Record<string, unknown>).asset ?? (k.extra as Record<string, unknown>).asset;
    let candidates = kinds.some((k) => isAddress(assetOf(k))) ? kinds.filter((k) => lc(assetOf(k) as string) === lc(price.asset)) : kinds;
    if (price.assetName) candidates = candidates.filter((k) => k.extra.name === price.assetName);
    if (candidates.length !== 1) {
      throw new BinanceWeb3Error({
        message:
          candidates.length === 0
            ? `no /supported kind for ${scheme}/${method} on ${network}${price.assetName ? ` named "${price.assetName}"` : ""} — only advertise combinations present in kinds[]`
            : `ambiguous /supported kinds for ${method} on ${network} (${candidates.map((k) => k.extra.name).join(", ")}); set PriceSpec.assetName`,
        kind: "config",
        module: "b402",
        endpoint: "POST /api/v2/b402/supported",
      });
    }
    const kind = candidates[0]!;
    return {
      scheme: kind.scheme,
      network: kind.network,
      amount: price.amount,
      asset: price.asset,
      payTo: this.payTo,
      maxTimeoutSeconds: price.maxTimeoutSeconds ?? 300,
      extra: { ...kind.extra },
    };
  }

  /** x402 V2 PaymentRequired for the given offers. */
  async paymentRequired(prices: readonly PriceSpec[], resource: ResourceInfo, error?: string): Promise<PaymentRequired> {
    const accepts = await Promise.all(prices.map((p) => this.requirementsFor(p)));
    return { x402Version: 2, ...(error ? { error } : {}), resource, accepts };
  }

  /** Decode and validate a PAYMENT-SIGNATURE header value. */
  decode(header: string): { ok: true; payload: PaymentPayload } | { ok: false; reason: string } {
    let raw: unknown;
    try {
      raw = decodeHeader(header);
    } catch {
      return { ok: false, reason: "PAYMENT-SIGNATURE is not base64-encoded JSON" };
    }
    const parsed = PaymentPayload.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: `invalid PaymentPayload: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}` };
    return { ok: true, payload: parsed.data };
  }

  /** The server-held requirement that `accepted` exactly matches, or null. */
  matchAccepted(payload: PaymentPayload, requirements: readonly PaymentRequirements[]): PaymentRequirements | null {
    return requirements.find((r) => sameRequirements(r, payload.accepted)) ?? null;
  }

  /** Payload-level consistency (permit2-signing.md "Validation Checklist"); null = consistent. */
  checkPayload(payload: PaymentPayload, req: PaymentRequirements): string | null {
    const method = (req.extra as { assetTransferMethod?: string } | undefined)?.assetTransferMethod;
    const extra = (req.extra ?? {}) as { signerAddress?: string; spenderAddress?: string | null };
    const p = payload.payload;
    if (method === "eip3009") {
      const a = p.authorization;
      if (!a) return "eip3009 payload requires payload.authorization";
      if (lc(a.to) !== lc(req.payTo)) return "authorization.to must equal payTo";
      if (a.value !== req.amount) return "authorization.value must equal the required amount";
      return null;
    }
    if (method === "permit2-exact" || method === "permit2-upto") {
      const a = p.permit2Authorization;
      if (!a) return `${method} payload requires payload.permit2Authorization`;
      if (lc(a.permitted.token) !== lc(req.asset)) return "permit2Authorization.permitted.token must equal asset";
      if (a.permitted.amount !== req.amount) return "permit2Authorization.permitted.amount must equal the (maximum) required amount";
      if (!extra.spenderAddress || lc(a.spender) !== lc(extra.spenderAddress)) return "permit2Authorization.spender must equal extra.spenderAddress";
      if (lc(a.witness.to) !== lc(req.payTo)) return "permit2Authorization.witness.to must equal payTo";
      if (method === "permit2-upto" && lc(a.witness.facilitator) !== lc(extra.signerAddress)) return "permit2-upto witness.facilitator must equal extra.signerAddress";
      if (method === "permit2-exact" && a.witness.facilitator) return "permit2-exact must not carry witness.facilitator";
      return null;
    }
    return `unsupported assetTransferMethod ${String(method)}`;
  }

  /** Idempotency key derived from the signed authorization. */
  idempotencyKey(payload: PaymentPayload): string {
    const net = lc(payload.accepted.network);
    const a = payload.payload.authorization;
    if (a) return `${net}|eip3009|${lc(payload.accepted.asset)}|${lc(a.from)}|${lc(a.nonce)}`;
    const p = payload.payload.permit2Authorization;
    if (p) return `${net}|permit2|${lc(p.from)}|${lc(p.nonce)}`;
    return `${net}|sig|${createHash("sha256").update(payload.payload.signature).digest("hex")}`;
  }

  /**
   * Steps 1–4 of the flow: decode, match `accepted`, check payload consistency, consult the
   * idempotency store, and Verify with B402. Does not move funds.
   */
  async verify(header: string, requirements: readonly PaymentRequirements[], resource: ResourceInfo): Promise<PaymentCheck> {
    const decoded = this.decode(header);
    if (!decoded.ok) return { ok: false, status: 400, reason: decoded.reason };
    const payload = decoded.payload;
    const requirement = this.matchAccepted(payload, requirements);
    if (!requirement) return { ok: false, status: 402, reason: "paymentPayload.accepted does not match any server-held payment requirement" };
    if (!payload.resource) return { ok: false, status: 400, reason: "paymentPayload.resource is required (B402 V2 schema)" };
    if (payload.resource.url !== resource.url) return { ok: false, status: 402, reason: "paymentPayload.resource.url does not match this resource" };
    const inconsistency = this.checkPayload(payload, requirement);
    if (inconsistency) return { ok: false, status: 402, reason: inconsistency };

    const key = this.idempotencyKey(payload);
    const prior = await this.store.get(key);
    if (prior?.state === "settled") {
      this.event({ type: "replay_blocked", key, txHash: prior.txHash });
      return {
        ok: false,
        status: 402,
        reason: "this payment authorization has already been settled and consumed",
        settlement: { success: false, errorReason: "invalid_transaction_state", transaction: prior.txHash ?? "", network: requirement.network },
      };
    }
    if (prior?.state === "settling" && this.now() - prior.updatedAt < 120_000) {
      return { ok: false, status: 402, reason: "this payment is already being settled; retry shortly", retryAfterMs: 2_000 };
    }

    let result: VerifyResult;
    try {
      result = await this.opts.facilitator.verify({ x402Version: 2, paymentPayload: payload, paymentRequirements: requirement });
    } catch (e) {
      return facilitatorFailure(e);
    }
    if (!result.isValid) {
      this.event({ type: "verify_invalid", key, reason: result.invalidReason ?? undefined });
      return {
        ok: false,
        status: 402,
        reason: result.invalidReason ?? "invalid_payload",
        settlement: { success: false, errorReason: result.invalidReason ?? "invalid_payload", transaction: "", network: requirement.network, ...(result.payer ? { payer: result.payer } : {}) },
      };
    }
    return { ok: true, value: { payload, requirement, key, payer: result.payer ?? null } };
  }

  /** Mark a verified payment as in-flight (call before running the paid handler). */
  async begin(v: VerifiedPayment, resource: string): Promise<void> {
    await this.store.put({ key: v.key, state: "settling", resource, updatedAt: this.now() });
  }

  /** Release an in-flight payment without settling (e.g. the handler failed: the buyer is not charged). */
  async abandon(v: VerifiedPayment, reason: string): Promise<void> {
    await this.store.put({ key: v.key, state: "failed", reason, updatedAt: this.now() });
  }

  /** Step 5: Settle with B402 (idempotent per authorization) and persist the outcome. */
  async settle(v: VerifiedPayment, settleAmount?: string): Promise<{ ok: true; settlement: SettlementResponse } | { ok: false; status: 402 | 500 | 503; reason: string; settlement?: SettlementResponse; retryAfterMs?: number }> {
    const method = (v.requirement.extra as { assetTransferMethod?: string } | undefined)?.assetTransferMethod;
    if (settleAmount !== undefined) {
      if (method !== "permit2-upto") return { ok: false, status: 500, reason: "settleAmount is only valid for permit2-upto" };
      if (!/^\d+$/.test(settleAmount) || BigInt(settleAmount) <= 0n || BigInt(settleAmount) > BigInt(v.requirement.amount)) {
        return { ok: false, status: 500, reason: "settleAmount must be a positive integer string ≤ the authorized amount" };
      }
    }
    let r: SettleResult;
    try {
      r = await this.opts.facilitator.settle({ x402Version: 2, paymentPayload: v.payload, paymentRequirements: v.requirement, ...(settleAmount ? { settleAmount } : {}) });
    } catch (e) {
      // Outcome unknown: keep the record retryable; settling again with the same authorization is safe.
      await this.store.put({ key: v.key, state: "reconcile", reason: (e as Error).message, updatedAt: this.now() });
      this.event({ type: "reconcile", key: v.key, reason: (e as Error).message });
      return facilitatorFailure(e) as { ok: false; status: 500 | 503; reason: string; retryAfterMs?: number };
    }
    const settlement: SettlementResponse = {
      success: r.success,
      transaction: r.transaction ?? "",
      network: r.network ?? v.requirement.network,
      ...(r.payer ? { payer: r.payer } : {}),
      ...(r.amount ? { amount: r.amount } : {}),
      ...(r.errorReason ? { errorReason: r.errorReason } : {}),
    };
    if (r.success) {
      await this.store.put({ key: v.key, state: "settled", txHash: settlement.transaction, settlement, updatedAt: this.now() });
      this.event({ type: "settled", key: v.key, txHash: settlement.transaction });
      return { ok: true, settlement };
    }
    // success:false + transaction ⇒ broadcast happened: reconcile before deciding; empty ⇒ terminal.
    const state = settlement.transaction ? "reconcile" : "failed";
    await this.store.put({ key: v.key, state, txHash: settlement.transaction || undefined, settlement, reason: r.errorReason ?? undefined, updatedAt: this.now() });
    this.event({ type: state === "reconcile" ? "reconcile" : "settle_failed", key: v.key, txHash: settlement.transaction || undefined, reason: r.errorReason ?? undefined });
    return { ok: false, status: 402, reason: r.errorReason ?? "unexpected_settle_error", settlement };
  }

  async record(key: string): Promise<PaymentRecord | undefined> {
    return this.store.get(key);
  }
}

function facilitatorFailure(e: unknown): { ok: false; status: 500 | 503; reason: string; retryAfterMs?: number } {
  if (e instanceof BinanceWeb3Error) {
    const transient = e.kind === "rate_limit" || e.kind === "unavailable" || e.kind === "timeout" || e.kind === "network" || e.kind === "circuit_open" || e.kind === "server";
    return { ok: false, status: transient ? 503 : 500, reason: `facilitator error: ${e.codeName ?? e.kind}`, retryAfterMs: e.retryAfterMs ?? (transient ? 2_000 : undefined) };
  }
  return { ok: false, status: 500, reason: "facilitator error" };
}
