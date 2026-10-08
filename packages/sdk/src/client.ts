/**
 * BinanceWeb3Client — signed, rate-limited, retrying, circuit-broken, instrumented access to every
 * documented Binance Web3 API endpoint, plus record/replay.
 *
 * Per logical call:
 *   breaker.check → limiter.acquire(endpoint, key) → sign with skew-corrected time → fetch (timeout,
 *   redirects refused) → sample server time → classify (envelope code / HTTP status / WAF / redirect)
 *   → retry per the endpoint's retry class → validate `data` against the documented schema → diff
 *   for doc drift → emit one CallRecord.
 */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { BreakerRegistry, type BreakerOptions } from "./breaker.ts";
import { ServerClock, sampleFromResponse } from "./clock.ts";
import { detectDrift, formatIssues } from "./drift.ts";
import type { CallInput, CallOptions, EndpointDef, ValidationMode } from "./endpoint.ts";
import { documentedEnvelope, readEnvelope } from "./envelope.ts";
import { BinanceWeb3Error, errorFromApi, isSuccessCode, kindFromHttp } from "./errors.ts";
import { FixtureStore, resolveMode, type FixtureResponse } from "./fixtures.ts";
import { type Clock, monotonicNow, RateLimiter, type RateLimitConfig, realSleep, type Sleep } from "./ratelimit.ts";
import { backoffDelay, DEFAULT_RETRY, parseRetryAfter, type RetryPolicy } from "./retry.ts";
import { BASE_URL, buildQueryString, buildRequestPath, expandPath, signRequest } from "./sign.ts";
import { type CallRecord, emit, type Mode, type TelemetrySink } from "./telemetry.ts";
import { B402Api } from "./endpoints/b402.ts";
import { DefiApi } from "./endpoints/defi.ts";
import { MarketApi } from "./endpoints/market.ts";
import { RwaApi } from "./endpoints/rwa.ts";
import { TradingApi } from "./endpoints/trading.ts";
import { TransactionApi } from "./endpoints/transaction.ts";
import { WalletApi } from "./endpoints/wallet.ts";

export interface BinanceWeb3ClientOptions {
  /** Defaults to env BINANCE_WEB3_API_KEY. */
  apiKey?: string;
  /** Defaults to env BINANCE_WEB3_SECRET_KEY. */
  secretKey?: string;
  baseUrl?: string;
  /** Defaults to env BINANCE_WEB3_MODE (live|record|replay), else live. */
  mode?: Mode;
  fixtures?: FixtureStore | string;
  fetch?: typeof fetch;
  /** Per-attempt timeout (default 10 s). */
  timeoutMs?: number;
  /** Send X-OC-RECV-WINDOW on every call (server default 5000, max 60000). */
  recvWindowMs?: number;
  /** Send a fresh X-OC-NONCE (UUID) per attempt — also our client-side correlation id. Default true. */
  sendNonce?: boolean;
  retry?: Partial<RetryPolicy>;
  rateLimit?: RateLimitConfig | false;
  breaker?: BreakerOptions | false;
  /** "warn" (default): schema mismatches are reported, data is returned; "strict": throw; "off". */
  validation?: ValidationMode;
  telemetry?: TelemetrySink | readonly TelemetrySink[];
  userAgent?: string;
  /** Wall clock (epoch ms). */
  now?: Clock;
  /** Monotonic clock for latency and limiter math. */
  monotonic?: Clock;
  sleep?: Sleep;
  random?: () => number;
  onTelemetryError?: (e: unknown) => void;
}

export interface CallResult<T> {
  data: T;
  record: CallRecord;
  /** Full parsed response body (envelope included). */
  body: unknown;
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  sentAt: number;
  receivedAt: number;
  nonce?: string;
}

type Classified =
  | { ok: true; json: unknown; data: unknown; code: string | null }
  | { ok: false; json: unknown; error: BinanceWeb3Error; availabilityFailure: boolean };

