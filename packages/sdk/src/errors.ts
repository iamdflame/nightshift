/**
 * Typed errors and the error-code catalog, transcribed from each module's "Error Codes" page:
 *   products/{market,trading,transaction,wallet,defi,b402}-api/error-codes.md + authentication.md.
 *
 * Codes are *module-scoped*, not global: e.g. 40470 is Trading's TAX_TOKEN_FEE_CONFLICT but was
 * DeFi's not-found code in v1.0 (renumbered to 40490), and 40102 means "bad API signature" at the
 * gateway (HTTP 401) but "bad EIP-712 userSignature" on POST /order/submit (HTTP 200). Lookups
 * therefore take the module and the HTTP status into account.
 */

export type ModuleName = "rwa" | "market" | "trading" | "transaction" | "wallet" | "defi" | "b402";

export type ErrorKind =
  | "auth"
  | "signature"
  | "user_signature"
  | "clock"
  | "permission"
  | "rate_limit"
  | "param"
  | "compliance"
  | "market_closed"
  | "quote_expired"
  | "conflict"
  | "business"
  | "server"
  | "unavailable"
  | "network"
  | "timeout"
  | "circuit_open"
  | "redirect"
  | "waf"
  | "schema"
  | "replay_miss"
  | "config"
  | "unknown";

export interface CodeInfo {
  name: string;
  kind: ErrorKind;
  /** Safe to retry *if the endpoint itself is retry-safe* (writes are governed separately). */
  retryable: boolean;
}

const c = (name: string, kind: ErrorKind, retryable = false): CodeInfo => ({ name, kind, retryable });

/** Gateway / cross-module codes (authentication.md and every module's shared tables). */
const GLOBAL: Record<string, CodeInfo> = {
  "40001": c("PARAMETER_ERROR", "param"),
  "40101": c("INVALID_API_KEY", "auth"),
  "40102": c("SIGNATURE_ERROR", "signature"),
  "40103": c("TIMESTAMP_EXPIRED", "clock", true),
  "40104": c("PERMISSION_DENIED", "permission"),
  "42900": c("RATE_LIMIT_EXCEEDED", "rate_limit", true),
  "50000": c("INTERNAL_SERVER_ERROR", "server", true),
  "50001": c("SERVICE_UNAVAILABLE", "unavailable", true),
  "40301": c("REGION_NOT_AVAILABLE", "compliance"),
  "40302": c("PROXY_OR_VPN_DETECTED", "compliance"),
  "40303": c("UNUSUAL_IP_ACTIVITY", "compliance"),
  "40304": c("COMPLIANCE_RESTRICTION", "compliance"),
  "40311": c("KYT_HIGH_RISK_ADDRESS", "compliance"),
  "40312": c("KYT_SANCTIONED_ADDRESS", "compliance"),
  "40313": c("KYT_RISKY_FUND_ORIGIN", "compliance"),
  "40314": c("KYT_MEDIUM_RISK_CONFIRMATION_REQUIRED", "compliance"),
  "40434": c("KYT_VERIFICATION_FAILED", "compliance"),
  "40411": c("CHAIN_NOT_SUPPORTED", "param"),
};

