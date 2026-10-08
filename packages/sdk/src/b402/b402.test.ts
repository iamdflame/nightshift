import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BinanceWeb3Client } from "../client.ts";
import { json, mockFetch } from "../testing.ts";
import { SqliteIdempotencyStore } from "./idempotency.ts";
import { B402Merchant, type Facilitator, type PriceSpec } from "./merchant.ts";
import { requirePayment, toNodeListener, type RequestLike } from "./http.ts";
import { decodeHeader, encodeHeader, type PaymentPayload, PaymentRequired, type PaymentRequirements, type SettleRequest, type VerifyRequest } from "./types.ts";

const PAY_TO = "0x2222222222222222222222222222222222222222";
const SIGNER = "0x3333333333333333333333333333333333333333";
const EXACT_PROXY = "0x4444444444444444444444444444444444444444";
const UPTO_PROXY = "0x6666666666666666666666666666666666666666";
const BUYER = "0x5555555555555555555555555555555555555555";
const USD1 = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d";
const URL_ = "https://nightshift.example/v1/fair-value/NVDAB";

const SUPPORTED = {
  kinds: [
    { x402Version: 2, scheme: "exact", network: "eip155:56", extra: { name: "USD1", version: "1", assetTransferMethod: "eip3009", signerAddress: SIGNER, futureField: "kept-verbatim" } },
    { x402Version: 2, scheme: "exact", network: "eip155:56", extra: { name: "Permit2", version: "1", assetTransferMethod: "permit2-exact", signerAddress: SIGNER, spenderAddress: EXACT_PROXY } },
    { x402Version: 2, scheme: "upto", network: "eip155:56", extra: { name: "Permit2", version: "1", assetTransferMethod: "permit2-upto", signerAddress: SIGNER, spenderAddress: UPTO_PROXY } },
  ],
  extensions: ["bazaar"],
  signers: { "eip155:*": [SIGNER] },
};

const PRICE: PriceSpec = { amount: "10000000000000000", asset: USD1 }; // 0.01 USD1 (18 decimals)

class FakeFacilitator implements Facilitator {
  verifies: VerifyRequest[] = [];
  settles: SettleRequest[] = [];
  verifyResult: { isValid: boolean; payer?: string; invalidReason?: string } = { isValid: true, payer: BUYER };
  settleResults: { success: boolean; transaction: string; network: string; payer?: string; errorReason?: string }[] = [];
  async supported() {
    return SUPPORTED;
  }
  async verify(body: VerifyRequest) {
    this.verifies.push(body);
    return this.verifyResult;
  }
  async settle(body: SettleRequest) {
    this.settles.push(body);
    return this.settleResults.shift() ?? { success: true, transaction: `0x${"ab".repeat(32)}`, network: "eip155:56", payer: BUYER };
  }
}

function eip3009Payload(req: PaymentRequirements, nonce = `0x${"01".repeat(32)}`): PaymentPayload {
  return {
    x402Version: 2,
    resource: { url: URL_, mimeType: "application/json" },
    accepted: req,
    payload: { signature: `0x${"aa".repeat(65)}`, authorization: { from: BUYER, to: req.payTo, value: req.amount, validAfter: "0", validBefore: "1999999999", nonce } },
  };
}

function permit2Payload(req: PaymentRequirements, spender: string, facilitator?: string): PaymentPayload {
  return {
    x402Version: 2,
    resource: { url: URL_ },
    accepted: req,
    payload: {
      signature: `0x${"bb".repeat(65)}`,
      permit2Authorization: { permitted: { token: req.asset, amount: req.amount }, from: BUYER, spender, nonce: "123456789", deadline: "1999999999", witness: { to: req.payTo, validAfter: "0", ...(facilitator ? { facilitator } : {}) } },
    },
  };
}

const request = (headers: Record<string, string> = {}): RequestLike => ({ method: "GET", url: "/v1/fair-value/NVDAB", headers: { host: "nightshift.example", ...headers } });
const paid = (p: PaymentPayload) => request({ "payment-signature": encodeHeader(p) });

function setup(prices: PriceSpec | PriceSpec[] = PRICE, settleAmount?: () => string) {
  const facilitator = new FakeFacilitator();
  const merchant = new B402Merchant({ facilitator, payTo: PAY_TO });
  let handled = 0;
  const gate = requirePayment(
    merchant,
    prices,
    () => {
      handled++;
      return { body: { fairValue: "181.40" } };
    },
    { publicBaseUrl: "https://nightshift.example", resource: { description: "Nightshift fair value" }, ...(settleAmount ? { settleAmount } : {}) },
  );
  return { facilitator, merchant, gate, handled: () => handled };
}

