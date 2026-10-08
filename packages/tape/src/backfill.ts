/**
 * Historical backfill for the weekend study.
 *   - Binance spot 1h klines for every bStock since listing (24/7, includes every weekend)
 *   - 1h klines for the 24/7 macro factors (BTC, ETH, BNB, SOL, PAXG)
 *   - Yahoo daily bars (official open/close anchors) and 1h bars incl. pre/post for each underlying
 *
 *   pnpm backfill
 */
import { BSC } from "@nightshift/core";
import { chart, fetchRegistry, klines } from "@nightshift/feeds";
import { Tape } from "./db.ts";

const tape = new Tape();
const START = Date.UTC(2026, 4, 1); // 2026-05-01: before the first bStock listing (2026-06-11)
const MACRO = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "PAXGUSDT"];

async function main(): Promise<void> {
  const registry = await fetchRegistry();
  tape.upsertInstruments(registry);
  const bstocks = registry.filter((i) => i.issuer === "bstocks" && i.chainId === BSC && i.cexSymbol);
  const end = Date.now();

  let bars = 0;
  for (const [n, inst] of bstocks.entries()) {
    try {
      const rows = await klines(inst.cexSymbol!, "1h", START, end);
      tape.upsertKlines(inst.cexSymbol!, "1h", rows);
      bars += rows.length;
      if (n % 10 === 0) tape.log("info", "backfill", `klines ${n + 1}/${bstocks.length} ${inst.cexSymbol} (${rows.length} bars)`);
    } catch (e) {
      tape.log("warn", "backfill", `klines ${inst.cexSymbol}: ${(e as Error).message}`);
    }
  }
  for (const s of MACRO) {
    const rows = await klines(s, "1h", START, end);
    tape.upsertKlines(s, "1h", rows);
    bars += rows.length;
  }
  tape.log("info", "backfill", `klines done: ${bars} bars`);

  let refOk = 0;
  const tickers = [...new Set(bstocks.map((i) => i.ticker))];
  for (const t of tickers) {
    const daily = await chart(t, "1d", "1y", false);
    const hourly = await chart(t, "1h", "6mo", true);
    if (daily) tape.upsertRefBars(t, "1d", daily.bars, "yahoo-chart");
    if (hourly) tape.upsertRefBars(t, "1h", hourly.bars, "yahoo-chart");
    if (daily || hourly) refOk++;
    else tape.log("warn", "backfill", `no public reference for ${t} (likely pre-IPO/private)`);
  }
  tape.log("info", "backfill", `reference bars for ${refOk}/${tickers.length} tickers`);
}

void main().catch((e) => {
  tape.log("error", "backfill", (e as Error).stack ?? String(e));
  process.exitCode = 1;
});
