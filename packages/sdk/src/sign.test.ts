import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  buildPrehash,
  buildQueryString,
  buildRequestPath,
  clampRecvWindow,
  encodeRfc3986,
  expandPath,
  formatTimestamp,
  hmacSha256Base64,
  signRequest,
} from "./sign.ts";

const SECRET = "nightshift-test-secret";

/** HMAC via WebCrypto — an implementation independent of node:crypto's createHmac. */
async function webcryptoHmacBase64(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await webcrypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await webcrypto.subtle.sign("HMAC", key, enc.encode(message));
  return Buffer.from(sig).toString("base64");
}

describe("pre-hash construction (authentication.md worked examples)", () => {
  it("reproduces the documented GET pre-hash byte for byte", () => {
    // https://web3.binance.com/en/dev-docs/authentication.md — "Example (GET request)"
    const prehash = buildPrehash({
      timestamp: "2026-05-11T10:08:57.715Z",
      method: "GET",
      requestPath: "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT",
      body: "",
    });
    expect(prehash).toBe("2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT");
  });

  it("follows the documented POST formula (timestamp + METHOD + requestPath + raw body)", () => {
    const body = '{"chainId":1,"fromToken":"0xEEEE...","toToken":"0xA0b8...","amount":"1000000000000000000"}';
    const prehash = buildPrehash({ timestamp: "2026-05-11T10:08:57.715Z", method: "POST", requestPath: "/build/api/v1/dex/swap", body });
    expect(prehash).toBe(`2026-05-11T10:08:57.715ZPOST/build/api/v1/dex/swap${body}`);
  });

  it("signs the empty string as body for GET/HEAD even if a body is passed", () => {
    const a = buildPrehash({ timestamp: "t", method: "GET", requestPath: "/build/x", body: '{"ignored":true}' });
    expect(a).toBe("tGET/build/x");
    expect(buildPrehash({ timestamp: "t", method: "HEAD", requestPath: "/build/x", body: "zzz" })).toBe("tHEAD/build/x");
  });

  it("signs an empty POST body as the empty string (e.g. POST /market/token/basic-info, query-only)", () => {
    expect(buildPrehash({ timestamp: "t", method: "POST", requestPath: "/build/api/v1/dex/market/token/basic-info?binanceChainId=56" }))
      .toBe("tPOST/build/api/v1/dex/market/token/basic-info?binanceChainId=56");
  });

  it("upper-cases the method", () => {
    expect(buildPrehash({ timestamp: "t", method: "post", requestPath: "/build/a", body: "{}" })).toBe("tPOST/build/a{}");
  });

  it("refuses to sign a requestPath without the /build prefix (the documented #1 cause of 40102)", () => {
    expect(() => buildPrehash({ timestamp: "t", method: "GET", requestPath: "/api/v1/dex/market/price" })).toThrow(/build/);
  });
});

describe("HMAC-SHA256 / Base64 signature vectors", () => {
  // Expected values computed independently with `openssl dgst -sha256 -hmac nightshift-test-secret -binary | base64`.
  const vectors = [
    ["2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT", "0+uAFbFQjTyeOR11AjK3GKSIREIoh+q1oRp7LiVjQA0="],
    ['2026-05-11T10:08:57.715ZPOST/build/api/v2/b402/supported{"body":{}}', "zAki++S1fF/DPyQqMf8tb1SYllBdYD72HmSuba9kRFU="],
    [
      "2026-10-08T12:00:00.000ZGET/build/api/v1/dex/market/rwa/search?keyword=Nvidia%20%C3%A4%20%28ADR%29%21&platformId=bstock",
      "Iy8KyYC4t6wSCUvdXnlwzyfws3L4hfbUDLxt/DVyC4w=",
    ],
  ] as const;

  it.each(vectors)("matches the OpenSSL vector for %s", (prehash, expected) => {
    expect(hmacSha256Base64(prehash, SECRET)).toBe(expected);
  });

  it.each(vectors)("matches WebCrypto for %s", async (prehash) => {
    expect(hmacSha256Base64(prehash, SECRET)).toBe(await webcryptoHmacBase64(prehash, SECRET));
  });

  it("end-to-end: signRequest over a built path reproduces vector #3", () => {
    const query = buildQueryString({ keyword: "Nvidia ä (ADR)!", platformId: "bstock" });
    const requestPath = buildRequestPath("/api/v1/dex/market/rwa/search", query);
    const signed = signRequest({
      apiKey: "k",
      secretKey: SECRET,
      method: "GET",
      requestPath,
      timestampMs: Date.parse("2026-10-08T12:00:00.000Z"),
    });
    expect(signed.timestamp).toBe("2026-10-08T12:00:00.000Z");
    expect(signed.signature).toBe("Iy8KyYC4t6wSCUvdXnlwzyfws3L4hfbUDLxt/DVyC4w=");
    expect(signed.headers).toEqual({ "X-OC-APIKEY": "k", "X-OC-TIMESTAMP": "2026-10-08T12:00:00.000Z", "X-OC-SIGN": signed.signature });
  });
});