const SDK_UA = "nightshift-sdk/0.1 (+https://github.com/; node)";

export class BinanceWeb3Client {
  readonly mode: Mode;
  readonly baseUrl: string;
  readonly clock: ServerClock;
  readonly limiter: RateLimiter | null;
  readonly breakers: BreakerRegistry | null;
  readonly fixtures: FixtureStore;
  readonly retryPolicy: RetryPolicy;

  readonly rwa: RwaApi;
  readonly market: MarketApi;
  readonly trading: TradingApi;
  readonly transaction: TransactionApi;
  readonly wallet: WalletApi;
  readonly defi: DefiApi;
  readonly b402: B402Api;

  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly recvWindowMs: number | undefined;
  private readonly sendNonce: boolean;
  private readonly validation: ValidationMode;
  private readonly sinks: TelemetrySink[];
  private readonly userAgent: string;
  private readonly now: Clock;
  private readonly mono: Clock;
  private readonly sleep: Sleep;
  private readonly random: () => number;
  private readonly onTelemetryError: ((e: unknown) => void) | undefined;

  constructor(opts: BinanceWeb3ClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.BINANCE_WEB3_API_KEY ?? "";
    this.secretKey = opts.secretKey ?? process.env.BINANCE_WEB3_SECRET_KEY ?? "";
    this.baseUrl = (opts.baseUrl ?? BASE_URL).replace(/\/+$/, "");
    this.mode = opts.mode ?? resolveMode();
    this.fixtures = opts.fixtures instanceof FixtureStore ? opts.fixtures : new FixtureStore(opts.fixtures);
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.recvWindowMs = opts.recvWindowMs;
    this.sendNonce = opts.sendNonce ?? true;
    this.validation = opts.validation ?? "warn";
    this.sinks = opts.telemetry === undefined ? [] : Array.isArray(opts.telemetry) ? [...opts.telemetry] : [opts.telemetry as TelemetrySink];
    this.userAgent = opts.userAgent ?? SDK_UA;
    this.now = opts.now ?? Date.now;
    this.mono = opts.monotonic ?? monotonicNow;
    this.sleep = opts.sleep ?? realSleep;
    this.random = opts.random ?? Math.random;
    this.onTelemetryError = opts.onTelemetryError;
    this.retryPolicy = { ...DEFAULT_RETRY, ...opts.retry };
    this.clock = new ServerClock(this.now);
    this.limiter = opts.rateLimit === false ? null : new RateLimiter(opts.rateLimit ?? {}, this.mono, this.sleep);
    this.breakers = opts.breaker === false ? null : new BreakerRegistry(opts.breaker ?? {}, this.mono);

    this.rwa = new RwaApi(this);
    this.market = new MarketApi(this);
    this.trading = new TradingApi(this);
    this.transaction = new TransactionApi(this);
    this.wallet = new WalletApi(this);
    this.defi = new DefiApi(this);
    this.b402 = new B402Api(this);
  }

  hasCredentials(): boolean {
    return Boolean(this.apiKey && this.secretKey);
  }

  addSink(sink: TelemetrySink): void {
    this.sinks.push(sink);
  }

  /** Call an endpoint and return its validated `data`. */
  async call<D extends z.ZodType>(ep: EndpointDef<D>, input: CallInput = {}, opts: CallOptions = {}): Promise<z.infer<D>> {
    return (await this.callWithMeta(ep, input, opts)).data;
  }

