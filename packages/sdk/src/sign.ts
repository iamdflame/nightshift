/**
 * Request signing for the Binance Web3 API gateway — pure functions, no I/O.
 *
 * Spec (https://web3.binance.com/en/dev-docs/authentication.md):
 *   preHash   = timestamp + METHOD + requestPath + body
 *   signature = Base64( HMAC-SHA256(preHash, secretKey) )
 * where `requestPath` is the path *including the `/build` prefix* plus the raw, URL-encoded query
 * string exactly as sent on the wire, and `body` is the raw body for POST/PUT/DELETE and "" for
 * GET/HEAD. Headers: X-OC-APIKEY, X-OC-TIMESTAMP (ISO-8601 with ms), X-OC-SIGN, optional
 * X-OC-RECV-WINDOW (default 5000, max 60000) and X-OC-NONCE.
 *
 * The one rule that makes signing robust: build the wire string once and sign *that string*. We
 * encode query values with strict RFC 3986 (encodeURIComponent plus `!'()*`) so the WHATWG URL
 * parser inside fetch() has nothing left to re-encode — otherwise e.g. a `'` would be sent as %27
 * while the signature covered `'`, a silent 40102.
 */
import { createHmac } from "node:crypto";

export const BASE_URL = "https://web3.binance.com";
export const BUILD_PREFIX = "/build";
export const DEFAULT_RECV_WINDOW_MS = 5_000;
export const MAX_RECV_WINDOW_MS = 60_000;

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "HEAD";

export type QueryScalar = string | number | boolean | bigint;
export type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;
export type QueryParams = Readonly<Record<string, QueryValue>>;

/** Strict RFC 3986 percent-encoding (unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"). */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function scalarToString(v: QueryScalar): string {
  return typeof v === "string" ? v : String(v);
}

/**
 * Serialize query params in insertion order. `undefined`/`null` are omitted; arrays become the
 * comma-separated lists the API documents (e.g. `tokenContractAddresses`, `chains`).
 */
export function buildQueryString(params?: QueryParams): string {
  if (!params) return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    const value = Array.isArray(raw) ? (raw as readonly QueryScalar[]).map(scalarToString).join(",") : scalarToString(raw as QueryScalar);
    parts.push(`${encodeRfc3986(key)}=${encodeRfc3986(value)}`);
  }
  return parts.join("&");
}

/** Substitute `{name}` path parameters (each value strictly encoded as one path segment). */
export function expandPath(template: string, pathParams?: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = pathParams?.[name];
    if (v === undefined || v === null || String(v) === "") throw new Error(`missing path parameter "${name}" for ${template}`);
    return encodeRfc3986(String(v));
  });
}

/** `/build` + path (+ `?query`). Accepts paths with or without the prefix; never doubles it. */
export function buildRequestPath(path: string, query = ""): string {
  if (!path.startsWith("/")) throw new Error(`path must start with "/": ${path}`);
  const withPrefix = path === BUILD_PREFIX || path.startsWith(`${BUILD_PREFIX}/`) ? path : `${BUILD_PREFIX}${path}`;
  return query ? `${withPrefix}?${query}` : withPrefix;
}

/** True when the method carries no signed body (GET/HEAD sign the empty string). */
export function isBodyless(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD";
}

export interface PrehashInput {
  /** Exact X-OC-TIMESTAMP header value. */
  timestamp: string;
  method: string;
  /** Path including `/build` and the raw query string. */
  requestPath: string;
  /** Raw body string as sent. Ignored for GET/HEAD. */
  body?: string;
}

export function buildPrehash({ timestamp, method, requestPath, body }: PrehashInput): string {
  if (!requestPath.startsWith(`${BUILD_PREFIX}/`)) {
    // The docs call this "the #1 cause of 40102 Invalid signature"; refuse to produce such a signature.
    throw new Error(`requestPath must include the ${BUILD_PREFIX} prefix: ${requestPath}`);
  }
  return timestamp + method.toUpperCase() + requestPath + (isBodyless(method) ? "" : (body ?? ""));
}

export function hmacSha256Base64(message: string, secretKey: string): string {
  return createHmac("sha256", Buffer.from(secretKey, "utf8")).update(message, "utf8").digest("base64");
}

/** ISO-8601 UTC with milliseconds, e.g. 2026-05-11T10:08:57.715Z. */
export function formatTimestamp(epochMs: number): string {
  return new Date(Math.round(epochMs)).toISOString();
}

export function clampRecvWindow(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_RECV_WINDOW_MS;
  return Math.min(MAX_RECV_WINDOW_MS, Math.round(ms));
}

export interface SignInput {
  apiKey: string;
  secretKey: string;
  method: string;
  requestPath: string;
  body?: string;
  /** Epoch ms used for X-OC-TIMESTAMP (pass the skew-corrected server-time estimate). */
  timestampMs: number;
  recvWindowMs?: number;
  nonce?: string;
}

export interface SignedHeaders {
  headers: Record<string, string>;
  timestamp: string;
  prehash: string;
  signature: string;
}

export function signRequest(input: SignInput): SignedHeaders {
  if (!input.apiKey) throw new Error("apiKey is required");
  if (!input.secretKey) throw new Error("secretKey is required");
  const timestamp = formatTimestamp(input.timestampMs);
  const prehash = buildPrehash({ timestamp, method: input.method, requestPath: input.requestPath, body: input.body });
  const signature = hmacSha256Base64(prehash, input.secretKey);
  const headers: Record<string, string> = {
    "X-OC-APIKEY": input.apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
  };
  if (input.recvWindowMs !== undefined) headers["X-OC-RECV-WINDOW"] = String(clampRecvWindow(input.recvWindowMs));
  if (input.nonce) headers["X-OC-NONCE"] = input.nonce;
  return { headers, timestamp, prehash, signature };
}