describe("query encoding", () => {
  it("encodes spaces as %20 (not +), like the documented example", () => {
    expect(buildQueryString({ chainId: 1, symbol: "ETH USDT" })).toBe("chainId=1&symbol=ETH%20USDT");
  });

  it("strictly encodes RFC 3986 reserved characters, including !'()*", () => {
    expect(encodeRfc3986("a b!'()*~-._")).toBe("a%20b%21%27%28%29%2A~-._");
    expect(buildQueryString({ q: "x&y=z/#?" })).toBe("q=x%26y%3Dz%2F%23%3F");
  });

  it("UTF-8 encodes non-ASCII", () => {
    expect(buildQueryString({ k: "ä€" })).toBe("k=%C3%A4%E2%82%AC");
  });

  it("joins arrays with commas (documented comma-separated lists) and keeps insertion order", () => {
    expect(buildQueryString({ binanceChainId: "56", tokenContractAddresses: ["0xa", "0xb"] })).toBe(
      "binanceChainId=56&tokenContractAddresses=0xa%2C0xb",
    );
  });

  it("skips undefined/null, stringifies booleans/numbers/bigints", () => {
    expect(buildQueryString({ a: undefined, b: null, c: true, d: 0, e: 10n ** 20n })).toBe("c=true&d=0&e=100000000000000000000");
    expect(buildQueryString({})).toBe("");
    expect(buildQueryString()).toBe("");
  });

  it("produces wire strings the WHATWG URL parser (used by fetch) leaves untouched", () => {
    const query = buildQueryString({ keyword: "it's (fine)* ok!", list: ["a,b", "c"], uni: "日本" });
    const requestPath = buildRequestPath("/api/v1/dex/market/rwa/search", query);
    const url = new URL(BASE_URL + requestPath);
    expect(url.pathname + url.search).toBe(requestPath);
    // Contrast: plain encodeURIComponent leaves `'`, which the URL parser re-encodes to %27 → signature mismatch.
    const naive = `/build/x?k=${encodeURIComponent("it's")}`;
    const reparsed = new URL(BASE_URL + naive);
    expect(reparsed.pathname + reparsed.search).not.toBe(naive);
  });
});

describe("paths and headers", () => {
  it("prefixes /build exactly once", () => {
    expect(buildRequestPath("/api/v1/dex/market/candles", "a=1")).toBe("/build/api/v1/dex/market/candles?a=1");
    expect(buildRequestPath("/build/api/v1/dex/market/candles")).toBe("/build/api/v1/dex/market/candles");
    expect(() => buildRequestPath("api/v1/x")).toThrow();
  });

  it("expands and encodes path parameters", () => {
    expect(expandPath("/api/v1/dex/aggregator/order/{orderId}", { orderId: "a b/c" })).toBe("/api/v1/dex/aggregator/order/a%20b%2Fc");
    expect(() => expandPath("/api/v1/dex/aggregator/order/{orderId}", {})).toThrow(/orderId/);
  });

  it("formats ISO-8601 timestamps with milliseconds", () => {
    expect(formatTimestamp(Date.UTC(2026, 4, 11, 10, 8, 57, 715))).toBe("2026-05-11T10:08:57.715Z");
  });

  it("clamps X-OC-RECV-WINDOW to the documented maximum and adds the optional nonce", () => {
    expect(clampRecvWindow(120_000)).toBe(60_000);
    expect(clampRecvWindow(-1)).toBe(5_000);
    const s = signRequest({ apiKey: "k", secretKey: "s", method: "GET", requestPath: "/build/a", timestampMs: 0, recvWindowMs: 90_000, nonce: "n-1" });
    expect(s.headers["X-OC-RECV-WINDOW"]).toBe("60000");
    expect(s.headers["X-OC-NONCE"]).toBe("n-1");
  });

  it("requires credentials", () => {
    expect(() => signRequest({ apiKey: "", secretKey: "s", method: "GET", requestPath: "/build/a", timestampMs: 0 })).toThrow(/apiKey/);
    expect(() => signRequest({ apiKey: "k", secretKey: "", method: "GET", requestPath: "/build/a", timestampMs: 0 })).toThrow(/secretKey/);
  });
});