  async callWithMeta<D extends z.ZodType>(ep: EndpointDef<D>, input: CallInput = {}, opts: CallOptions = {}): Promise<CallResult<z.infer<D>>> {
    const label = `${ep.method} ${ep.path}`;
    const path = expandPath(ep.path, input.pathParams);
    const query = buildQueryString(input.query);
    const requestPath = buildRequestPath(path, query);
    const bodyText = ep.method === "GET" || input.body === undefined ? "" : JSON.stringify(ep.wrapBody ? { body: input.body } : input.body);
    const startedAt = this.now();
    const t0 = this.mono();
    const validation = opts.validation ?? this.validation;

    let retries = 0;
    let rateWait = 0;
    let resynced = false;
    let last: RawResponse | null = null;
    let lastCode: string | null = null;
    let rateRemaining: number | null = null;

    const finish = (outcome: { error?: BinanceWeb3Error; json?: unknown; data?: unknown; schemaIssues?: string[]; success: boolean }): CallRecord => {
      const drift =
        outcome.json === undefined
          ? { undocumented: [], missing: [] }
          : detectDrift(documentedEnvelope(ep.envelope, ep.data, outcome.success), outcome.json);
      const record: CallRecord = {
        ts: startedAt,
        module: ep.module,
        endpoint: ep.path,
        method: ep.method,
        httpStatus: last?.status ?? null,
        apiCode: lastCode,
        latencyMs: Math.round((this.mono() - t0) * 100) / 100,
        retries,
        requestBytes: Buffer.byteLength(requestPath) + Buffer.byteLength(bodyText),
        responseBytes: last ? Buffer.byteLength(last.text) : 0,
        requestId: last ? requestIdOf(last) : undefined,
        error: outcome.error?.message,
        undocumentedFields: drift.undocumented,
        missingFields: drift.missing,
        endpointId: ep.id,
        errorKind: outcome.error?.kind,
        schemaIssues: outcome.schemaIssues?.length ? outcome.schemaIssues : undefined,
        mode: this.mode,
        clockOffsetMs: this.clock.offsetMs,
        rateLimitWaitMs: rateWait,
        rateLimitRemaining: rateRemaining,
      };
      emit(this.sinks, record, this.onTelemetryError);
      return record;
    };

    const fail = (error: BinanceWeb3Error, json?: unknown): never => {
      error.attempts = retries + 1;
      finish({ error, json, success: false });
      throw error;
    };

    if (this.mode !== "replay" && !this.hasCredentials()) {
      fail(
        new BinanceWeb3Error({
          message: `${label}: missing credentials (set BINANCE_WEB3_API_KEY / BINANCE_WEB3_SECRET_KEY, or use BINANCE_WEB3_MODE=replay)`,
          kind: "config",
          module: ep.module,
          endpoint: label,
        }),
      );
    }

    const breaker = this.mode === "replay" ? null : (this.breakers?.get(ep.id) ?? null);

    for (;;) {
      const decision = breaker?.check() ?? { ok: true as const };
      if (!decision.ok) {
        fail(
          new BinanceWeb3Error({
            message: `${label}: circuit open after repeated failures; retry in ${decision.retryInMs} ms`,
            kind: "circuit_open",
            module: ep.module,
            endpoint: label,
            retryable: true,
            retryAfterMs: decision.retryInMs,
          }),
        );
      }

      let raw: RawResponse;
      if (this.mode === "replay") {
        const fx = this.fixtures.read(ep.module, { method: ep.method, path, query, body: bodyText });
        if (!fx) {
          fail(
            new BinanceWeb3Error({
              message: `${label}: no fixture for this request in ${this.fixtures.dir} (record it with BINANCE_WEB3_MODE=record)`,
              kind: "replay_miss",
              module: ep.module,
              endpoint: label,
            }),
          );
        }
        const t = this.now();
        raw = { status: fx!.response.status, headers: lower(fx!.response.headers), text: fx!.response.body, sentAt: t, receivedAt: t };
      } else {
        if (this.limiter) rateWait += await this.limiter.acquire(ep.id, opts.signal);
        const attempt = await this.attempt(ep, label, requestPath, bodyText, opts);
        if ("transportError" in attempt) {
          breaker?.onFailure();
          const err = attempt.transportError;
          if (ep.retry !== "never" && retries < this.retryPolicy.maxRetries) {
            await this.sleep(backoffDelay(retries, this.retryPolicy, this.random), opts.signal);
            retries++;
            continue;
          }
          fail(err);
        }
        raw = attempt as RawResponse;
      }
      last = raw;
      const remaining = Number(raw.headers["x-oc-ratelimit-remaining"]);
      rateRemaining = Number.isFinite(remaining) && raw.headers["x-oc-ratelimit-remaining"] !== undefined ? remaining : rateRemaining;

      const result = this.classify(ep, label, raw);
      lastCode = result.ok ? result.code : result.error.apiCode;
      if (this.mode !== "replay") {
        const sample = sampleFromResponse(raw.sentAt, raw.receivedAt, result.json, raw.headers.date ?? null);
        if (sample) this.clock.observe(sample);
      }

      if (result.ok) {
        breaker?.onSuccess();
        this.maybeRecord(ep, path, query, bodyText, raw);
        let data = result.data;
        let issues: string[] = [];
        if (validation !== "off") {
          const parsed = ep.data.safeParse(result.data);
          if (parsed.success) data = parsed.data;
          else {
            issues = formatIssues(parsed.error);
            if (validation === "strict") {
              const error = new BinanceWeb3Error({
                message: `${label}: response failed documented-schema validation: ${issues.slice(0, 3).join("; ")}`,
                kind: "schema",
                module: ep.module,
                endpoint: label,
                httpStatus: raw.status,
                apiCode: lastCode,
                requestId: requestIdOf(raw),
              });
              error.attempts = retries + 1;
              finish({ error, json: result.json, success: true, schemaIssues: issues });
              throw error;
            }
          }
        }
        const record = finish({ json: result.json, data, success: true, schemaIssues: issues });
        return { data: data as z.infer<D>, record, body: result.json };
      }

      // ---- failure ----
      const err = result.error;
      if (result.availabilityFailure) breaker?.onFailure();
      else breaker?.onSuccess();

      if (err.kind === "clock" && !resynced && this.mode !== "replay") {
        // 40103: adopt the server time carried by this very response, then re-sign and retry once.
        const sample = sampleFromResponse(raw.sentAt, raw.receivedAt, result.json, raw.headers.date ?? null);
        if (sample) this.clock.resync(sample);
        resynced = true;
        if (ep.retry !== "never") {
          retries++;
          continue;
        }
      }

      if (err.kind === "rate_limit" && this.limiter && this.mode !== "replay") {
        const pause = err.retryAfterMs ?? backoffDelay(retries, this.retryPolicy, this.random);
        this.limiter.penalize(ep.id, pause, raw.headers["x-oc-ratelimit-remaining"] === "0");
      }

      if (err.retryable && ep.retry !== "never" && this.mode !== "replay" && retries < this.retryPolicy.maxRetries) {
        const delay = Math.max(err.retryAfterMs ?? 0, err.kind === "rate_limit" && err.retryAfterMs ? 0 : backoffDelay(retries, this.retryPolicy, this.random));
        await this.sleep(delay, opts.signal);
        retries++;
        continue;
      }

      this.maybeRecord(ep, path, query, bodyText, raw);
      fail(err, result.json);
    }
  }

