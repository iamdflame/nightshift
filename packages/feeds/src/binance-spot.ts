/**
 * Binance spot public market data. Every bStock also trades here as `<SYMBOL>USDT`, 24/7, on a
 * deep order book — the single best live signal for what a tokenized stock is worth while the
 * US market is closed. Crypto majors from the same venue give the 24/7 crypto factor.
 */
import type { TopOfBook } from "@nightshift/core";
import { getJson, setHostSpacing } from "./http.ts";

const BASE = "https://api.binance.com";
setHostSpacing("api.binance.com", 120);

interface RawBook {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
}

/** Top of book for many symbols in one request (chunked to keep request weight low). */
export async function bookTickers(symbols: string[]): Promise<Map<string, TopOfBook>> {
  const out = new Map<string, TopOfBook>();
  for (let i = 0; i < symbols.length; i += 100) {
    const chunk = symbols.slice(i, i + 100);
    const url = `${BASE}/api/v3/ticker/bookTicker?symbols=${encodeURIComponent(JSON.stringify(chunk))}`;
    const ts = Date.now();
    const rows = await getJson<RawBook[]>(url);
    for (const r of rows) {
      out.set(r.symbol, {
        ts,
        bid: Number(r.bidPrice),
        ask: Number(r.askPrice),
        bidQty: Number(r.bidQty),
        askQty: Number(r.askQty),
      });
    }
  }
  return out;
}

export interface DepthSummary {
  ts: number;
  bid: number;
  ask: number;
  /** USD notional resting within ±50 bps of mid on each side — how much size the book can absorb. */
  bidUsd50: number;
  askUsd50: number;
  /** Volume-weighted mid using the top levels (robust to a single dust order). */
  microMid: number;
}

export async function depth(symbol: string, limit = 50): Promise<DepthSummary> {
  const ts = Date.now();
  const d = await getJson<{ bids: [string, string][]; asks: [string, string][] }>(
    `${BASE}/api/v3/depth?symbol=${symbol}&limit=${limit}`,
  );
  const bids = d.bids.map(([p, q]) => [Number(p), Number(q)] as const);
  const asks = d.asks.map(([p, q]) => [Number(p), Number(q)] as const);
  const bid = bids[0]?.[0] ?? Number.NaN;
  const ask = asks[0]?.[0] ?? Number.NaN;
  const m = (bid + ask) / 2;
  const within = (lv: readonly (readonly [number, number])[], lo: number, hi: number) =>
    lv.filter(([p]) => p >= lo && p <= hi).reduce((s, [p, q]) => s + p * q, 0);
  const top = (lv: readonly (readonly [number, number])[]) => lv.slice(0, 5).reduce((s, [, q]) => s + q, 0);
  const bq = top(bids);
  const aq = top(asks);
  // Micro-price: weights each side by the opposite side's resting size.
  const microMid = bq + aq > 0 ? (bid * aq + ask * bq) / (aq + bq) : m;
  return {
    ts,
    bid,
    ask,
    bidUsd50: within(bids, m * (1 - 0.005), m),
    askUsd50: within(asks, m, m * (1 + 0.005)),
    microMid,
  };
}

export type Kline = [
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  closeTime: number,
  quoteVolume: number,
  trades: number,
];

/** Paginated klines between [startMs, endMs). */
export async function klines(symbol: string, interval: string, startMs: number, endMs: number): Promise<Kline[]> {
  const out: Kline[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const url = `${BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${endMs - 1}&limit=1000`;
    const rows = await getJson<unknown[][]>(url);
    if (rows.length === 0) break;
    for (const r of rows) {
      out.push([
        Number(r[0]),
        Number(r[1]),
        Number(r[2]),
        Number(r[3]),
        Number(r[4]),
        Number(r[5]),
        Number(r[6]),
        Number(r[7]),
        Number(r[8]),
      ]);
    }
    const last = Number(rows[rows.length - 1]![0]);
    if (last + 1 <= cursor) break;
    cursor = last + 1;
    if (rows.length < 1000) break;
  }
  return out;
}
