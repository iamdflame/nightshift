/**
 * Response envelopes. Two shapes are in production (see README "Doc issues found"):
 *  - OCResult (introduction.md):        { code: 0, msg, data, timestamp, success }
 *    gateway errors (authentication.md): { code: 40102, msg, data: null, timestamp }  (observed: data "")
 *  - B402 (schema.json B402*ResponseV2): { status, type, code: "000000000", errorData, data, subData, params }
 */
import { z } from "zod";

export type EnvelopeKind = "oc" | "b402";

export function ocSuccessEnvelope<T extends z.ZodType>(data: T) {
  return z.object({ code: z.union([z.number(), z.string()]), msg: z.string(), data, timestamp: z.number(), success: z.boolean() }).passthrough();
}

export const OcErrorEnvelope = z
  .object({ code: z.union([z.number(), z.string()]), msg: z.string(), data: z.unknown(), timestamp: z.number() })
  .passthrough();

export function b402Envelope<T extends z.ZodType>(data: T) {
  return z
    .object({
      status: z.string().optional(),
      type: z.string().optional(),
      code: z.string(),
      errorData: z.unknown().optional(),
      data: data.nullable().optional(),
      subData: z.unknown().optional(),
      params: z.unknown().optional(),
    })
    .passthrough();
}

export const B402ErrorEnvelope = b402Envelope(z.unknown());

/** Documented schema for a full response body, used for drift detection. */
export function documentedEnvelope(kind: EnvelopeKind, data: z.ZodType, success: boolean): z.ZodType {
  if (kind === "b402") return success ? b402Envelope(data) : B402ErrorEnvelope;
  return success ? ocSuccessEnvelope(data) : OcErrorEnvelope;
}

export interface ParsedEnvelope {
  code: string | null;
  message: string | null;
  data: unknown;
}

/** Pull code/message/data out of any JSON body without trusting its shape. */
export function readEnvelope(body: unknown): ParsedEnvelope | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!("code" in b)) return null;
  const code = b.code === null || b.code === undefined ? null : String(b.code);
  const msg = typeof b.msg === "string" ? b.msg : typeof b.message === "string" ? b.message : typeof b.errorData === "string" ? b.errorData : null;
  return { code, message: msg, data: b.data };
}
