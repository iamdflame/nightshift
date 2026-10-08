/**
 * Reference prices for the underlying US equities (Yahoo Finance chart API, public).
 * Used for: live reference during pre/regular/post sessions, and the historical
 * Friday-close / Monday-open anchors the weekend study is scored against.
 * Production would use a licensed feed; the source is recorded with every row.
 */
import { getJson, setHostSpacing } from "./http.ts";

setHostSpacing("query1.finance.yahoo.com", 350);

export interface ChartBar {
  ts: number; // bar start, epoch ms
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface ChartResult {
  symbol: string;
  regularMarketPrice: number | null;
  regularMarketTime: number | null; // epoch ms
  previousClose: number | null;
  bars: ChartBar[];
}

interface RawChart {
  chart: {
    result:
      | {
          meta: {
            symbol: string;
            regularMarketPrice?: number;
            regularMarketTime?: number;
            chartPreviousClose?: number;
            previousClose?: number;
          };
          timestamp?: number[];
          indicators: { quote: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
        }[]
      | null;
    error: unknown;
  };
}

/** Yahoo uses '-' where share-class tickers use '.', e.g. BRK.B → BRK-B. */
export const yahooSymbol = (ticker: string): string => ticker.replace(/\./g, "-");

export async function chart(ticker: string, interval: string, range: string, prePost = true): Promise<ChartResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(ticker))}?interval=${interval}&range=${range}&includePrePost=${prePost}`;
  let raw: RawChart;
  try {
    raw = await getJson<RawChart>(url, { retries: 2 });
  } catch {
    return null; // unknown/private tickers (pre-IPO names) simply have no public reference
  }
  const r = raw.chart.result?.[0];
  if (!r) return null;
  const q = r.indicators.quote[0] ?? {};
  const ts = r.timestamp ?? [];
  return {
    symbol: r.meta.symbol,
    regularMarketPrice: r.meta.regularMarketPrice ?? null,
    regularMarketTime: r.meta.regularMarketTime ? r.meta.regularMarketTime * 1000 : null,
    previousClose: r.meta.chartPreviousClose ?? r.meta.previousClose ?? null,
    bars: ts.map((t, i) => ({
      ts: t * 1000,
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null,
      volume: q.volume?.[i] ?? null,
    })),
  };
}
