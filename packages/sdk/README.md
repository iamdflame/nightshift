# @nightshift/sdk

A resilient, instrumented TypeScript client for the **Binance Web3 API** (Market/RWA, Trading, Transaction,
Wallet, DeFi, B402), plus a **b402 merchant kit** for selling Nightshift data over x402 V2. Every call is
measured — latency, retries, error codes and **doc drift** (fields the server sends that the docs don't
describe, and documented fields it doesn't send) — and can be written to SQLite as raw material for the
Developer Experience Report.

- 65 endpoints = every REST operation listed in [`llms.txt`](https://web3.binance.com/en/dev-docs/llms.txt), typed with zod schemas
- HMAC signing as a pure, vector-tested function; server-clock skew correction; resync on 40103
- GCRA token buckets (5 RPS per endpoint, 1200/60 s per key), jittered exponential backoff, `Retry-After`
- **Non-idempotent writes are never auto-retried**; documented-idempotent writes are retried with the same key
- Per-endpoint circuit breakers, per-attempt timeouts, redirects refused (credentials never forwarded)
- `BINANCE_WEB3_MODE=live|record|replay` with secret-free fixtures
- 110 offline tests (`pnpm exec vitest run packages/sdk`)

## Quick start

```ts
import { BinanceWeb3Client, BinanceWeb3Error, ConsoleSink, SqliteTelemetrySink } from "@nightshift/sdk";

const client = new BinanceWeb3Client({
  // defaults: env BINANCE_WEB3_API_KEY / BINANCE_WEB3_SECRET_KEY / BINANCE_WEB3_MODE
  telemetry: [new SqliteTelemetrySink(), new ConsoleSink()],
});

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const [px] = await client.rwa.price({ binanceChainId: "56", tokenContractAddresses: [NVDAB] });
const session = await client.rwa.underlyingMarket({ binanceChainId: "56", tokenContractAddress: NVDAB });
const candles = await client.market.candleObjects({ binanceChainId: "56", tokenContractAddress: NVDAB, bar: "1h", limit: 24 });

try {
  const routes = await client.trading.quote({ binanceChainId: "56", amount: "25000000000000000000",
    fromTokenAddress: "0x55d398326f99059fF775485246999027B3197955", toTokenAddress: NVDAB });
} catch (e) {
  if (e instanceof BinanceWeb3Error && e.kind === "market_closed") { /* 40367 Ondo / 40369 bStock */ }
}
```

`client.call(endpointDef, { query, body, pathParams })` and `client.callWithMeta(...)` (returns `{ data, record, body }`)
give raw access; `ENDPOINTS` / `allEndpoints()` list every definition.

## Endpoints covered (65)

All paths are relative to `https://web3.binance.com/build`. Retry class: **S** safe (retried), **K** idempotent by
documented key (retried with the same key), **N** never retried.

| Module (count) | SDK method → HTTP |
| --- | --- |
| **rwa** (6) | `platforms` GET `/api/v1/dex/market/rwa/platforms` · `price` GET `…/rwa/price` (auto-batches ≤100) · `search` GET `…/rwa/search` · `underlyingProfile` GET `…/rwa/underlying-profile` · `tokens` GET `…/rwa/tokens` · `underlyingMarket` GET `…/rwa/underlying-market` |
| **market** (21) | `supportedChains` GET `/api/v1/dex/market/supported/chain` · `price` POST `…/price` (array body, ≤100/batch) · `priceInfo` POST `…/price-info` · `candles`/`candleObjects` GET `…/candles` · `tokenSearch` GET `…/token/search` · `basicInfo` POST `…/token/basic-info` (query-only POST) · `advancedInfo` GET `…/token/advanced-info` · `hotTokens` GET `…/token/hot-token` · `holders` GET `…/token/holder` · `topTraders` GET `…/token/top-trader` · `topLiquidity` GET `…/token/top-liquidity` · `trades` GET `…/trades` · `devInfo` GET `…/memepump/tokenDevInfo` · `portfolioChains` GET `…/portfolio/supported/chain` · `portfolioOverview` GET `…/portfolio/overview` · `recentPnl` GET `…/portfolio/recent-pnl` · `tokenPnl` GET `…/portfolio/token/latest-pnl` · `dexHistory` GET `…/portfolio/dex-history` · `leaderboard` GET `…/leaderboard/list` · `trackedTrades` GET `…/address-tracker/trades` · `wsAuthToken` GET `…/wss/auth/token` |
| **trading** (9) | `supportedChains` GET `/api/v1/dex/aggregator/supported/chain` · `approveTransaction` GET `…/approve-transaction` · `quote` GET `…/quote` · `swap` GET `…/swap` · `quoteAndSwap` GET `…/quote-and-swap` · `swapInstruction` GET `…/swap-instruction` (Solana) · `history` GET `…/history` · `submitOrder` POST `…/order/submit` (**K**: `requestId`) · `orderStatus`/`waitForOrder` GET `…/order/{orderId}` |
| **transaction** (7) | `supportedChains` GET `/api/v1/dex/pre-transaction/supported/chain` · `gasPrice` GET `…/gas-price` · `blockHeight` GET `…/block-height` · `gasLimit` POST `…/gas-limit` · `simulate` POST `…/simulate` · `broadcast` POST `…/broadcast-transaction` (**N**) · `orders` GET `/api/v1/dex/post-transaction/orders` · `detailByHash` → wallet |
| **wallet** (5) | `supportedChains` GET `/api/v1/dex/balance/supported/chain` · `allTokenBalances` GET `…/all-token-balances-by-address` · `tokenBalances` POST `…/token-balances-by-address` (≤20/batch) · `transactions` GET `/api/v1/dex/post-transaction/transactions-by-address` · `transactionDetail` GET `…/transaction-detail-by-txhash` |
| **defi** (11) | `positions` POST `/api/v1/defi/data/position/list` · `protocols` POST `…/protocol/list` · `protocolDetail` POST `…/protocol/detail` · `investments` POST `…/investment/list` · `investmentDetail` POST `…/investment/detail` · `deposit` POST `/api/v1/defi/transaction/deposit` · `redeem` POST `…/redeem` · `lpAdd` POST `…/lp-add` · `lpAddCalculate` POST `…/lp-add/calculate` · `lpRemove` POST `…/lp-remove` · `claim` POST `…/claim` (builders are pure → **S**) |
| **b402** (6) | `supported` / `verify` / `settle` POST `/api/v2/b402/{op}` (settle **K**: signed authorization) · `v1.supported` / `v1.verify` / `v1.settle` POST `/api/v1/b402/{op}` |

Response schemas (`src/schemas/*.ts`, 160 objects) are transcribed from the docs' OpenAPI document
(`catalog/web3-wallet/api/rest-api/1.0.0/schema.json`) via the models of the official connector
`@binance-web3/wallet@13.0.1`, which is generated from the same spec (identical operationIds), and
cross-checked against the rendered reference pages. All objects are `.passthrough()`.

## Resilience semantics

| Concern | Behaviour |
| --- | --- |
| Signing (`src/sign.ts`) | `Base64(HMAC-SHA256(timestamp + METHOD + requestPath + body))`. `requestPath` always carries `/build` and the exact wire query; values use strict RFC 3986 encoding so `fetch`'s URL parser cannot re-encode anything after signing. B402 bodies are wrapped once as `{"body": …}` and the sent bytes are signed. Optional `X-OC-RECV-WINDOW` (clamped to 60000) and a fresh UUID `X-OC-NONCE` per attempt. |
| Clock | Every response is a time sample (body `timestamp`, ms; else `Date` header). NTP-style midpoint offset, tightest sample wins. A **40103** response's own timestamp is adopted and the request is re-signed and retried once (not for broadcast). |
| Rate limits | GCRA token buckets: per endpoint 5 / 1 s (capacity 1) and per key 1200 / 60 s (burst 20), proven in tests never to exceed the limit in any window. Override per endpoint id. On 429 the endpoint bucket pauses for `Retry-After`; the key bucket too when `X-OC-RateLimit-Remaining: 0`. |
| Retries | Network errors, timeouts, 429, 5xx and retryable codes (42900, 50000, 50001, 40441, 40465, 40432, 40482, 40483, 42901, 1160102, 1160408) → equal-jitter exponential backoff (base 300 ms, cap 10 s, 3 retries); `Retry-After` honoured exactly. Business codes (e.g. 40367) are never retried. |
| Writes | `transaction.broadcast` is attempted **exactly once** whatever happens (network error, 5xx, 429, 40103) — reconcile with `wallet.transactionDetail` / `transaction.orders`. `trading.submitOrder` is retried because the docs make it idempotent by `requestId` (generated if absent, reused across retries). `b402.settle` is retried because "Settle is idempotent for the same signed authorization". |
| Circuit breaker | Per endpoint: 5 consecutive availability failures (network/timeout/5xx/50000/50001/WAF) → open 15 s (doubling to 120 s), one half-open trial. Business errors count as healthy. Open → `kind: "circuit_open"` without a network call. |
| Timeouts / abort | Per-attempt `AbortSignal.timeout` (10 s default) combined with the caller's signal; caller aborts propagate and are not retried. |
| Redirects | `redirect: "manual"`: any 3xx is an error (`kind: "redirect"`), credentials are never forwarded (see doc issue 1). AWS WAF challenges → `kind: "waf"`. |
| Errors | `BinanceWeb3Error { kind, httpStatus, apiCode, codeName, apiMessage, module, endpoint, requestId, retryable, retryAfterMs, attempts, docsUrl }`. Codes are resolved per module (`describeCode`); `requestId` is the gateway's `X-OC-Trace-Id` or `client:<nonce>`. Kinds include `auth`, `signature`, `user_signature` (40102 on `/order/submit`), `clock`, `permission`, `rate_limit`, `param`, `compliance`, `market_closed` (40367/40369), `quote_expired`, `conflict`, `server`, `unavailable`, `network`, `timeout`, `circuit_open`, `redirect`, `waf`, `schema`, `replay_miss`, `config`. |
| Validation | `validation: "warn"` (default) returns data and reports zod issues in telemetry; `"strict"` throws `kind: "schema"`; `"off"`. |

## Telemetry and doc drift

Each logical call emits one `CallRecord`:

```ts
{ ts, module, endpoint, method, httpStatus, apiCode, latencyMs, retries, requestBytes, responseBytes, requestId?, error?,
  undocumentedFields: string[], missingFields: string[],   // doc drift, e.g. "data[].statusInfo.foo"
  endpointId, errorKind?, schemaIssues?, mode, clockOffsetMs, rateLimitWaitMs, rateLimitRemaining }
```

Drift = the full response body diffed against the documented envelope + `data` schema (`src/drift.ts`);
array items are sampled, map-like objects (`z.record`) accept any key. Sinks: `MemorySink`, `ConsoleSink`,
`SqliteTelemetrySink` (table **`dx_calls`**, created by this package in the tape's DB file —
`NIGHTSHIFT_DB` or `data/tape.sqlite`), or any `{ record(r) }`. Sinks can never break a call.
`sink.summary()` / `summarize(records)` give per-endpoint p50/p95/max latency, error and code counts and
the union of drift paths:

```sql
SELECT endpoint, count(*) calls, avg(latency_ms) avg_ms, sum(retries) retries, sum(error IS NOT NULL) errors
FROM dx_calls GROUP BY endpoint ORDER BY calls DESC;
```

## Record / replay

`BINANCE_WEB3_MODE=record` performs live calls and writes each final response to
`packages/sdk/fixtures/<module>/<METHOD>_<path>_<hash>.json`, keyed by method + path + canonical query +
body hash. Request headers are never stored (no API key, timestamp or `X-OC-SIGN`); signature-, token- and
authorization-like fields in bodies are redacted (per the B402 guide: never log "signatures, API secrets,
or full authorization payloads"). `BINANCE_WEB3_MODE=replay` needs no credentials and no network; a missing
fixture is `kind: "replay_miss"`. Telemetry and drift detection run identically on replayed responses.

## b402 merchant kit (`@nightshift/sdk/b402`)

```ts
import { createServer } from "node:http";
import { B402Merchant, requirePayment, toNodeListener, respond, SqliteIdempotencyStore } from "@nightshift/sdk/b402";

const merchant = new B402Merchant({
  facilitator: client.b402,                       // supported / verify / settle
  payTo: process.env.B402_PAY_TO!,                // the write-once onboarding address
  store: new SqliteIdempotencyStore(),            // table b402_payments; default is in-memory
});
const price = { amount: "10000000000000000", asset: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" }; // 0.01 USD1, eip3009
const gate = requirePayment(merchant, price, async () => ({ body: await premiumFairValue() }));

createServer(toNodeListener(gate)).listen(8080);                       // node:http
fastify.get("/v1/fair-value/:token", async (req, reply) => respond(reply, await gate(req))); // Fastify
```

Flow: **402** with `PAYMENT-REQUIRED` (base64 x402 V2 `PaymentRequired`, also as JSON body, including the
`resource` object) → decode `PAYMENT-SIGNATURE` → reject unless `paymentPayload.accepted` exactly matches a
server-held requirement (addresses compared case-insensitively) → Permit2/EIP-3009 consistency checks
(spender = `extra.spenderAddress`, `witness.to` = `payTo`, upto `witness.facilitator` = `extra.signerAddress`,
value/amount) → **Verify** → run the handler with the response held back → **Settle** (`settleAmount` for
`permit2-upto` metering) → deliver with `PAYMENT-RESPONSE`. `accepts[].extra` is copied verbatim from
`/supported` `kinds[].extra` (cached 10 min, stale copy served if B402 is briefly down) — signer, spender,
name and version are never hardcoded. Settlements are keyed by the signed authorization
(`network|eip3009|asset|from|nonce` or `network|permit2|from|nonce`) and indexed by tx hash: a replayed
`PAYMENT-SIGNATURE` gets 402 `invalid_transaction_state` instead of a second delivery; `success:false` with a
tx hash is stored as `reconcile` and the same authorization can be retried safely; a failing handler means
nothing is settled.

## Smoke test

```sh
pnpm --filter @nightshift/sdk smoke                      # needs BINANCE_WEB3_API_KEY / _SECRET_KEY (.env)
BINANCE_WEB3_MODE=record pnpm --filter @nightshift/sdk smoke   # also writes fixtures
```

Read-only: RWA platforms / bStock tokens / NVDAB price / underlying market, Market price + 1h candles, a
Trading quote USDT→NVDAB (25 USDT; set `SMOKE_WALLET_ADDRESS` to include RFQ routes; no swap is built),
Transaction block height + gas price. Prints a latency table and any drift, records to `dx_calls`. Without
keys it prints a skip notice and exits 0 (`--strict` → exit 1).

## How the docs were verified

The docs site sits behind an AWS WAF JavaScript challenge, so the raw Markdown of every guide page was
read via WebFetch (`*.md`, verbatim), the API reference via the rendered catalog pages and the docs'
own OpenAPI file (`…/rest-api/1.0.0/schema.json`, 1.64 MB, read in windows), cross-checked against the
models of the official connector generated from that spec. Gateway behaviour was probed with three
unauthenticated requests (no keys exist yet). Where sources disagreed the documented OpenAPI wins and the
disagreement is listed below. The signing tests use the documented pre-hash example plus signature
vectors computed independently with OpenSSL and WebCrypto (the docs elide their example signature).

## Doc issues found

Base URL for pages: `https://web3.binance.com/en/dev-docs/`. "Observed" = unauthenticated probe on 2026-10-08.

**Can break integrations or leak credentials**

1. **Bare-path redirect goes to a different host.** `authentication.md`: *"A bare `https://web3.binance.com/api/v1/...` (without `/build`) is redirected to the `/build` prefix at the edge"*. Observed: `301 Moved Permanently`, `Location: https://api.binance.com/api/v1/dex/market/supported/chain` — the Binance *spot* API host. A client that follows redirects ships its `X-OC-*` headers to another service.
2. **HTTP status of errors is contradictory.** `products/{market,trading,transaction,wallet}-api/error-codes.md`: *"All … API responses — including errors — return **HTTP 200**."* vs `authentication.md` error table (401/403/429/500/503) and `products/defi-api/error-codes.md`: *"gateway-layer errors are **not** returned as HTTP 200"*. Observed: HTTP 401 for 40101.
3. **Two envelope formats, one documented as universal.** `introduction.md`: *"All endpoints return the `OCResult<T>` format"* (`code: 0`, `success`). B402 responses use `{status, type, code, errorData, data, subData, params}` with string success code — `products/b402-api/integration-guide.md`: `if (supported.code !== "000000000")`.
4. **`rfq.orderId` is not in the `/swap` schema.** `products/trading-api/integration-flow.md`: *"this `quoteId` is the value of `rfq.orderId`, not the route identifier from `/quote`"*. The documented `rfq` object of `GET /aggregator/swap` (schema.json) has only `vendor, txType, typedDataToSign, signingScheme, signatureData`. The SDK reads `rfq.orderId` if present (`rfqOrderIdFrom`) and otherwise fails loudly.
5. **40102 means two different things.** `products/trading-api/error-codes.md`: *"For `/order/submit`: the `userSignature` does not match the `userWalletAddress` used in `/quote`"* — same code as a bad API HMAC. The SDK disambiguates by HTTP status (gateway 401 vs business 200).
6. **The only POST signing example uses an endpoint that doesn't exist.** `authentication.md` example: `requestPath = "/build/api/v1/dex/swap"`, body `{"chainId":1,"fromToken":…,"toToken":…}`; the real swap is `GET /api/v1/dex/aggregator/swap` with `binanceChainId`/`fromTokenAddress`/`toTokenAddress`.
7. **Permit2 `signature` location.** `products/b402-api/permit2-signing.md` table: *"`paymentPayload.payload.permit2Authorization` contains: … `signature`"*, but its own example and the schema put `signature` at `payload.signature`, next to `permit2Authorization`.
8. **B402's 402 example is not valid x402 V2.** `products/b402-api/integration-guide.md` §3 omits the required top-level `resource` object of `PaymentRequired`, while Verify requires `paymentPayload.resource` (asserted in `schemas.test.ts`).
9. **`/supported` kinds carry no asset.** `products/b402-api/introduction.md`: *"Supported assets, contract addresses … Always read them from `POST /api/v2/b402/supported`; do not hardcode them."* and `payment-methods.md`: *"Only advertise an asset/method combination that appears in `kinds[]`"* — but `kinds[]` (schema `B402SupportedDataV2`) has no asset field. The kit matches kinds by method/scheme/network and, if needed, `extra.name`.
10. **Broadcast errors describe the wrong request shape.** `products/transaction-api/error-codes.md`: *"Broadcast request is missing both `evmTx` and `solTx` (one is required)"* and *"`evmTx.gasLimit` or `evmTx.gasPrice` is not a valid numeric string"* — broadcast takes `signedTransaction`; `evmTx` (gas-limit/simulate) has only `from/to/value/data`.
11. **Error codes collide across modules.** 40470 is Trading `TAX_TOKEN_FEE_CONFLICT` and was DeFi's not-found code (`products/others/changelog.md`: *"Renumbered the data-query error code `40470` to `40490`"*); 40102 above. Codes must be interpreted per module.
12. **LLM-oriented docs are unreachable for agents.** `curl https://web3.binance.com/en/dev-docs/llms.txt` → `202`, `x-amzn-waf-action: challenge`, empty body. `llms-full.txt`'s "API Reference" section only lists one-line summaries (no parameters or schemas); the rendered reference pages exceed what text readers ingest (General Data truncates before Get Token Trades).
13. **Official JS connector can't batch prices.** `@binance-web3/wallet@13.0.1` (`sdks-tools/connectors/javascript.md`): `getTokenPrice()` / `getTokenTradingInfo()` accept only `recvWindow`/`nonce` — the documented JSON-array body cannot be sent; `getRfqOrderStatus()` also copies `orderId` into a GET body.

**Inconsistent or ambiguous**

14. Gateway error body: `authentication.md` shows `"data": null`; observed `"data": ""`, messages `"API Key is required"` / `"Invalid API Key"`, and no `success` field.
15. Asymmetric signing is referenced but undocumented: error pages *"HMAC-SHA256 or Ed25519 signature"*, `authentication.md` *"3.2 Sign with HMAC-SHA256 (Default)"*, `sdks-tools/connectors/javascript.md` *"Asymmetric key authentication using a private key is also supported."*
16. `authentication.md` rate-limit table lists `X-OC-Used-Weight` for both "Per User" and "Per Endpoint"; endpoint weights are never defined (the JS connector page says *"Monitor rate limits and endpoint weights"*).
17. `products/b402-api/integration-guide.md`: *"Log request IDs and transaction hashes"* — no request-id header is documented. Observed undocumented `X-OC-Trace-Id` (e.g. `unknown-gateway-80f2a5…`) and `X-OC-Blocked-By: AuthenticationFilter/40101`.
18. `42901 ORDER_SUBMIT_IN_PROGRESS` shares the `429xx` family with the rate-limit code 42900 but is a concurrency conflict.
19. `products/trading-api/error-codes.md`: *"`chainId` is not a positive integer or not on the supported-chain list"* — the parameter is `binanceChainId`, a string (`CT_501` is not an integer); 40411/40462 also say `chainId`.
20. `products/trading-api/introduction.md`: *"**BStock tokens** (type=3): … (e.g. PALLon/Palladium, TSLAB/Tesla)"* — `PALLon` carries Ondo's `on` suffix.
21. Ondo routing: `trading-api/introduction.md` *"Always routed via **3-vendor RFQ** (InchFusion + CowSwap + PcsXRfq)"* vs `error-codes.md` 40374 *"(LiquidMesh + PcsXRfq all returned no quotes)"*.
22. `quote-and-swap` schema: `executionMode` *"Always `SWAP` for this endpoint … (no `RFQ` mode)"*, yet the endpoint takes `enableRFQ` and returns an `rfq` object.
23. RWA `platformId` enum is `ondo | bstock` only, while `trading-api/introduction.md` documents xStock (type=2) equity tokens.
24. RWA `referencePrice` is *"a per-share converted price derived from the on-chain token price, not an official quote from the traditional stock market"* (schema) while `market-api/introduction.md` sells it as *"underlying reference price"* — not an independent signal.
25. Units: quote `amount` doc *"Example "1000000" = 1 USDT (decimals=6)"*, but BSC USDT has 18 decimals (`b402-api/payment-methods.md`) and the BSC examples in `fee-and-revenue-sharing.md` use `amount=1000000` (= 10⁻¹² USDT).
26. `products/websocket-api/introduction.md`: *"reply with a pong frame within 10 minutes … more frequently than once every 15 minutes"*.
27. `products/websocket-api/error-codes.md` uses `{"code": 0, "msg": "Unknown property"}` for an error; REST uses 0 for success.
28. `products/transaction-api/error-codes.md`: *"All four codes may be returned by `POST /broadcast-transaction`"* above a five-row table; 40314 says *"resubmit with the user's explicit confirmation flag"* but no such flag exists.
29. `transaction-detail-by-txhash` returns `chainIndex` and `txhash` (lower-case h) while every other endpoint uses `binanceChainId`/`txHash`; both query params are optional in the schema though *"Always pass both `binanceChainId` and the exact `txHash`"* (integration-flow).
30. `excludeRiskToken` is a boolean on `GET all-token-balances-by-address` but a string enum on `POST token-balances-by-address` where *"\"0\"=exclude (default), \"1\"=include"*.
31. `all-token-balances-by-address`: plural `chains` but *"Currently only a single chain is supported"*; `address` optional in the schema.
32. `POST /market/token/basic-info` takes query parameters and no body; the auth spec doesn't say what to sign for an empty POST body (the SDK signs `""`).
33. `defi-api/integration-flow.md` claim table: *"`REDEMPTION` | `investmentId` + `redemptionId`"* vs `defi-api/error-codes.md`: *"`REDEMPTION` → `redemptionId`"*.
34. `gas-limit` / `simulate` schemas mark `evmTx`, `solTx` **and** `tronTx` all required although exactly one applies; `evmTx.data` is required yet described *"Optional when no contract call is involved"*.
35. `trading-api/supported-chains.md` "Short Name" column shows gas tokens (Linea, Blast, Scroll … = `ETH`).
36. `fee-and-revenue-sharing.md` lists Tron in the chain table, but the intro says EVM + Solana and the limits table omits Tron's address format.
37. Same parameter, different encodings: portfolio `timeFrame` *"1=1D, 2=7D, 3=1M, 4=3M"* vs leaderboard *"1=7D, 2=1M, 3=3M"* (the docs themselves warn: *"do not reuse enum knowledge across endpoints"*).
38. `defi-api/integration-flow.md` deposit example omits the envelope's `success` and `data.redeemDelayDays` (documented as *"`null` on the other build endpoints"*) — caught by `schemas.test.ts`.
39. WebSocket auth-token response schema has no `timestamp`/`success`, but its example includes them.
40. Error pages link a *"[status page](https://developers.binance.com)"* that is the general developer portal; `others/changelog.md` has no entry for the RWA data endpoints.

## Not verified (no API keys yet)

Live behaviour of authenticated calls: real response bodies (drift), RFQ `rfq.orderId` presence, whether
the gateway rejects an empty-body POST signature for `basic-info`, rate-limit headers, and `/supported`
contents. The smoke test and `dx_calls` are built to answer these on the first keyed run.

## Layout

`src/sign.ts` signing · `client.ts` transport · `ratelimit.ts` `breaker.ts` `retry.ts` `clock.ts` resilience ·
`errors.ts` error catalog · `drift.ts` `telemetry.ts` `sqlite-sink.ts` DER engine · `fixtures.ts` record/replay ·
`endpoints/*` typed modules · `schemas/*` documented schemas · `b402/*` merchant kit · `testing.ts` mock fetch ·
`scripts/smoke.ts` live smoke test.