  private async attempt(
    ep: EndpointDef,
    label: string,
    requestPath: string,
    bodyText: string,
    opts: CallOptions,
  ): Promise<RawResponse | { transportError: BinanceWeb3Error }> {
    const nonce = this.sendNonce ? randomUUID() : undefined;
    const signed = signRequest({
      apiKey: this.apiKey,
      secretKey: this.secretKey,
      method: ep.method,
      requestPath,
      body: bodyText,
      timestampMs: this.clock.now(),
      recvWindowMs: opts.recvWindowMs ?? this.recvWindowMs,
      nonce,
    });
    const headers: Record<string, string> = { ...signed.headers, Accept: "application/json", "User-Agent": this.userAgent };
    if (bodyText) headers["Content-Type"] = "application/json";
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    const sentAt = this.now();
    try {
      const res = await this.fetchImpl(this.baseUrl + requestPath, {
        method: ep.method,
        headers,
        body: bodyText || undefined,
        redirect: "manual",
        signal,
      });
      const text = await res.text();
      const receivedAt = this.now();
      const h: Record<string, string> = {};
      res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
      return { status: res.status, headers: h, text, sentAt, receivedAt, nonce };
    } catch (e) {
      if (opts.signal?.aborted) {
        this.breakers?.get(ep.id).onNeutral();
        throw opts.signal.reason ?? e;
      }
      const timedOut = timeout.aborted;
      return {
        transportError: new BinanceWeb3Error({
          message: `${label}: ${timedOut ? `timed out after ${opts.timeoutMs ?? this.timeoutMs} ms` : `network error: ${(e as Error)?.message ?? String(e)}`}`,
          kind: timedOut ? "timeout" : "network",
          module: ep.module,
          endpoint: label,
          retryable: true,
          requestId: nonce ? `client:${nonce}` : null,
          cause: e,
        }),
      };
    }
  }

