/**
 * Live smoke test against the Binance Web3 API (needs BINANCE_WEB3_API_KEY / BINANCE_WEB3_SECRET_KEY,
 * read from the environment or the repo-root .env). Read-only: no swap is built, nothing is signed
 * on-chain. Every call is recorded to `dx_calls` (NIGHTSHIFT_DB or data/tape.sqlite) for the DER.
 *
 *   pnpm --filter @nightshift/sdk smoke            # live
 *   BINANCE_WEB3_MODE=record pnpm … smoke          # live + write fixtures
 *   BINANCE_WEB3_MODE=replay pnpm … smoke          # offline from fixtures
 *   flags: --no-db (skip SQLite), --strict (exit 1 when keys are missing)
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { BinanceWeb3Client, BinanceWeb3Error, MemorySink, resolveMode, SqliteTelemetrySink, type TelemetrySink } from "../src/index.ts";

for (const f of [resolve(import.meta.dirname, "../../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(f)) {
    process.loadEnvFile(f);
    break;
  }
}

const BSC = "56";
const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955"; // 18 decimals on BSC
const QUOTE_AMOUNT = "25000000000000000000"; // 25 USDT — above Ondo's documented $20 minimum

const mode = resolveMode();
const strict = process.argv.includes("--strict");
if (mode !== "replay" && !(process.env.BINANCE_WEB3_API_KEY && process.env.BINANCE_WEB3_SECRET_KEY)) {
  console.log("smoke: skipped — set BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY (or BINANCE_WEB3_MODE=replay).");
  process.exit(strict ? 1 : 0);
}

const memory = new MemorySink();
const sinks: TelemetrySink[] = [memory];
const db = process.argv.includes("--no-db") ? null : new SqliteTelemetrySink();
if (db) sinks.push(db);
const client = new BinanceWeb3Client({ telemetry: sinks, recvWindowMs: 10_000, mode });

const steps: [string, () => Promise<unknown>][] = [
  ["rwa.platforms", () => client.rwa.platforms()],
  ["rwa.tokens bstock/56", () => client.rwa.tokens({ binanceChainId: BSC, platformId: "bstock" })],
  ["rwa.price NVDAB", () => client.rwa.price({ binanceChainId: BSC, tokenContractAddresses: [NVDAB] })],
  ["rwa.underlyingMarket NVDAB", () => client.rwa.underlyingMarket({ binanceChainId: BSC, tokenContractAddress: NVDAB })],
  ["market.price NVDAB", () => client.market.price([{ binanceChainId: BSC, tokenContractAddress: NVDAB }])],
  ["market.candles NVDAB 1h", () => client.market.candleObjects({ binanceChainId: BSC, tokenContractAddress: NVDAB, bar: "1h", limit: 24 })],
  [
    "trading.quote USDT→NVDAB",
    () => client.trading.quote({ binanceChainId: BSC, amount: QUOTE_AMOUNT, fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, userWalletAddress: process.env.SMOKE_WALLET_ADDRESS }),
  ],
  ["transaction.blockHeight", () => client.transaction.blockHeight({ binanceChainId: BSC })],
  ["transaction.gasPrice", () => client.transaction.gasPrice({ binanceChainId: BSC })],
];

const summarizeData = (d: unknown): string => {
  if (Array.isArray(d)) return `${d.length} item(s)${d[0] ? ` e.g. ${JSON.stringify(d[0]).slice(0, 110)}` : ""}`;
  return JSON.stringify(d).slice(0, 140);
};

let fatal = false;
console.log(`smoke: mode=${mode}\n`);
for (const [name, run] of steps) {
  try {
    console.log(`✓ ${name}: ${summarizeData(await run())}`);
  } catch (e) {
    if (!(e instanceof BinanceWeb3Error)) throw e;
    if (["auth", "signature", "config", "permission", "redirect", "waf"].includes(e.kind)) fatal = true;
    console.log(`✗ ${name}: ${e.kind} ${e.apiCode ?? ""} ${e.codeName ?? ""} ${e.apiMessage ?? e.message}`);
  }
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
console.log(`\n${pad("endpoint", 48)} ${pad("http", 5)} ${pad("code", 10)} ${pad("ms", 8)} ${pad("retry", 5)} ${pad("+undoc", 6)} ${pad("-miss", 6)} requestId`);
for (const r of memory.records) {
  console.log(
    `${pad(`${r.method} ${r.endpoint.replace("/api/v1/dex/", "")}`, 48)} ${pad(String(r.httpStatus ?? "-"), 5)} ${pad(r.apiCode ?? "-", 10)} ${pad(r.latencyMs.toFixed(0), 8)} ${pad(String(r.retries), 5)} ${pad(String(r.undocumentedFields.length), 6)} ${pad(String(r.missingFields.length), 6)} ${r.requestId ?? ""}`,
  );
}
const drift = memory.records.filter((r) => r.undocumentedFields.length || r.missingFields.length || r.schemaIssues?.length);
if (drift.length) {
  console.log("\ndoc drift:");
  for (const r of drift) {
    console.log(`  ${r.endpoint}`);
    if (r.undocumentedFields.length) console.log(`    undocumented: ${r.undocumentedFields.join(", ")}`);
    if (r.missingFields.length) console.log(`    missing:      ${r.missingFields.join(", ")}`);
    if (r.schemaIssues?.length) console.log(`    type issues:  ${r.schemaIssues.join("; ")}`);
  }
}
console.log(`\nclock offset vs server: ${client.clock.offsetMs} ms${db ? ` · recorded to ${db.db.location() ?? "dx_calls"}` : ""}`);
db?.close();
process.exit(fatal ? 1 : 0);
