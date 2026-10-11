/**
 * What each Binance Web3 API outcome in `dx_calls` means, and what Nightshift does about it. Every note is grounded
 * in docs/der/EVIDENCE.md (what we met, measured), the SDK's error catalog (packages/sdk/src/errors.ts) and its
 * retry, clock and circuit-breaker code (packages/sdk/src/client.ts, breaker.ts), or the caller that handles it
 * (packages/tape/src/web3.ts, packages/api/src/x402.ts, packages/trade/src/executor.ts).
 *
 * Keys are /v1/stack code keys: the envelope code ("0", "40001", "000000000"); "HTTP <status>" when a response had
 * no API envelope; else the SDK's error kind ("network", "timeout", "circuit_open").
 */
import { describeCode, type ModuleName } from "@nightshift/sdk";

export interface CodeNote {
  meaning: string;
  ourHandling: string;
}

/** Envelope success codes: OCResult uses 0, the B402 facilitator "000000000". */
export const OK_CODES = new Set(["0", "000000000"]);
/** A compliance code in the SDK's catalog (region, VPN, IP, restriction, KYT): Binance declining to serve the caller. */
export const isCompliance = (code: string, module: string): boolean => /^\d+$/.test(code) && describeCode(code, module as ModuleName)?.kind === "compliance";

const RATE_LIMIT: CodeNote = {
  meaning: "Rate limited.",
  ourHandling: "The SDK waits exactly as long as Retry-After says, then retries. Its token buckets keep us under 5 requests a second per endpoint and 1,200 a minute per key.",
};
const SERVER: CodeNote = {
  meaning: "Server error or service unavailable.",
  ourHandling: "Retried with jittered exponential backoff, up to 3 times. Five failures in a row open that endpoint's circuit breaker.",
};
const MARKET_CLOSED: CodeNote = {
  meaning: "The aggregator refuses to trade a tokenized stock outside its trading hours (40367 Ondo, 40369 bStock).",
  ourHandling: "Typed as market_closed and never retried. The quote ladder stores the refusal with its code; the trade executor can fall back to a limit order or wait for the open.",
};

export const CODE_NOTES: Record<string, CodeNote> = {
  "0": {
    meaning: "Success.",
    ourHandling: "The data is validated against the documented schema, and every field the docs don't describe (or that is missing) is logged as doc drift.",
  },
  "000000000": {
    meaning: "Success, in the B402 facilitator's envelope (a nine-digit string, not 0).",
    ourHandling: "Treated as success, like 0.",
  },
  "40001": {
    meaning: "Parameter error. We met it as \"userWalletAddress is required for RFQ (Ondo) quote\": Ondo tokens route through RFQ, which refuses even a price-only quote without a wallet.",
    ourHandling: "Quotes now carry the trade executor's public address (nothing is signed). Never retried: a business error means the service is healthy.",
  },
  "40104": {
    meaning: "Permission denied: our API key didn't have the B402 permission yet (\"No permission: B402\").",
    ourHandling: "Pay-per-query stays off and /x402/price says why. B402's supported list is re-checked every 10 minutes, and the paid endpoint switches itself on once it answers.",
  },
  "40374": {
    meaning: "Not enough liquidity for a quote of that size. We meet it in our $100 / $1k / $10k quote ladder, mostly on Ondo tokens and $10k bStock buys.",
    ourHandling: "Stored as a refused rung with its code, not retried. The other sizes still quote.",
  },
  "40367": MARKET_CLOSED,
  "40369": MARKET_CLOSED,
  "40101": { meaning: "Invalid API key.", ourHandling: "Fails fast as an auth error; never retried." },
  "40102": {
    meaning: "Signature rejected. The auth docs name a prehash without the /build prefix as the top cause.",
    ourHandling: "Signing is a pure function checked against test vectors, always over /build plus the exact query sent. Never retried.",
  },
  "40103": {
    meaning: "Timestamp outside the receive window (clock skew, or a replay).",
    ourHandling: "The SDK adopts the server time carried by that very response, re-signs and retries once (never for a broadcast).",
  },
  "42900": RATE_LIMIT,
  "HTTP 429": RATE_LIMIT,
  "50000": SERVER,
  "50001": SERVER,
  "40304": {
    meaning:
      "Compliance restriction. Binance refused RWA Data and tokenized-stock quotes to our first production host in Railway's EU West region (the Netherlands, a restricted region) from Oct 11 01:42 UTC; the docs don't list where these endpoints are available. Since we moved the server to Singapore (Oct 11 08:33 UTC) they answer.",
    ourHandling:
      "Never retried and never routed around: the RWA pollers back off to one try every 30 minutes, the quote ladder sizes its sells from BSC pool prices, and the oracle keeps pricing from Binance spot books and pools. We moved the server to a region Binance serves.",
  },
  "HTTP 414": {
    meaning: "URI Too Long, with no API envelope: 165 token addresses in one RWA price query string. The docs state no batch limit.",
    ourHandling: "RWA price requests now carry 20 addresses each, which keeps every URL under about 1 KB.",
  },
  network: {
    meaning: "The connection failed before any response arrived.",
    ourHandling: "Read endpoints retry with jittered exponential backoff, up to 3 times; five failures in a row open the endpoint's circuit breaker. A broadcast is never retried.",
  },
  timeout: {
    meaning: "No response within 10 seconds.",
    ourHandling: "Every attempt has its own 10-second timeout and is retried like a network error.",
  },
  circuit_open: {
    meaning: "Not sent: the endpoint's circuit breaker was open after five failures in a row (network errors, timeouts or 5xx).",
    ourHandling: "Fails fast without touching the network for 15 s (doubling up to 120 s), then lets one trial call through.",
  },
};

/** A code we have no note for: fall back to the SDK's catalog (name, kind, retryable) so nothing is made up. */
export function noteFor(code: string, module: string): CodeNote & { name: string | null } {
  const info = /^\d+$/.test(code) ? describeCode(code, module as ModuleName) : null;
  const note = CODE_NOTES[code];
  if (note) return { ...note, name: info?.name ?? null };
  if (info) {
    const words = info.name.toLowerCase().replace(/_/g, " ");
    return {
      name: info.name,
      meaning: `${words[0]!.toUpperCase()}${words.slice(1)}.`,
      ourHandling: info.retryable ? "Retried with backoff on endpoints that are safe to retry (the SDK's catalog marks it retryable)." : `Surfaced as a typed error (kind ${info.kind}); never retried.`,
    };
  }
  return { name: null, meaning: "Not in the documented error catalog.", ourHandling: "Surfaced as a typed error with the raw code and request id." };
}
