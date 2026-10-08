/**
 * `requirePayment(price, handler)` — framework-agnostic x402 V2 gate. Works with node:http
 * (IncomingMessage/ServerResponse) and Fastify (request/reply) via `respond()`.
 *
 * Order of operations: 402 (PAYMENT-REQUIRED) → decode PAYMENT-SIGNATURE → exact `accepted` match →
 * Verify → run handler (response held back) → Settle → deliver with PAYMENT-RESPONSE. The resource is
 * only released after a successful settlement; if the handler throws, nothing is settled.
 */
import type { B402Merchant, PriceSpec, VerifiedPayment } from "./merchant.ts";
import { encodeHeader, HEADER_PAYMENT_REQUIRED, HEADER_PAYMENT_RESPONSE, type PaymentRequirements, type ResourceInfo, type SettlementResponse } from "./types.ts";

export interface RequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface HandlerResult {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface PaidContext {
  payer: string | null;
  requirement: PaymentRequirements;
  resource: ResourceInfo;
}

export interface RequirePaymentOptions<Req extends RequestLike> {
  /** Resource description; `url` defaults to publicBaseUrl/Host + request path. */
  resource?: Partial<ResourceInfo> | ((req: Req) => ResourceInfo);
  publicBaseUrl?: string;
  /** permit2-upto: final amount to settle (≤ authorized maximum), e.g. metered usage. */
  settleAmount?: (result: HandlerResult, ctx: PaidContext) => string | undefined;
}

const EXPOSE = { "Access-Control-Expose-Headers": `${HEADER_PAYMENT_REQUIRED}, ${HEADER_PAYMENT_RESPONSE}` };

function header(req: RequestLike, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function resourceFor<Req extends RequestLike>(req: Req, opts: RequirePaymentOptions<Req>): ResourceInfo {
  if (typeof opts.resource === "function") return opts.resource(req);
  const base = opts.publicBaseUrl ?? `${header(req, "x-forwarded-proto") ?? "http"}://${header(req, "host") ?? "localhost"}`;
  const url = opts.resource?.url ?? new URL(req.url ?? "/", base).toString();
  return { url, ...(opts.resource?.description ? { description: opts.resource.description } : {}), mimeType: opts.resource?.mimeType ?? "application/json" };
}

async function paymentRequired(merchant: B402Merchant, prices: readonly PriceSpec[], resource: ResourceInfo, error: string, status = 402, extra: Record<string, string> = {}): Promise<HttpResult> {
  const body = await merchant.paymentRequired(prices, resource, error);
  return { status, headers: { "Content-Type": "application/json", [HEADER_PAYMENT_REQUIRED]: encodeHeader(body), ...EXPOSE, ...extra }, body };
}

function failure(status: number, reason: string, settlement?: SettlementResponse, retryAfterMs?: number): HttpResult {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...EXPOSE };
  if (settlement) headers[HEADER_PAYMENT_RESPONSE] = encodeHeader(settlement);
  if (retryAfterMs) headers["Retry-After"] = String(Math.ceil(retryAfterMs / 1000));
  return { status, headers, body: { error: reason } };
}

export function requirePayment<Req extends RequestLike>(
  merchant: B402Merchant,
  price: PriceSpec | readonly PriceSpec[],
  handler: (req: Req, ctx: PaidContext) => HandlerResult | Promise<HandlerResult>,
  opts: RequirePaymentOptions<Req> = {},
): (req: Req) => Promise<HttpResult> {
  const prices: readonly PriceSpec[] = Array.isArray(price) ? price : [price as PriceSpec];
  return async (req) => {
    const resource = resourceFor(req, opts);
    let requirements: PaymentRequirements[];
    try {
      requirements = await Promise.all(prices.map((p) => merchant.requirementsFor(p)));
    } catch (e) {
      return failure(503, `payment configuration unavailable: ${(e as Error).message}`, undefined, 5_000);
    }

    const signature = header(req, "payment-signature");
    if (!signature) {
      const v1 = header(req, "x-payment");
      return paymentRequired(merchant, prices, resource, v1 ? "x402 V1 X-PAYMENT is not accepted; send PAYMENT-SIGNATURE (x402 V2)" : "PAYMENT-SIGNATURE header is required");
    }

    const check = await merchant.verify(signature, requirements, resource);
    if (!check.ok) {
      if (check.status === 402 && !check.settlement && !check.retryAfterMs) return paymentRequired(merchant, prices, resource, check.reason);
      return failure(check.status, check.reason, check.settlement, check.retryAfterMs);
    }
    const verified: VerifiedPayment = check.value;
    const ctx: PaidContext = { payer: verified.payer, requirement: verified.requirement, resource };

    await merchant.begin(verified, resource.url);
    let result: HandlerResult;
    try {
      result = await handler(req, ctx);
    } catch (e) {
      await merchant.abandon(verified, `handler failed: ${(e as Error).message}`);
      return failure(500, "resource handler failed; payment was not settled");
    }

    const settled = await merchant.settle(verified, opts.settleAmount?.(result, ctx));
    if (!settled.ok) return failure(settled.status, settled.reason, settled.settlement, settled.retryAfterMs);
    return {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json", ...result.headers, [HEADER_PAYMENT_RESPONSE]: encodeHeader(settled.settlement), ...EXPOSE },
      body: result.body ?? null,
    };
  };
}

function serialize(body: unknown): string | Uint8Array {
  if (body === undefined || body === null) return "";
  if (typeof body === "string" || body instanceof Uint8Array) return body;
  return JSON.stringify(body);
}

interface NodeResponse {
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(chunk?: string | Uint8Array): unknown;
}

interface FastifyReplyLike {
  code(status: number): FastifyReplyLike;
  headers(h: Record<string, string>): FastifyReplyLike;
  send(body?: unknown): unknown;
}

/** Write an HttpResult to a node:http ServerResponse or a Fastify reply. */
export function respond(target: NodeResponse | FastifyReplyLike, r: HttpResult): unknown {
  if (typeof (target as NodeResponse).writeHead === "function") {
    (target as NodeResponse).writeHead(r.status, r.headers);
    return (target as NodeResponse).end(serialize(r.body));
  }
  return (target as FastifyReplyLike).code(r.status).headers(r.headers).send(serialize(r.body));
}

/** Adapt a requirePayment() gate into a node:http request listener. */
export function toNodeListener<Req extends RequestLike>(gate: (req: Req) => Promise<HttpResult>) {
  return (req: Req, res: NodeResponse): void => {
    gate(req)
      .then((r) => respond(res, r))
      .catch(() => respond(res, { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "internal error" } }));
  };
}
