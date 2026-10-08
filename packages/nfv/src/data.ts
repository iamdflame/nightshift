/**
 * Loads the tape into in-memory series for the study and the live engine: hourly token prices
 * (24/7), official daily open/close of the underlying, and the 24/7 macro factors.
 */
import { DatabaseSync } from "node:sqlite";
import { BSC, type Instrument, etParts, etToUtc, isEarlyClose } from "@nightshift/core";
import { DEFAULT_DB_PATH } from "@nightshift/tape";

export interface HourBar {
  t: number; // open time (ms)
  close: number;
  quoteVolume: number;
}

export interface DailyRef {
  date: string; // ET trading date
  open: number;
  close: number;
  openTime: number; // 09:30 ET in UTC ms
  closeTime: number; // 16:00 ET (13:00 early close) in UTC ms
}

export class Series {
  /** Sorted hourly bars by open time. */
  constructor(readonly bars: HourBar[]) {}

  /** Close of the last bar that ended at or before `t` (i.e. the price prevailing at `t`). */
  priceAt(t: number, maxStaleMs = 3 * 3600_000): number | null {
    const i = this.lastIndexEndingBy(t);
    if (i < 0) return null;
    const bar = this.bars[i]!;
    return t - (bar.t + 3600_000) <= maxStaleMs ? bar.close : null;
  }

  /**
   * Robust price at `t`: median of the hourly closes that ended in (t − hours, t]. Thin weekend
   * books print noisy last trades; a short trailing median removes bid/ask bounce and one-off
   * prints without lagging a real move by more than a fraction of the window.
   */
  robustPriceAt(t: number, hours: number): number | null {
    const end = this.lastIndexEndingBy(t);
    if (end < 0) return null;
    const closes: number[] = [];
    for (let i = end; i >= 0 && this.bars[i]!.t + 3600_000 > t - hours * 3600_000; i--) closes.push(this.bars[i]!.close);
    if (closes.length === 0) return null;
    if (t - (this.bars[end]!.t + 3600_000) > 3 * 3600_000) return null;
    closes.sort((a, b) => a - b);
    const m = closes.length >> 1;
    return closes.length % 2 ? closes[m]! : (closes[m - 1]! + closes[m]!) / 2;
  }

  /** Quote volume traded in (from, to]. */
  volumeBetween(from: number, to: number): number {
    let v = 0;
    for (const b of this.bars) if (b.t >= from && b.t + 3600_000 <= to) v += b.quoteVolume;
    return v;
  }

  private lastIndexEndingBy(t: number): number {
    let lo = 0;
    let hi = this.bars.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (this.bars[m]!.t + 3600_000 <= t) {
        ans = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    return ans;
  }
}

export interface Universe {
  instruments: Instrument[]; // bStocks with a CEX market
  token: Map<string, Series>; // ticker → hourly token price series (per token)
  ref: Map<string, DailyRef[]>; // ticker → official daily bars (sorted)
  macro: Map<string, Series>; // BTCUSDT, ETHUSDT, …
}

export function loadUniverse(dbPath = DEFAULT_DB_PATH): Universe {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const instruments = (
    db.prepare(`SELECT * FROM instruments WHERE issuer='bstocks' AND chain_id=? AND cex_symbol IS NOT NULL`).all(BSC) as Record<string, unknown>[]
  ).map((r) => ({
    issuer: "bstocks" as const,
    chainId: r.chain_id as string,
    address: r.address as string,
    symbol: r.symbol as string,
    ticker: r.ticker as string,
    assetType: r.asset_type as Instrument["assetType"],
    multiplier: r.multiplier as number,
    decimals: r.decimals as number,
    cexSymbol: r.cex_symbol as string,
    updatedAt: (r.updated_at as number | null) ?? null,
  }));

  const klineStmt = db.prepare(`SELECT open_time, close, quote_volume FROM klines WHERE symbol=? AND interval='1h' ORDER BY open_time`);
  const series = (symbol: string) =>
    new Series((klineStmt.all(symbol) as { open_time: number; close: number; quote_volume: number }[]).map((r) => ({ t: r.open_time, close: r.close, quoteVolume: r.quote_volume })));

  const token = new Map<string, Series>();
  for (const i of instruments) token.set(i.ticker, series(i.cexSymbol!));

  const refStmt = db.prepare(`SELECT ts, open, close FROM ref_bars WHERE ticker=? AND interval='1d' ORDER BY ts`);
  const ref = new Map<string, DailyRef[]>();
  for (const i of instruments) {
    const rows = refStmt.all(i.ticker) as { ts: number; open: number | null; close: number | null }[];
    const bars: DailyRef[] = [];
    for (const r of rows) {
      if (r.open == null || r.close == null || !(r.open > 0) || !(r.close > 0)) continue;
      const date = etParts(r.ts).date;
      bars.push({ date, open: r.open, close: r.close, openTime: etToUtc(date, 9 * 60 + 30), closeTime: etToUtc(date, isEarlyClose(date) ? 13 * 60 : 16 * 60) });
    }
    ref.set(i.ticker, bars);
  }

  const macro = new Map<string, Series>();
  for (const s of ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "PAXGUSDT"]) macro.set(s, series(s));
  db.close();
  return { instruments, token, ref, macro };
}