describe("402 Payment Required", () => {
  it("is built from /supported kinds — extra copied verbatim, never hardcoded — in header and body", async () => {
    const { gate } = setup();
    const r = await gate(request());
    expect(r.status).toBe(402);
    const header = PaymentRequired.parse(decodeHeader(r.headers["PAYMENT-REQUIRED"]!));
    expect(header).toEqual(r.body);
    expect(header.resource).toEqual({ url: URL_, description: "Nightshift fair value", mimeType: "application/json" });
    expect(header.accepts).toEqual([
      { scheme: "exact", network: "eip155:56", amount: PRICE.amount, asset: USD1, payTo: PAY_TO, maxTimeoutSeconds: 300, extra: SUPPORTED.kinds[0]!.extra },
    ]);
    expect(r.headers["Access-Control-Expose-Headers"]).toContain("PAYMENT-RESPONSE");
  });

  it("offers several methods at once and rejects x402 V1 X-PAYMENT", async () => {
    const { gate } = setup([PRICE, { ...PRICE, asset: "0x55d398326f99059fF775485246999027B3197955", method: "permit2-exact" }]);
    const r = await gate(request({ "x-payment": "e30=" }));
    const body = r.body as { accepts: PaymentRequirements[]; error: string };
    expect(body.accepts.map((a) => (a.extra as { assetTransferMethod: string }).assetTransferMethod)).toEqual(["eip3009", "permit2-exact"]);
    expect(body.error).toMatch(/V1 X-PAYMENT/);
  });

  it("fails closed (503) when no /supported kind matches the configured method", async () => {
    const { gate } = setup({ ...PRICE, network: "eip155:97" });
    expect((await gate(request())).status).toBe(503);
  });
});

describe("verify → settle", () => {
  it("settles a valid EIP-3009 payment, then delivers with PAYMENT-RESPONSE", async () => {
    const { gate, merchant, facilitator, handled } = setup();
    const req = await merchant.requirementsFor(PRICE);
    const payload = eip3009Payload(req);
    const r = await gate(paid(payload));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ fairValue: "181.40" });
    expect(decodeHeader(r.headers["PAYMENT-RESPONSE"]!)).toEqual({ success: true, transaction: `0x${"ab".repeat(32)}`, network: "eip155:56", payer: BUYER });
    // Both objects go to B402 unchanged.
    expect(facilitator.verifies[0]).toEqual({ x402Version: 2, paymentPayload: payload, paymentRequirements: req });
    expect(facilitator.settles[0]).toEqual({ x402Version: 2, paymentPayload: payload, paymentRequirements: req });
    expect(handled()).toBe(1);
  });

  it("rejects an `accepted` that differs from the server-held requirements (buyer lowered the amount)", async () => {
    const { gate, merchant, facilitator } = setup();
    const req = await merchant.requirementsFor(PRICE);
    const r = await gate(paid(eip3009Payload({ ...req, amount: "1" })));
    expect(r.status).toBe(402);
    expect((r.body as { error: string }).error).toMatch(/does not match/);
    expect(facilitator.verifies).toHaveLength(0);
  });

  it("treats EIP-55 case differences as the same address but extra-field tampering as a mismatch", async () => {
    const { merchant } = setup();
    const req = await merchant.requirementsFor(PRICE);
    expect(merchant.matchAccepted(eip3009Payload({ ...req, payTo: PAY_TO.toUpperCase().replace("0X", "0x") }), [req])).not.toBeNull();
    expect(merchant.matchAccepted(eip3009Payload({ ...req, extra: { ...req.extra, signerAddress: BUYER } }), [req])).toBeNull();
  });

  it("does not deliver twice for a replayed PAYMENT-SIGNATURE", async () => {
    const { gate, merchant, facilitator, handled } = setup();
    const p = eip3009Payload(await merchant.requirementsFor(PRICE));
    expect((await gate(paid(p))).status).toBe(200);
    const again = await gate(paid(p));
    expect(again.status).toBe(402);
    expect(decodeHeader(again.headers["PAYMENT-RESPONSE"]!)).toMatchObject({ success: false, errorReason: "invalid_transaction_state" });
    expect(facilitator.settles).toHaveLength(1);
    expect(handled()).toBe(1);
  });

  it("maps Verify isValid=false to 402 with the structured invalidReason; handler never runs", async () => {
    const { gate, merchant, facilitator, handled } = setup();
    facilitator.verifyResult = { isValid: false, invalidReason: "insufficient_funds", payer: BUYER };
    const r = await gate(paid(eip3009Payload(await merchant.requirementsFor(PRICE))));
    expect(r.status).toBe(402);
    expect(decodeHeader(r.headers["PAYMENT-RESPONSE"]!)).toMatchObject({ success: false, errorReason: "insufficient_funds", transaction: "" });
    expect(handled()).toBe(0);
    expect(facilitator.settles).toHaveLength(0);
  });

  it("settle success:false with a tx hash → reconcile; the same authorization can be retried safely", async () => {
    const { gate, merchant, facilitator } = setup();
    const p = eip3009Payload(await merchant.requirementsFor(PRICE));
    facilitator.settleResults.push({ success: false, transaction: "0xdead", network: "eip155:56", errorReason: "unexpected_settle_error" });
    const first = await gate(paid(p));
    expect(first.status).toBe(402);
    expect((await merchant.record(merchant.idempotencyKey(p)))?.state).toBe("reconcile");
    const second = await gate(paid(p));
    expect(second.status).toBe(200);
    expect(facilitator.settles).toHaveLength(2);
  });

  it("does not settle when the paid handler fails", async () => {
    const facilitator = new FakeFacilitator();
    const merchant = new B402Merchant({ facilitator, payTo: PAY_TO });
    const gate = requirePayment(merchant, PRICE, () => {
      throw new Error("boom");
    }, { publicBaseUrl: "https://nightshift.example" });
    const r = await gate(paid(eip3009Payload(await merchant.requirementsFor(PRICE))));
    expect(r.status).toBe(500);
    expect(facilitator.settles).toHaveLength(0);
  });

  it("permit2-upto: checks spender/facilitator binding and settles the metered amount", async () => {
    const upto: PriceSpec = { amount: "1000000000000000000", asset: USD1, method: "permit2-upto" };
    const { gate, merchant, facilitator } = setup(upto, () => "250000000000000000");
    const req = await merchant.requirementsFor(upto);
    expect((await gate(paid(permit2Payload(req, EXACT_PROXY, SIGNER)))).status).toBe(402); // wrong spender
    expect((await gate(paid(permit2Payload(req, UPTO_PROXY, BUYER)))).status).toBe(402); // wrong facilitator
    const r = await gate(paid(permit2Payload(req, UPTO_PROXY, SIGNER)));
    expect(r.status).toBe(200);
    expect(facilitator.settles[0]!.settleAmount).toBe("250000000000000000");
  });
});