const BY_MODULE: Partial<Record<ModuleName, Record<string, CodeInfo>>> = {
  trading: {
    "40412": c("DEX_CONTRACT_NOT_CONFIGURED", "business"),
    "40401": c("QUOTE_EXPIRED", "quote_expired"),
    "40421": c("INSUFFICIENT_LIQUIDITY", "business"),
    "40441": c("NO_VALID_QUOTE", "business", true),
    "40442": c("IDENTICAL_TOKEN_PAIR", "param"),
    "40461": c("NO_VALID_SWAP_ROUTE", "business"),
    "40462": c("SWAP_QUOTE_MISMATCH", "param"),
    "40463": c("PRICE_IMPACT_EXCEEDS_PROTECTION", "business"),
    "40464": c("SLIPPAGE_OUT_OF_RANGE", "param"),
    "40465": c("VENDOR_SWAP_CALL_FAILED", "business", true),
    "40466": c("INVALID_FEE_PERCENT", "param"),
    "40467": c("INVALID_REFERRER_ADDRESS", "param"),
    "40468": c("CONFLICT_REFERRER_PARAMS", "param"),
    "40469": c("REFERRER_NOT_ACTIVATED", "business"),
    "40470": c("TAX_TOKEN_FEE_CONFLICT", "business"),
    "40432": c("GAS_PRICE_ESTIMATION_FAILED", "unavailable", true),
    "40374": c("RWA_INSUFFICIENT_LIQUIDITY", "business"),
    "40365": c("ONDO_TOKEN_PAIR_NOT_SUPPORTED", "param"),
    "40366": c("ONDO_MAX_SINGLE_ORDER_LIMIT", "business"),
    "40367": c("ONDO_MARKET_STATE_NOT_TRADABLE", "market_closed"),
    "40368": c("ONDO_STABLECOIN_PAIR_INVALID", "param"),
    "40369": c("BSTOCK_INVALID_TRADING_TIME", "market_closed"),
    "40370": c("BSTOCK_INVALID_TRADING_PAIR", "param"),
    "40375": c("ONDO_FROM_USD_AMOUNT_TOO_SMALL", "param"),
    "42901": c("ORDER_SUBMIT_IN_PROGRESS", "conflict", true),
  },
  transaction: {
    "40431": c("BROADCAST_FAILED", "business"),
  },
  defi: {
    "40450": c("CHAIN_NOT_SUPPORTED_FOR_DEFI", "param"),
    "40451": c("INVESTMENT_INVALID", "param"),
    "40452": c("INVESTMENT_DELISTED", "business"),
    "40453": c("INVALID_REQUEST_PARAMETERS", "param"),
    "40454": c("CLAIM_PARAMS_MISMATCH", "param"),
    "40455": c("HEALTH_FACTOR_BELOW_THRESHOLD", "business"),
    "40456": c("POSITION_NOT_FOUND", "business"),
    "40457": c("NO_LIQUIDITY_TO_REMOVE", "business"),
    "40458": c("ZAP_FAILED", "business"),
    "40459": c("BUILD_FAILED", "business"),
    "40460": c("SIMULATION_FAILED", "business"),
    "40480": c("INSUFFICIENT_BALANCE", "business"),
    "40481": c("ACTION_TEMPORARILY_UNAVAILABLE", "unavailable"),
    "40482": c("BLOCKCHAIN_RPC_ERROR", "unavailable", true),
    "40483": c("DEFI_INTERNAL_ERROR", "server", true),
    "40484": c("PREVIEW_REVERTED", "business"),
    "40485": c("REDEEM_EXCEEDS_POSITION", "business"),
    "40490": c("RESOURCE_NOT_FOUND", "param"),
  },
  b402: {
    "1160101": c("SYSTEM_ERROR", "server"),
    "1160102": c("SYSTEM_BUSY", "unavailable", true),
    "1160103": c("ILLEGAL_REQUEST_PARAMETER", "param"),
    "1160104": c("RPC_CHAIN_ID_MISMATCH", "business"),
    "1160201": c("DATA_NOT_FOUND", "business"),
    "1160202": c("DUPLICATE_DATA", "business"),
    "1160301": c("INVALID_STATUS", "business"),
    "1160401": c("MERCHANT_NOT_FOUND", "config"),
    "1160402": c("MERCHANT_DISABLED", "permission"),
    "1160403": c("SINGLE_TRANSACTION_LIMIT", "business"),
    "1160404": c("MERCHANT_DAILY_LIMIT", "business"),
    "1160405": c("PAYER_DAILY_LIMIT", "business"),
    "1160406": c("PAYER_BLOCKED", "compliance"),
    "1160407": c("SANCTIONS_REJECTED", "compliance"),
    "1160408": c("MERCHANT_RATE_LIMIT", "rate_limit", true),
    "1160409": c("GAS_BUDGET_EXHAUSTED", "unavailable"),
  },
};

/** Module "error-codes" page for a module, for linking from errors. */
export function errorDocsUrl(module: ModuleName): string {
  const slug = module === "rwa" ? "market" : module;
  return `https://web3.binance.com/en/dev-docs/products/${slug}-api/error-codes.md`;
}

/**
 * Resolve an API code in context. `httpStatus` disambiguates 40102: gateway signature failures
 * arrive as HTTP 401, the RFQ `userSignature` mismatch on /order/submit as a business error (200).
 */
