/**
 * B402 facilitator API (x402 V2 on BNB Smart Chain): supported / verify / settle, plus legacy V1.
 * Reference: catalog/web3-wallet/api/rest-api/b402-payments · Guides: products/b402-api/*.md
 *
 * Every B402 request body is wrapped and signed as `{"body": <x402 object>}`; the client does the
 * wrapping once and signs exactly the bytes it sends. Responses use the B402 envelope
 * (success code "000000000"). Business outcomes (`isValid`, `success`) arrive inside `data`.
 * Settle is idempotent per signed authorization, so it is retried with the same payload.
 */
import type { BinanceWeb3Client } from "../client.ts";
import { type CallOptions, DOCS, endpoint } from "../endpoint.ts";
import type { SettleRequest, VerifyRequest } from "../b402/types.ts";
import * as S from "../schemas/b402.ts";

const docs = `${DOCS}/b402-payments`;

export const b402Endpoints = {
  supported: endpoint({ id: "b402.supported", module: "b402", method: "POST", path: "/api/v2/b402/supported", data: S.B402SupportedV2, envelope: "b402", wrapBody: true, docs }),
  verify: endpoint({ id: "b402.verify", module: "b402", method: "POST", path: "/api/v2/b402/verify", data: S.B402VerifyResultV2, envelope: "b402", wrapBody: true, docs }),
  settle: endpoint({ id: "b402.settle", module: "b402", method: "POST", path: "/api/v2/b402/settle", data: S.B402SettleResultV2, envelope: "b402", wrapBody: true, retry: "idempotent-key", docs }),
  supportedV1: endpoint({ id: "b402.supportedV1", module: "b402", method: "POST", path: "/api/v1/b402/supported", data: S.B402SupportedV1, envelope: "b402", wrapBody: true, docs }),
  verifyV1: endpoint({ id: "b402.verifyV1", module: "b402", method: "POST", path: "/api/v1/b402/verify", data: S.B402VerifyResultV1, envelope: "b402", wrapBody: true, docs }),
  settleV1: endpoint({ id: "b402.settleV1", module: "b402", method: "POST", path: "/api/v1/b402/settle", data: S.B402SettleResultV1, envelope: "b402", wrapBody: true, retry: "idempotent-key", docs }),
} as const;

export class B402Api {
  constructor(private readonly client: BinanceWeb3Client) {}

  /** Live networks, schemes, transfer methods and facilitator addresses (cache; refresh periodically). */
  supported(opts?: CallOptions) {
    return this.client.call(b402Endpoints.supported, { body: {} }, opts);
  }

  /** Off-chain validation; proceed only when `isValid` is true. */
  verify(body: VerifyRequest, opts?: CallOptions) {
    return this.client.call(b402Endpoints.verify, { body }, opts);
  }

  /** On-chain settlement (gas sponsored). Treat as paid only when `success` is true. */
  settle(body: SettleRequest, opts?: CallOptions) {
    return this.client.call(b402Endpoints.settle, { body }, opts);
  }

  /** Legacy V1 (payload shape and address fields differ from V2; new integrations should use V2). */
  readonly v1 = {
    supported: (opts?: CallOptions) => this.client.call(b402Endpoints.supportedV1, { body: {} }, opts),
    verify: (body: Record<string, unknown>, opts?: CallOptions) => this.client.call(b402Endpoints.verifyV1, { body }, opts),
    settle: (body: Record<string, unknown>, opts?: CallOptions) => this.client.call(b402Endpoints.settleV1, { body }, opts),
  };
}