describe("through the real client (HTTP mocked): envelope + signing", () => {
  it("drives /supported, /verify and /settle with {\"body\": …} envelopes and B402 success codes", async () => {
    const settled = { success: true, transaction: `0x${"cd".repeat(32)}`, payer: BUYER, network: "eip155:56", amount: PRICE.amount };
    const m = mockFetch(
      json({ status: "OK", code: "000000000", data: SUPPORTED }),
      json({ status: "OK", code: "000000000", data: { isValid: true, payer: BUYER } }),
      json({ status: "OK", code: "000000000", data: settled }),
    );
    const client = new BinanceWeb3Client({ apiKey: "k", secretKey: "s", mode: "live", fetch: m.fetch, rateLimit: false });
    const merchant = new B402Merchant({ facilitator: client.b402, payTo: PAY_TO });
    const gate = requirePayment(merchant, PRICE, () => ({ body: "ok" }), { publicBaseUrl: "https://nightshift.example" });
    const p = eip3009Payload(await merchant.requirementsFor(PRICE));
    const r = await gate(paid(p));
    expect(r.status).toBe(200);
    expect(m.requests.map((q) => new URL(q.url).pathname)).toEqual(["/build/api/v2/b402/supported", "/build/api/v2/b402/verify", "/build/api/v2/b402/settle"]);
    expect(JSON.parse(m.requests[2]!.body!)).toEqual({ body: { x402Version: 2, paymentPayload: p, paymentRequirements: p.accepted } });
  });

  it("serves a stale /supported cache when B402 is temporarily unreachable", async () => {
    let t = 0;
    const facilitator = new FakeFacilitator();
    const merchant = new B402Merchant({ facilitator, payTo: PAY_TO, supportedTtlMs: 1_000, now: () => t });
    await merchant.requirementsFor(PRICE);
    facilitator.supported = async () => {
      throw new Error("down");
    };
    t = 5_000;
    expect((await merchant.requirementsFor(PRICE)).extra).toEqual(SUPPORTED.kinds[0]!.extra);
  });
});

describe("node:http integration", () => {
  const facilitator = new FakeFacilitator();
  const merchant = new B402Merchant({ facilitator, payTo: PAY_TO });
  let base = "";
  const server = createServer(toNodeListener(requirePayment(merchant, PRICE, () => ({ body: { ok: true } }), { publicBaseUrl: "https://nightshift.example" })));
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("answers 402 with PAYMENT-REQUIRED, then 200 with PAYMENT-RESPONSE", async () => {
    const first = await fetch(`${base}/v1/fair-value/NVDAB`);
    expect(first.status).toBe(402);
    const required = PaymentRequired.parse(decodeHeader(first.headers.get("payment-required")!));
    const payload = eip3009Payload(required.accepts[0]!, `0x${"02".repeat(32)}`);
    const second = await fetch(`${base}/v1/fair-value/NVDAB`, { headers: { "PAYMENT-SIGNATURE": encodeHeader(payload) } });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true });
    expect(decodeHeader(second.headers.get("payment-response")!)).toMatchObject({ success: true });
  });
});

describe("SqliteIdempotencyStore", () => {
  it("persists settlement records keyed by authorization and indexed by tx hash", () => {
    const store = new SqliteIdempotencyStore(join(mkdtempSync(join(tmpdir(), "nightshift-b402-")), "tape.sqlite"));
    store.put({ key: "k1", state: "settling", updatedAt: 1 });
    store.put({ key: "k1", state: "settled", txHash: "0xABC", settlement: { success: true, transaction: "0xABC", network: "eip155:56" }, updatedAt: 2 });
    expect(store.get("k1")).toMatchObject({ state: "settled", txHash: "0xABC", settlement: { success: true } });
    expect(store.byTxHash("0xabc")?.key).toBe("k1");
    expect(store.get("missing")).toBeUndefined();
  });
});