export function describeCode(code: string | number | null | undefined, module: ModuleName, httpStatus?: number | null): CodeInfo | null {
  if (code === null || code === undefined || code === "") return null;
  const key = String(code);
  if (key === "40102" && module === "trading" && httpStatus !== undefined && httpStatus !== null && httpStatus < 300) {
    return c("USER_SIGNATURE_MISMATCH", "user_signature");
  }
  return BY_MODULE[module]?.[key] ?? GLOBAL[key] ?? null;
}

/** Envelope success codes: OCResult uses numeric 0; B402 uses the string "000000000". */
export function isSuccessCode(code: unknown): boolean {
  return code === 0 || code === "0" || code === "000000000";
}

export interface BinanceWeb3ErrorInit {
  message: string;
  kind: ErrorKind;
  module: ModuleName;
  /** "METHOD /api/v1/..." (path template, no /build prefix). */
  endpoint: string;
  httpStatus?: number | null;
  apiCode?: string | number | null;
  apiMessage?: string | null;
  codeName?: string | null;
  requestId?: string | null;
  retryable?: boolean;
  retryAfterMs?: number | null;
  attempts?: number;
  /** Response body, truncated; never includes request headers or secrets. */
  responseBody?: string | null;
  cause?: unknown;
}

export class BinanceWeb3Error extends Error {
  override readonly name = "BinanceWeb3Error";
  readonly kind: ErrorKind;
  readonly module: ModuleName;
  readonly endpoint: string;
  readonly httpStatus: number | null;
  readonly apiCode: string | null;
  readonly apiMessage: string | null;
  readonly codeName: string | null;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  attempts: number;
  readonly responseBody: string | null;
  readonly docsUrl: string;

  constructor(init: BinanceWeb3ErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.kind = init.kind;
    this.module = init.module;
    this.endpoint = init.endpoint;
    this.httpStatus = init.httpStatus ?? null;
    this.apiCode = init.apiCode === undefined || init.apiCode === null ? null : String(init.apiCode);
    this.apiMessage = init.apiMessage ?? null;
    this.codeName = init.codeName ?? null;
    this.requestId = init.requestId ?? null;
    this.retryable = init.retryable ?? false;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.attempts = init.attempts ?? 1;
    this.responseBody = init.responseBody ?? null;
    this.docsUrl = errorDocsUrl(init.module);
  }

  static is(e: unknown): e is BinanceWeb3Error {
    return e instanceof BinanceWeb3Error;
  }

  /** Compact, log-safe summary. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      module: this.module,
      endpoint: this.endpoint,
      httpStatus: this.httpStatus,
      apiCode: this.apiCode,
      codeName: this.codeName,
      apiMessage: this.apiMessage,
      requestId: this.requestId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      attempts: this.attempts,
    };
  }
}

/** Build an error from an API envelope (non-success code), consulting the catalog. */
export function errorFromApi(args: {
  module: ModuleName;
  endpoint: string;
  httpStatus: number | null;
  apiCode: string | number | null;
  apiMessage: string | null;
  requestId: string | null;
  retryAfterMs?: number | null;
  responseBody?: string | null;
}): BinanceWeb3Error {
  const info = describeCode(args.apiCode, args.module, args.httpStatus);
  let kind: ErrorKind = info?.kind ?? kindFromHttp(args.httpStatus);
  let retryable = info?.retryable ?? (args.httpStatus !== null && (args.httpStatus === 429 || args.httpStatus >= 500));
  if (args.httpStatus === 429) {
    kind = "rate_limit";
    retryable = true;
  }
  const label = info ? `${args.apiCode} ${info.name}` : `${args.apiCode ?? `HTTP ${args.httpStatus}`}`;
  return new BinanceWeb3Error({
    message: `${args.endpoint} failed: ${label}${args.apiMessage ? ` — ${args.apiMessage}` : ""}`,
    kind,
    module: args.module,
    endpoint: args.endpoint,
    httpStatus: args.httpStatus,
    apiCode: args.apiCode,
    apiMessage: args.apiMessage,
    codeName: info?.name ?? null,
    requestId: args.requestId,
    retryable,
    retryAfterMs: args.retryAfterMs ?? null,
    responseBody: args.responseBody ?? null,
  });
}

export function kindFromHttp(status: number | null): ErrorKind {
  if (status === null) return "unknown";
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 429) return "rate_limit";
  if (status === 400) return "param";
  if (status === 503) return "unavailable";
  if (status >= 500) return "server";
  if (status >= 300 && status < 400) return "redirect";
  return "unknown";
}
