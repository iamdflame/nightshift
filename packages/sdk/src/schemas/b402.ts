/**
 * Documented response schemas — b402. GENERATED, then reviewed; do not hand-edit field lists.
 *
 * Transcribed from the docs' OpenAPI document (web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/1.0.0/schema.json,
 * rendered at catalog/web3-wallet/api/rest-api/{b402-payments}) via the operation models of the official connector
 * @binance-web3/wallet@13.0.1, which is generated from the same spec (identical operationIds). Every object is
 * .passthrough() so undocumented fields survive; telemetry reports them as doc drift.
 */
import { z } from "zod";

export const B402KindExtraV2 = z
  .object({
    name: z.string(),
    version: z.string(),
    assetTransferMethod: z.string(),
    signerAddress: z.string(),
    spenderAddress: z.string().nullable().optional(),
  })
  .passthrough();

export const B402KindV2 = z
  .object({
    x402Version: z.number(),
    scheme: z.string(),
    network: z.string(),
    extra: B402KindExtraV2,
  })
  .passthrough();

export const B402SupportedV2 = z
  .object({
    kinds: z.array(B402KindV2),
    extensions: z.array(z.string()),
    signers: z.record(z.string(), z.array(z.string())),
  })
  .passthrough();

export const B402VerifyResultV2 = z
  .object({
    isValid: z.boolean(),
    payer: z.string().nullable().optional(),
    invalidReason: z.string().nullable().optional(),
    invalidMessage: z.string().nullable().optional(),
  })
  .passthrough();

export const B402SettleResultV2 = z
  .object({
    success: z.boolean(),
    transaction: z.string(),
    payer: z.string().nullable().optional(),
    network: z.string(),
    amount: z.string().optional(),
    errorReason: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const B402KindExtraV1 = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    assetTransferMethod: z.string().optional(),
    facilitatorAddress: z.string().optional(),
  })
  .passthrough();

export const B402KindV1 = z
  .object({
    x402Version: z.number().optional(),
    scheme: z.string().optional(),
    network: z.string().optional(),
    extra: B402KindExtraV1.optional(),
  })
  .passthrough();

export const B402SupportedV1 = z
  .object({
    kinds: z.array(B402KindV1).optional(),
    extensions: z.array(z.string()).optional(),
    signers: z.record(z.string(), z.array(z.string())).optional(),
  })
  .passthrough();

export const B402VerifyResultV1 = z
  .object({
    isValid: z.boolean(),
    payer: z.string().nullable().optional(),
    invalidReason: z.string().nullable().optional(),
    invalidMessage: z.string().nullable().optional(),
  })
  .passthrough();

export const B402SettleResultV1 = z
  .object({
    success: z.boolean(),
    transaction: z.string().nullable().optional(),
    payer: z.string().nullable().optional(),
    network: z.string().nullable().optional(),
    amount: z.string().nullable().optional(),
    confirmations: z.number().nullable().optional(),
    errorReason: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
  })
  .passthrough();
