/** Declarative endpoint definitions shared by the client and the typed modules. */
import type { z } from "zod";
import type { EnvelopeKind } from "./envelope.ts";
import type { ModuleName } from "./errors.ts";
import type { BucketSpec } from "./ratelimit.ts";
import type { QueryParams } from "./sign.ts";

/**
 * Retry class:
 *  - "safe": read-only or pure computation (GETs, POST queries, calldata builders, simulate) — retried.
 *  - "idempotent-key": a write the docs declare idempotent by key (RFQ order submit by `requestId`,
 *    B402 settle by signed authorization) — retried, always with the same key.
 *  - "never": non-idempotent write (broadcast) — a single attempt, whatever the failure.
 */
export type RetryClass = "safe" | "idempotent-key" | "never";

export type ValidationMode = "warn" | "strict" | "off";

export interface EndpointDef<D extends z.ZodType = z.ZodType> {
  /** Stable id, e.g. "rwa.price"; also the key for per-endpoint rate-limit overrides. */
  id: string;
  module: ModuleName;
  method: "GET" | "POST";
  /** Path template without /build, e.g. /api/v1/dex/aggregator/order/{orderId}. */
  path: string;
  /** Documented schema of the envelope's `data`. */
  data: D;
  envelope: EnvelopeKind;
  retry: RetryClass;
  /** B402: send and sign `{"body": <input>}`. */
  wrapBody?: boolean;
  rateLimit?: BucketSpec;
  /** Reference page. */
  docs: string;
}

export function endpoint<D extends z.ZodType>(
  def: Omit<EndpointDef<D>, "envelope" | "retry"> & Partial<Pick<EndpointDef<D>, "envelope" | "retry">>,
): EndpointDef<D> {
  return { envelope: "oc", retry: "safe", ...def };
}

export interface CallInput {
  query?: QueryParams;
  body?: unknown;
  pathParams?: Readonly<Record<string, string | number>>;
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** X-OC-RECV-WINDOW for this call (clamped to 60000). */
  recvWindowMs?: number;
  validation?: ValidationMode;
}

export const DOCS = "https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api";
