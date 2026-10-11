/**
 * Paid fair value over x402 V2, settled by Binance's B402 facilitator. Any x402 client pays per query; the
 * Binance Agentic Wallet does it with `baw x402-payment preview` → `sign` → replay. Revenue lands in the
 * Nightshift treasury, the wallet that pays for oracle gas and ERC-8183 jobs.
 *
 *   GET /x402/price                  free: status, price, accepted assets, payTo
 *   GET /x402/fair-value/:symbol     402 → pay → fair value, next-open band, every forecaster, Merkle proof
 *
 * Accepted assets are only those B402's `/supported` lists for this project (re-checked every 10 min), so the
 * 402 never advertises a payment the facilitator can't settle.
 */
import { readFileSync } from "node:fs";
import { BinanceWeb3Client, SqliteTelemetrySink } from "@nightshift/sdk";
import { B402Merchant, type PriceSpec, respond, requirePayment, SqliteIdempotencyStore } from "@nightshift/sdk/b402";
import type { FastifyInstance } from "fastify";
import type { Queries } from "./queries.ts";

// B402's /supported kinds name the token (extra.name) but carry no address, and several stablecoins share a
// method on BSC, so each price names its asset exactly as the facilitator does.
const ASSETS = [
  { symbol: "U", name: "United Stables", address: "0xcE24439F2D9C6a2289F741120FE202248B666666", method: "eip3009" },
  { symbol: "USD1", name: "World Liberty Financial USD", address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", method: "eip3009" },
  { symbol: "USDT", name: "Tether USD", address: "0x55d398326f99059fF775485246999027B3197955", method: "permit2-exact" },
] as const;
const DECIMALS = 18; // U, USD1 and USDT are all 18-decimal on BSC

/** "0.01" USD → atomic units at 18 decimals, exactly (no float rounding). */
export function usdToUnits(usd: string): string {
  const m = usd.match(/^(\d+)(?:\.(\d{1,18}))?$/);
  if (!m) throw new Error(`bad USD price ${usd}`);
  return (BigInt(m[1]!) * 10n ** BigInt(DECIMALS) + BigInt((m[2] ?? "").padEnd(DECIMALS, "0"))).toString();
}

function treasury(): string | undefined {
  try {
    return (JSON.parse(readFileSync("keys/roles.json", "utf8")) as Record<string, string>).treasury;
  } catch {
    return undefined;
  }
}

export async function registerX402(app: FastifyInstance, q: Queries): Promise<void> {
  const payTo = process.env.B402_PAY_TO ?? treasury();
  const usd = process.env.NIGHTSHIFT_X402_PRICE_USD ?? "0.01";
  const publicBaseUrl = process.env.NIGHTSHIFT_PUBLIC_URL?.replace(/\/+$/, "");
  let status = "disabled: needs BINANCE_WEB3_API_KEY with the B402 permission and a payTo address";
  let prices: PriceSpec[] = [];
  let merchant: B402Merchant | null = null;

  if (process.env.BINANCE_WEB3_API_KEY && payTo) {
    const client = new BinanceWeb3Client({ telemetry: [new SqliteTelemetrySink()] });
    merchant = new B402Merchant({ facilitator: client.b402, payTo, store: new SqliteIdempotencyStore() });
    const refresh = async () => {
      const ok: PriceSpec[] = [];
      let lastError = "";
      for (const a of ASSETS) {
        const p: PriceSpec = { amount: usdToUnits(usd), asset: a.address, assetName: a.name, method: a.method };
        try {
          await merchant!.requirementsFor(p);
          ok.push(p);
        } catch (e) {
          lastError = (e as Error).message.split("\n")[0]!;
        }
      }
      prices = ok;
      status = ok.length ? "live" : `B402 unavailable: ${lastError}`;
    };
    await refresh().catch((e) => (status = `B402 unavailable: ${(e as Error).message.split("\n")[0]}`));
    setInterval(() => void refresh().catch(() => undefined), 10 * 60_000).unref();
  }

  app.get("/x402/price", async () => ({
    status,
    protocol: "x402 v2 (facilitator: Binance B402)",
    priceUsd: usd,
    network: "eip155:56",
    payTo: payTo ?? null,
    accepts: prices.map((p) => ({ asset: p.asset, symbol: ASSETS.find((a) => a.address === p.asset)?.symbol, method: p.method, amount: p.amount })),
    resources: ["/x402/fair-value/{symbol}"],
    how: "GET the resource → 402 with PAYMENT-REQUIRED → `baw x402-payment preview --paymentRequirements <header>` → `baw x402-payment sign` → replay with PAYMENT-SIGNATURE",
  }));

  app.get<{ Params: { key: string } }>("/x402/fair-value/:key", async (req, reply) => {
    if (!merchant || !prices.length) return reply.code(503).send({ error: status });
    const r = q.fairValue(req.params.key);
    if (!r) return reply.code(404).send({ error: `no fair value for ${req.params.key}` }); // never charge for nothing
    const c = r.consensus;
    const gate = requirePayment(
      merchant,
      prices,
      async (_req, ctx) => ({
        body: {
          ...r,
          proof: { nfv: q.proof(c.round, "nfv", c.token) },
          paid: { payer: ctx.payer, amount: ctx.requirement.amount, asset: ctx.requirement.asset, facilitator: "Binance B402" },
        },
      }),
      { publicBaseUrl, resource: { description: `Nightshift fair value and next-open band for ${c.symbol}`, mimeType: "application/json" } },
    );
    return respond(reply, await gate(req));
  });
}
