/**
 * Exploratory pass over every gap since bStocks listed: how well does each simple estimator
 * predict the official open?  `pnpm exec tsx packages/nfv/src/explore.ts`
 */
import { weightedMedian } from "@nightshift/core";
import { loadUniverse } from "./data.ts";
import { type GapKind, type Horizon, enumerateGaps, forecastTime, observations } from "./gaps.ts";

const u = loadUniverse();
const spy = u.ref.get("SPY") ?? [];
const gaps = enumerateGaps(spy).filter((g) => g.closeTime >= Date.UTC(2026, 5, 12));
const kinds = new Map<GapKind, number>();
for (const g of gaps) kinds.set(g.kind, (kinds.get(g.kind) ?? 0) + 1);
console.log(`gaps since listing: ${gaps.length}`, Object.fromEntries(kinds), `instruments: ${u.instruments.length}`);

interface Row {
  kind: GapKind;
  gapId: string;
  ticker: string;
  g: number; // log(open/close): the truth
  r: number; // on-chain log move vs close at the forecast time
  f: number; // cross-sectional factor at the forecast time
  vol: number;
}

function rowsFor(h: Horizon): Row[] {
  const rows: Row[] = [];
  for (const gap of gaps) {
    const t = forecastTime(gap, h);
    const obs = observations(u, gap);
    const pts: { ticker: string; g: number; r: number; vol: number }[] = [];
    for (const o of obs) {
      const p = u.token.get(o.ticker)!.priceAt(t);
      if (p == null) continue;
      pts.push({ ticker: o.ticker, g: Math.log(o.refOpen / o.refClose), r: Math.log(p / (o.basis * o.refClose)), vol: o.volumeInGap });
    }
    if (pts.length < 10) continue;
    const f = weightedMedian(pts.map((p) => p.r), pts.map((p) => Math.sqrt(p.vol + 1)));
    for (const p of pts) rows.push({ kind: gap.kind, gapId: gap.id, ...p, f });
  }
  return rows;
}

const bp = (x: number) => (x * 1e4).toFixed(1).padStart(7);
function stats(rows: Row[]) {
  const n = rows.length;
  const mae = (fn: (r: Row) => number) => rows.reduce((s, r) => s + Math.abs(r.g - fn(r)), 0) / n;
  // OLS of g on [f, r-f]
  let sff = 0, sfs = 0, sss = 0, sfg = 0, ssg = 0;
  for (const r of rows) {
    const s = r.r - r.f;
    sff += r.f * r.f; sfs += r.f * s; sss += s * s; sfg += r.f * r.g; ssg += s * r.g;
  }
  const det = sff * sss - sfs * sfs;
  const bf = (sfg * sss - ssg * sfs) / det;
  const bs = (ssg * sff - sfg * sfs) / det;
  return { n, gaps: new Set(rows.map((r) => r.gapId)).size, stale: mae(() => 0), naive: mae((r) => r.r), factorOnly: mae((r) => r.f), ols: mae((r) => bf * r.f + bs * (r.r - r.f)), bf, bs };
}

for (const h of ["mid", "dark", "pre"] as Horizon[]) {
  const rows = rowsFor(h);
  console.log(`\n=== horizon: ${h}`);
  console.log("kind       n    gaps   MAE bps: stale   naive  factor  ols(in-sample)   beta_f  beta_s");
  for (const k of ["weekend", "holiday", "overnight"] as GapKind[]) {
    const rs = rows.filter((r) => r.kind === k);
    if (rs.length === 0) continue;
    const s = stats(rs);
    console.log(`${k.padEnd(10)} ${String(s.n).padStart(5)} ${String(s.gaps).padStart(5)}        ${bp(s.stale)} ${bp(s.naive)} ${bp(s.factorOnly)} ${bp(s.ols)}          ${s.bf.toFixed(2).padStart(6)} ${s.bs.toFixed(2).padStart(6)}`);
  }
}
