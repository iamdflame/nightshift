/**
 * A "gap" is the stretch from one regular-session close to the next regular-session open — the
 * hours a stale oracle cannot see. Weekend and holiday gaps contain a fully dark period (no
 * reference price at all); weekday gaps are covered by thin overnight/pre/post sessions.
 */
import { etParts, isTradingDay } from "@nightshift/core";
import type { DailyRef, Series, Universe } from "./data.ts";

export type GapKind = "weekend" | "holiday" | "overnight";

export interface Gap {
  id: string; // e.g. "2026-10-02>2026-10-05"
  kind: GapKind;
  closeTime: number;
  openTime: number;
  closeDate: string;
  openDate: string;
}

/** Enumerate gaps from the trading days present in a liquid benchmark's daily bars. */
export function enumerateGaps(benchmark: DailyRef[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 0; i + 1 < benchmark.length; i++) {
    const a = benchmark[i]!;
    const b = benchmark[i + 1]!;
    const days = Math.round((b.openTime - a.openTime) / 86_400_000);
    let kind: GapKind = "overnight";
    if (days > 1) {
      // Any skipped weekday is a holiday; otherwise the extra days are a weekend.
      let holiday = false;
      for (let t = a.openTime + 86_400_000; t < b.openTime - 3_600_000; t += 86_400_000) {
        const p = etParts(t);
        if (p.weekday >= 1 && p.weekday <= 5 && !isTradingDay(p.date, p.weekday)) holiday = true;
      }
      kind = holiday ? "holiday" : "weekend";
    }
    gaps.push({ id: `${a.date}>${b.date}`, kind, closeTime: a.closeTime, openTime: b.openTime, closeDate: a.date, openDate: b.date });
  }
  return gaps;
}

/**
 * Forecast instants inside a gap, measured back from the open:
 *   dark  = 19:00 ET the evening before the open (last fully dark hour on weekends)
 *   pre   = 09:00 ET on the open day (premarket and overnight information available)
 *   mid   = halfway between close and open
 */
export type Horizon = "mid" | "dark" | "pre";

export function forecastTime(gap: Gap, h: Horizon): number {
  if (h === "pre") return gap.openTime - 30 * 60_000;
  if (h === "dark") return gap.openTime - 14.5 * 3600_000;
  return Math.round((gap.closeTime + gap.openTime) / 2 / 3600_000) * 3600_000;
}

export interface GapObs {
  gap: Gap;
  ticker: string;
  refClose: number; // official close before the gap
  refOpen: number; // official open after the gap (the truth)
  basis: number; // token price / share price, measured at recent closes
  tokenAtClose: number;
  volumeInGap: number;
}

/**
 * Token/share basis: median over the last `n` closes of token price at the 16:00 ET close divided
 * by the official close. Captures the dividend multiplier and any structural issuer premium, and
 * rejects tickers whose public reference is a different security (pre-IPO ticker collisions).
 */
export function basisAt(series: Series, refs: DailyRef[], beforeIdx: number, n = 5): number | null {
  const ratios: number[] = [];
  for (let k = beforeIdx; k >= 0 && ratios.length < n; k--) {
    const r = refs[k]!;
    const p = series.priceAt(r.closeTime, 2 * 3600_000);
    if (p != null && r.close > 0) ratios.push(p / r.close);
  }
  if (ratios.length < Math.min(3, n)) return null;
  ratios.sort((a, b) => a - b);
  return ratios[ratios.length >> 1]!;
}

export function observations(u: Universe, gap: Gap): GapObs[] {
  const out: GapObs[] = [];
  for (const inst of u.instruments) {
    const series = u.token.get(inst.ticker);
    const refs = u.ref.get(inst.ticker);
    if (!series || !refs) continue;
    const ci = refs.findIndex((r) => r.date === gap.closeDate);
    const oi = refs.findIndex((r) => r.date === gap.openDate);
    if (ci < 0 || oi !== ci + 1) continue;
    const basis = basisAt(series, refs, ci);
    const tokenAtClose = series.priceAt(gap.closeTime, 2 * 3600_000);
    if (basis == null || tokenAtClose == null) continue;
    // Reject reference collisions: a real basis sits near the shares-per-token multiplier.
    if (Math.abs(basis / inst.multiplier - 1) > 0.03) continue;
    out.push({
      gap,
      ticker: inst.ticker,
      refClose: refs[ci]!.close,
      refOpen: refs[oi]!.open,
      basis,
      tokenAtClose,
      volumeInGap: series.volumeBetween(gap.closeTime, gap.openTime),
    });
  }
  return out;
}
