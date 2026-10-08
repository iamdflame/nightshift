/**
 * Documented example payloads must parse against the documented schemas with zero drift.
 * Sources: raw guide pages (*.md, verbatim) and the rendered API reference pages.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PaymentPayload, PaymentRequired, PaymentRequirements } from "./b402/types.ts";
import { detectDrift } from "./drift.ts";
import { documentedEnvelope, OcErrorEnvelope } from "./envelope.ts";
import { defiEndpoints } from "./endpoints/defi.ts";
import { marketEndpoints } from "./endpoints/market.ts";
import { rwaEndpoints } from "./endpoints/rwa.ts";
import * as Defi from "./schemas/defi.ts";

const envelope = (data: unknown) => ({ code: 0, msg: "success", data, timestamp: 1748601600000, success: true });

function expectClean(schema: z.ZodType, body: unknown) {
  const parsed = schema.safeParse(body);
  expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
  expect(detectDrift(schema, body)).toEqual({ undocumented: [], missing: [] });
}

const STATUS_CLOSED = { openState: false, marketStatus: "closed", reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend or Holiday", nextOpenTime: 1779111060000, nextCloseTime: null };

// catalog/web3-wallet/api/rest-api/rwa-data — response examples
const RWA_EXAMPLES: [keyof typeof rwaEndpoints, unknown][] = [
  ["platforms", [{ platformId: "ondo", tickerCount: 264, chainDistribution: [{ binanceChainId: "56", tokenCount: 264 }], website: "https://ondo.finance", logoUrl: "https://static.onchainos.com/images/protocols/ondo.png" }]],
  ["price", [{ binanceChainId: "56", tokenContractAddress: "0x8755c5c39b1aa9053a83ac731242a2cf4d04b0fe", platformId: "ondo", tokenPrice: "61.89", referencePrice: "61.746364", tokenPriceUpdatedAt: 1748000000000 }]],
  ["search", [{ ticker: "NVDA", companyName: "NVIDIA Corporation", assets: [{ platformId: "ondo", binanceChainId: "56", tokenContractAddress: "0xa9ee28c80f960b889dfbd1902055218cba016f75", tokenSymbol: "NVDAon", assetType: 1 }] }]],
  [
    "underlyingProfile",
    {
      binanceChainId: "56",
      tokenContractAddress: "0x8755c5c39b1aa9053a83ac731242a2cf4d04b0fe",
      platformId: "ondo",
      underlyingTicker: "SEDG",
      underlyingFullName: "SolarEdge Technologies, Inc.",
      assetType: 1,
      tokenToShareRatio: "1.003701",
      protections: {
        dailyAttestationReport: { supported: true, url: "https://static.onchainos.com/images/web3-data/public/token/ondo/pdf/daily-2026-06-08.pdf" },
        monthlyAttestationReport: { supported: true, url: "https://static.onchainos.com/images/web3-data/public/token/ondo/pdf/monthly-2026-05.pdf" },
      },
      companyInfo: { ceo: null, website: "https://www.solaredge.com", industry: "Technology", conceptsEn: [], conceptsCn: [], descriptionEn: "SolarEdge Technologies, Inc. is an energy technology company...", descriptionZh: "SolarEdge…" },
    },
  ],
  [
    "tokens",
    [
      {
        binanceChainId: "56",
        tokenContractAddress: "0x8755c5c39b1aa9053a83ac731242a2cf4d04b0fe",
        platformId: "ondo",
        assetType: 1,
        tokenName: "SolarEdge Technologies (Ondo Tokenized)",
        tokenSymbol: "SEDGon",
        tokenLogoUrl: "https://static.onchainos.com/images/web3-data/public/token/logos/7ac70d12b753405fb9ec408f1d1ab81e.png",
        decimals: "18",
        underlyingTicker: "SEDG",
        underlyingName: "SolarEdge Technologies",
        underlyingNameZh: "SolarEdge",
        tokenToShareRatio: "1.003701",
        tags: ["alpha"],
        statusInfo: STATUS_CLOSED,
        tokenPrice: "61.89",
        referencePrice: "61.746364",
        volume24H: "894138582.57",
        marketCap: "3055506468",
        peRatioTTM: "28.5",
      },
    ],
  ],
  [
    "underlyingMarket",
    {
      binanceChainId: "56",
      tokenContractAddress: "0x8755c5c39b1aa9053a83ac731242a2cf4d04b0fe",
      platformId: "ondo",
      assetType: 1,
      statusInfo: { openState: true, marketStatus: "regular", reasonCode: null, reasonMsg: null, nextOpenTime: null, nextCloseTime: 1779134340000 },
      marketData: {
        referencePrice: "61.746364",
        high52W: "63.53",
        low52W: "13.73",
        volumeShares24H: "14480829",
        avgDailyVolume1Y: "4243226",
        totalShares: "60818202",
        marketCap: "3055506468",
        turnoverRate: "23.81",
        amplitude: "3.05",
        peRatioTTM: "28.5",
        pbRatio: "7.15",
        dividendYield: "0.85",
        latestDividend: "0.25",
      },
    },
  ],
];

describe("RWA reference examples", () => {
  it.each(RWA_EXAMPLES)("%s", (name, data) => {
    expectClean(documentedEnvelope("oc", rwaEndpoints[name].data, true), envelope(data));
  });
});

// catalog/web3-wallet/api/rest-api/general-data — response examples
const MARKET_EXAMPLES: [keyof typeof marketEndpoints, unknown][] = [
  ["supportedChains", [{ binanceChainId: "1", name: "Ethereum", shortName: "ETH", logoUrl: "https://onchainos.bnbstatic.com/image/admin_mgs_image_upload/20250228/b549e557-76ca-4873-88ef-3a107cf2c9fe.png", caseSensitive: false, nativeTokenSymbol: "ETH", nativeTokenDecimals: 18 }]],
  ["price", [{ binanceChainId: "1", tokenContractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7", price: "1.0002", time: 1748601600000 }]],
  ["candles", [[1.0001, 1.0023, 0.9987, 1.001, 125000.5, 1748600000000, 42], [1.001, 1.0035, 1.0001, 1.0028, 187500.3, 1748600060000, 38]]],
  [
    "tokenSearch",
    [{ binanceChainId: "1", tokenName: "Tether USD", tokenSymbol: "USDT", tokenLogoUrl: "https://static.onchainos.com/tokens/usdt.png", tokenContractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6, explorerUrl: "https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7", change: "-5.23", holders: "45832", liquidity: "1250000.50", marketCap: "83500000.00", price: "1.0001", tagList: { isRecognized: true } }],
  ],
  [
    "basicInfo",
    { binanceChainId: "1", tokenContractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7", tokenName: "Tether USD", tokenSymbol: "USDT", tokenLogoUrl: "https://static.onchainos.com/tokens/usdt.png", decimals: 6, creatorAddress: "0x21a31ee1afc51d94c2efccaa2092ad1028285549", createTime: 1716892020000, tagList: { isRecognized: true } },
  ],
];

describe("Market reference examples", () => {
  it.each(MARKET_EXAMPLES)("%s", (name, data) => {
    expectClean(documentedEnvelope("oc", marketEndpoints[name].data, true), envelope(data));
  });
});

describe("DeFi guide examples (products/defi-api/integration-flow.md, verbatim)", () => {
  it("deposit build response", () => {
    const body = {
      code: 0,
      msg: "success",
      data: {
        dataList: [
          { callDataType: "APPROVE", from: "0x1234567890123456789012345678901234567890", to: "0xdac17f958d2ee523a2206206994597c13d831ec7", value: "0x0", data: "0x095ea7b3...", gasLimit: "50000", gasPrice: null, maxPriorityFeePerGas: "1000000000", maxFeePerGas: "3000000000" },
          { callDataType: "DEPOSIT", from: "0x1234567890123456789012345678901234567890", to: "0x87870Bca3F3fF67225794148012b73643B78Ed36", value: "0x0", data: "0xa9059cbb...", gasLimit: "200000", gasPrice: null, maxPriorityFeePerGas: "1000000000", maxFeePerGas: "3000000000" },
        ],
        preview: null,
      },
      timestamp: 1748601600000,
    };
    const schema = documentedEnvelope("oc", defiEndpoints.deposit.data, true);
    expect(schema.safeParse(body).success).toBe(false); // the documented example omits `success` …
    expect(detectDrift(schema, body)).toEqual({ undocumented: [], missing: ["data.redeemDelayDays", "success"] }); // … and redeemDelayDays
  });

  it("redeem preview", () => {
    const preview = {
      success: true,
      balanceChange: [
        { tokenType: "TOKEN", tokenSymbol: "aBUSD", tokenAddress: "0x6d8981847eb3cc2234179d0f0e72f6be6e0950a4", tokenDecimals: "18", amount: "-1000", valueUsd: "1000.00" },
        { tokenType: "TOKEN", tokenSymbol: "USDT", tokenAddress: "0x55d398326f99059fF775485246999027B3197955", tokenDecimals: "18", amount: "999.99", valueUsd: "999.99" },
      ],
      feeAndContract: {
        estimatedNetworkFee: { amount: "0.000003056787", tokenSymbol: "BNB", valueUsd: "0.002002", rentFeeAmount: null, rentFeeValueUsd: null, priorityFeeAmount: null },
        interactWith: { address: "0x0667eed0a0aab930af74a3dfedd263a73994f216" },
      },
      healthFactor: { before: "1.85", after: "1.35" },
      warnings: [{ code: "HEALTH_FACTOR_WARNING", level: "WARN", message: "Health factor will drop from 1.85 to 1.35 after this transaction." }],
    };
    expect(Defi.DefiTxPreview.safeParse(preview).success).toBe(true);
    expect(detectDrift(Defi.DefiTxPreview, preview).undocumented).toEqual([]);
  });
});

describe("envelopes and errors", () => {
  it("authentication.md error example and the observed gateway error both fit the error envelope", () => {
    expectClean(OcErrorEnvelope, { code: 40102, msg: "Invalid signature", data: null, timestamp: 1715420937000 });
    expectClean(OcErrorEnvelope, { data: "", msg: "API Key is required", timestamp: 1791459808063, code: 40101 });
  });

  it("introduction.md OCResult example", () => {
    expectClean(documentedEnvelope("oc", z.object({}).passthrough(), true), { code: 0, msg: "success", data: {}, timestamp: 1713500000000, success: true });
  });
});

describe("B402 guide examples (products/b402-api/integration-guide.md, verbatim)", () => {
  const exact = {
    scheme: "exact",
    network: "eip155:56",
    amount: "1000000",
    asset: "0x1111111111111111111111111111111111111111",
    payTo: "0x2222222222222222222222222222222222222222",
    maxTimeoutSeconds: 300,
    extra: { name: "Token Name", version: "1", assetTransferMethod: "eip3009", signerAddress: "0x3333333333333333333333333333333333333333" },
  };

  it("verify request body parses as x402 V2 PaymentPayload + PaymentRequirements", () => {
    const paymentPayload = {
      x402Version: 2,
      resource: { url: "https://merchant.example.com/weather", description: "Premium weather report", mimeType: "application/json" },
      accepted: exact,
      payload: { signature: "0x...", authorization: { from: "0x5555555555555555555555555555555555555555", to: "0x2222222222222222222222222222222222222222", value: "1000000", validAfter: "0", validBefore: "1780000000", nonce: "0x..." } },
    };
    expect(PaymentPayload.safeParse(paymentPayload).success).toBe(true);
    expect(PaymentRequirements.safeParse(exact).success).toBe(true);
  });

  it("the guide's HTTP 402 example is NOT a valid x402 V2 PaymentRequired: it lacks the required `resource`", () => {
    const example402 = {
      x402Version: 2,
      accepts: [{ ...exact, scheme: "upto", extra: { name: "Token Name", version: "1", assetTransferMethod: "permit2-upto", signerAddress: "0x3333333333333333333333333333333333333333", spenderAddress: "0x4444444444444444444444444444444444444444" } }],
    };
    const r = PaymentRequired.safeParse(example402);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["resource"]);
  });
});
