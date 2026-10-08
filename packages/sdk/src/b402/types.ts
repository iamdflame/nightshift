/**
 * x402 V2 wire types (github.com/coinbase/x402 specs/x402-specification-v2.md, transports-v2/http.md)
 * with the B402 specifics from products/b402-api/{integration-guide,permit2-signing}.md.
 *
 * HTTP transport: 402 + `PAYMENT-REQUIRED` header (base64 JSON PaymentRequired); the client retries
 * with `PAYMENT-SIGNATURE` (base64 JSON PaymentPayload); the server answers with `PAYMENT-RESPONSE`
 * (base64 JSON SettlementResponse).
 */
import { z } from "zod";

export const HEADER_PAYMENT_REQUIRED = "PAYMENT-REQUIRED";
export const HEADER_PAYMENT_SIGNATURE = "PAYMENT-SIGNATURE";
export const HEADER_PAYMENT_RESPONSE = "PAYMENT-RESPONSE";

export const ResourceInfo = z.object({ url: z.string(), description: z.string().optional(), mimeType: z.string().optional() }).passthrough();

/** B402 `extra`: copied verbatim from /supported `kinds[].extra` — never hardcoded. */
export const B402Extra = z
  .object({
    name: z.string(),
    version: z.string(),
    assetTransferMethod: z.string(),
    signerAddress: z.string(),
    spenderAddress: z.string().nullable().optional(),
  })
  .passthrough();

export const PaymentRequirements = z
  .object({
    scheme: z.string(),
    network: z.string(),
    amount: z.string(),
    asset: z.string(),
    payTo: z.string(),
    maxTimeoutSeconds: z.number(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const PaymentRequired = z
  .object({
    x402Version: z.literal(2),
    error: z.string().optional(),
    resource: ResourceInfo,
    accepts: z.array(PaymentRequirements),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const Eip3009Authorization = z
  .object({ from: z.string(), to: z.string(), value: z.string(), validAfter: z.string(), validBefore: z.string(), nonce: z.string() })
  .passthrough();

export const Permit2Authorization = z
  .object({
    permitted: z.object({ token: z.string(), amount: z.string() }).passthrough(),
    from: z.string(),
    spender: z.string(),
    nonce: z.string(),
    deadline: z.string(),
    witness: z.object({ to: z.string(), facilitator: z.string().nullable().optional(), validAfter: z.string() }).passthrough(),
  })
  .passthrough();

export const PaymentPayloadData = z
  .object({ signature: z.string(), authorization: Eip3009Authorization.optional(), permit2Authorization: Permit2Authorization.optional() })
  .passthrough();

export const PaymentPayload = z
  .object({
    x402Version: z.literal(2),
    resource: ResourceInfo.optional(),
    accepted: PaymentRequirements,
    payload: PaymentPayloadData,
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const SettlementResponse = z
  .object({
    success: z.boolean(),
    errorReason: z.string().optional(),
    payer: z.string().optional(),
    transaction: z.string(),
    network: z.string(),
    amount: z.string().optional(),
  })
  .passthrough();

export type ResourceInfo = z.infer<typeof ResourceInfo>;
export type B402Extra = z.infer<typeof B402Extra>;
export type PaymentRequirements = z.infer<typeof PaymentRequirements>;
export type PaymentRequired = z.infer<typeof PaymentRequired>;
export type PaymentPayload = z.infer<typeof PaymentPayload>;
export type SettlementResponse = z.infer<typeof SettlementResponse>;

export interface VerifyRequest {
  x402Version: 2;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface SettleRequest extends VerifyRequest {
  /** permit2-upto only: final amount, 0 < settleAmount ≤ authorized amount. */
  settleAmount?: string;
}

export type AssetTransferMethod = "eip3009" | "permit2-exact" | "permit2-upto";

/** Canonical Uniswap Permit2 (payer approves this; EIP-712 verifying contract) — payment-methods.md. */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export const encodeHeader = (value: unknown): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
export const decodeHeader = (value: string): unknown => JSON.parse(Buffer.from(value, "base64").toString("utf8"));
