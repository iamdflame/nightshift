/**
 * The 24/7 collector. Runs every feed on its own cadence, never crashes on a feed error, and
 * tags every row with the US market session so dark-hours behavior can be studied directly.
 *
 *   pnpm collect
 */
import { BSC, type Instrument, sessionAt } from "@nightshift/core";
import { bookTickers, chart, depth, fetchRegistry, klines, poolsForTokens } from "@nightshift/feeds";
import { Tape } from "./db.ts";

const tape = new Tape();

/** Crypto majors and 24/7 macro proxies (gold) from the same CEX — the always-on factors. */
const MACRO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "PAXGUSDT"];

/** Names whose order-book depth we sample every minute (benchmarks, leveraged identities, crypto-equities). */
const DEPTH_TICKERS = [
  "NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "AVGO", "AMD", "TSM",
  "SPY", "QQQ", "SMH", "SOXL", "SOXS", "TQQQ", "COIN", "MSTR", "HOOD", "CRCL", "PLTR", "MU",
];

let registry: Instrument[] = [];
const bstocks = () => registry.filter((i) => i.issuer === "bstocks" && i.chainId === BSC && i.cexSymbol);
const bscTokens = () => registry.filter((i) => i.chainId === BSC);

async function refreshRegistry(): Promise<void> {
  const list = await fetchRegistry();
  tape.upsertInstruments(list);
  registry = list;
  const by = (iss: string) => list.filter((i) => i.issuer === iss && i.chainId === BSC).length;
  tape.log("info", "registry", `${list.length} instruments (BSC: bStocks ${by("bstocks")}, Ondo ${by("ondo")}, xStocks ${by("xstocks")})`);
}

async function collectBooks(): Promise<void> {
  const symbols = [...bstocks().map((i) => i.cexSymbol!), ...MACRO_SYMBOLS];
  const books = await bookTickers(symbols);
  tape.insertBooks(books, sessionAt(Date.now()));
}

async function collectDepth(): Promise<void> {
  const wanted = new Set(DEPTH_TICKERS);
  const session = sessionAt(Date.now());
  for (const inst of bstocks().filter((i) => wanted.has(i.ticker))) {
    try {
      tape.insertDepth(inst.cexSymbol!, await depth(inst.cexSymbol!), session);
    } catch (e) {
      tape.log("warn", "depth", `${inst.cexSymbol}: ${(e as Error).message}`);
    }
  }
}

async function collectPools(): Promise<void> {
  // bStocks plus every Ondo/xStocks token whose underlying also has a bStock — the cross-issuer set.
  const bTickers = new Set(bstocks().map((i) => i.ticker));
  const addrs = bscTokens().filter((i) => i.issuer === "bstocks" || bTickers.has(i.ticker)).map((i) => i.address);
  const pools = await poolsForTokens(addrs);
  tape.insertPools(pools, sessionAt(Date.now()));
}

async function collectReference(): Promise<void> {
  const session = sessionAt(Date.now());
  const tickers = [...new Set(bstocks().map((i) => i.ticker))];
  let ok = 0;
  for (const t of tickers) {
    const r = await chart(t, "1m", "1d", true);
    if (!r) continue;
    const last = [...r.bars].reverse().find((b) => b.close != null);
    tape.insertRef({
      ts: Date.now(),
      ticker: t,
      price: last?.close ?? null,
      priceTime: last?.ts ?? null,
      regularPrice: r.regularMarketPrice,
      regularTime: r.regularMarketTime,
      prevClose: r.previousClose,
      session,
      source: "yahoo-chart-1m",
    });
    ok++;
  }
  tape.log("info", "reference", `${ok}/${tickers.length} reference quotes (${session})`);
}

/** Official daily bars (the open/close anchors forecasts are scored against), kept current. */
async function collectDailyRefs(): Promise<void> {
  const tickers = [...new Set(bstocks().map((i) => i.ticker))];
  let ok = 0;
  for (const t of tickers) {
    const r = await chart(t, "1d", "5d", false);
    if (!r) continue;
    tape.upsertRefBars(t, "1d", r.bars, "yahoo-chart");
    ok++;
  }
  tape.log("info", "daily-refs", `${ok}/${tickers.length} tickers refreshed`);
}

async function collectRecentKlines(): Promise<void> {
  const end = Date.now();
  const start = end - 6 * 3600_000;
  for (const inst of bstocks()) {
    try {
      tape.upsertKlines(inst.cexSymbol!, "1h", await klines(inst.cexSymbol!, "1h", start, end));
    } catch (e) {
      tape.log("warn", "klines", `${inst.cexSymbol}: ${(e as Error).message}`);
    }
  }
  for (const s of MACRO_SYMBOLS) tape.upsertKlines(s, "1h", await klines(s, "1h", start, end));
}

/** Run `task` every `everyMs`, forever; failures are logged and retried on the next tick. */
function every(name: string, everyMs: number | (() => number), task: () => Promise<void>): void {
  let running = false;
  const tick = async () => {
    if (!running) {
      running = true;
      const t0 = Date.now();
      try {
        await task();
      } catch (e) {
        tape.log("error", name, (e as Error).stack ?? String(e));
      } finally {
        running = false;
        if (Date.now() - t0 > 60_000) tape.log("warn", name, `slow tick: ${Date.now() - t0} ms`);
      }
    }
    setTimeout(tick, typeof everyMs === "function" ? everyMs() : everyMs);
  };
  void tick();
}

async function main(): Promise<void> {
  tape.log("info", "collector", `starting; session=${sessionAt(Date.now())}`);
  await refreshRegistry();
  setTimeout(() => every("registry", 60 * 60_000, refreshRegistry), 60 * 60_000);
  every("books", 15_000, collectBooks);
  every("depth", 60_000, collectDepth);
  every("pools", 120_000, collectPools);
  // Reference prices move only while a US session is live; poll slowly in the dark hours.
  every("reference", () => (sessionAt(Date.now()) === "closed" ? 30 * 60_000 : 5 * 60_000), collectReference);
  every("klines", 5 * 60_000, collectRecentKlines);
  every("daily-refs", 20 * 60_000, collectDailyRefs);
}

process.on("unhandledRejection", (e) => tape.log("error", "process", `unhandled rejection: ${String(e)}`));
void main();