  private classify(ep: EndpointDef, label: string, raw: RawResponse): Classified {
    let json: unknown;
    try {
      json = raw.text ? JSON.parse(raw.text) : undefined;
    } catch {
      json = undefined;
    }
    const base = { module: ep.module, endpoint: label, httpStatus: raw.status, requestId: requestIdOf(raw) ?? null, responseBody: truncate(raw.text) };

    if (raw.status >= 300 && raw.status < 400) {
      return {
        ok: false,
        json,
        availabilityFailure: false,
        error: new BinanceWeb3Error({
          ...base,
          message: `${label}: HTTP ${raw.status} redirect to ${raw.headers.location ?? "?"} refused (credentials are never forwarded)`,
          kind: "redirect",
        }),
      };
    }
    if (raw.headers["x-amzn-waf-action"]) {
      return {
        ok: false,
        json,
        availabilityFailure: true,
        error: new BinanceWeb3Error({ ...base, message: `${label}: blocked by an AWS WAF ${raw.headers["x-amzn-waf-action"]} (HTTP ${raw.status})`, kind: "waf" }),
      };
    }

    const env = readEnvelope(json);
    const retryAfterMs = parseRetryAfter(raw.headers["retry-after"], this.now());
    if (env && isSuccessCode(env.code) && raw.status < 300) return { ok: true, json, data: env.data, code: env.code };
    if (env) {
      const error = errorFromApi({ ...base, apiCode: env.code, apiMessage: env.message, retryAfterMs });
      return { ok: false, json, error, availabilityFailure: error.kind === "server" || error.kind === "unavailable" };
    }
    const kind = raw.status < 300 ? "unknown" : kindFromHttp(raw.status);
    const retryable = raw.status === 429 || raw.status >= 500;
    return {
      ok: false,
      json,
      availabilityFailure: raw.status >= 500,
      error: new BinanceWeb3Error({
        ...base,
        message: `${label}: HTTP ${raw.status} without a recognizable API envelope`,
        kind: raw.status === 429 ? "rate_limit" : kind,
        retryable,
        retryAfterMs,
      }),
    };
  }

  private maybeRecord(ep: EndpointDef, path: string, query: string, body: string, raw: RawResponse): void {
    if (this.mode !== "record") return;
    const res: FixtureResponse = { status: raw.status, headers: raw.headers, body: raw.text };
    this.fixtures.write(ep.module, ep.id, { method: ep.method, path, query, body }, res);
  }
}

function lower(h: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
}

function requestIdOf(raw: RawResponse): string | undefined {
  return raw.headers["x-oc-trace-id"] ?? raw.headers["x-request-id"] ?? raw.headers["x-amzn-requestid"] ?? (raw.nonce ? `client:${raw.nonce}` : undefined);
}

function truncate(s: string, n = 2_000): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
