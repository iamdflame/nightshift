/**
 * NFV v1 — the Nightshift Fair Value model.
 *
 * For stock i in gap k at forecast time τ, the on-chain log move since the official close is
 *     r_i(τ) = ln( tokenPrice_i(τ) / (basis_i · close_i) )
 * Split it into the cross-sectional factor f(τ) (robust, volume-weighted median across stocks)
 * and the idiosyncratic part e_i = r_i − f. Weekend token markets are thin: coherent
 * market-wide moves carry information, single-name wiggles are mostly noise, and how much of
 * either to trust depends on whether any US session is live at τ. So the forecast of the gap
 *     g_i = ln(open_i / close_i)
 * is an empirical-Bayes shrinkage estimate with information-state-dependent weights:
 *     μ_i = a_S · f + b_S · e_i,      σ_i = c_S · v_i,      g_i ~ Student-t(ν, μ_i, σ_i)
 * where S ∈ {dark, live} is the session state at τ and v_i is the stock's own robust
 * historical gap volatility. (a, b, c) per state are fitted by least squares + CRPS
 * minimization; the study evaluates them strictly out-of-sample (leave one gap out).
 */
import { sessionAt, weightedMedian } from "@nightshift/core";
import type { DailyRef, Universe } from "./data.ts";
import { crps, type Predictive, quantile } from "./dist.ts";
import { type Gap, observations } from "./gaps.ts";

export type InfoState = "dark" | "live";

export const stateAt = (t: number): InfoState => (sessionAt(t) === "closed" ? "dark" : "live");

export interface StateParams {
  a: number; // weight on the cross-sectional factor
  b: number; // weight on the idiosyncratic on-chain move
  c: number; // predictive scale multiplier on historical gap volatility
  /** Split-conformal quantiles of standardized residuals (g − μ)/v: the calibrated 90% band. */
  z05: number;
  z95: number;
}

export interface NfvParams {
  version: "nfv-v1";
  nu: number; // Student-t degrees of freedom (fat tails: gaps jump)
  clip: number; // winsorize on-chain moves at ±clip (broken prints)
  minVol: number; // floor on per-stock gap volatility (log units)
  states: Record<InfoState, StateParams>;
  baselines: { staleC: number; naiveC: Record<InfoState, number> };
  /** Signal construction used at fit time; the live engine must use the same. */
  rowOptions: { robustHours: number; shrinkK: number };
  fittedAt: string;
  sample: { gaps: number; rows: number };
}

/** One forecastable observation: a stock inside a gap, seen at time t. */
export interface Row {
  gapId: string;
  ticker: string;
  t: number;
  state: InfoState;
  hoursToOpen: number;
  r: number; // on-chain move (clipped)
  f: number; // factor
  e: number; // idiosyncratic = r − f
  v: number; // historical gap volatility
  g: number | null; // truth (null when live / unknown)
}

/** Robust historical gap volatility: 1.4826 × MAD of ln(open/prevClose) over the prior `n` sessions. */
export function gapVolatility(refs: DailyRef[], beforeIdx: number, n = 60, floor = 0.004): number {
  const gs: number[] = [];
  for (let k = beforeIdx; k > 0 && gs.length < n; k--) {
    const prev = refs[k - 1]!;
    gs.push(Math.log(refs[k]!.open / prev.close));
  }
  if (gs.length < 10) return Number.NaN;
  const sorted = [...gs].sort((x, y) => x - y);
  const med = sorted[sorted.length >> 1]!;
  const dev = gs.map((x) => Math.abs(x - med)).sort((x, y) => x - y);
  return Math.max(floor, 1.4826 * dev[dev.length >> 1]!);
}

const clipTo = (x: number, c: number) => Math.max(-c, Math.min(c, x));

/** Build the rows for one gap at forecast time t (truth attached for backtesting). */
export interface RowOptions {
  clip?: number;
  /** Trailing-median window (hours) for the on-chain price. */
  robustHours?: number;
  /** James–Stein strength k: the factor is scaled by t²/(t²+k), t = factor / its robust std error. */
  shrinkK?: number;
}

export function rowsAt(u: Universe, gap: Gap, t: number, opts: RowOptions = {}): Row[] {
  const clip = opts.clip ?? 0.15;
  const robustHours = opts.robustHours ?? 3;
  const shrinkK = opts.shrinkK ?? 0;
  const obs = observations(u, gap);
  const pts: { ticker: string; r: number; w: number; v: number; g: number }[] = [];
  for (const o of obs) {
    const series = u.token.get(o.ticker)!;
    const p = robustHours > 1 ? series.robustPriceAt(t, robustHours) : series.priceAt(t);
    if (p == null) continue;
    const refs = u.ref.get(o.ticker)!;
    const ci = refs.findIndex((r) => r.date === gap.closeDate);
    const v = gapVolatility(refs, ci);
    if (!Number.isFinite(v)) continue;
    pts.push({
      ticker: o.ticker,
      r: clipTo(Math.log(p / (o.basis * o.refClose)), clip),
      w: Math.sqrt(series.volumeBetween(gap.closeTime, t) + 1),
      v,
      g: Math.log(o.refOpen / o.refClose),
    });
  }
  if (pts.length < 10) return [];
  const raw = weightedMedian(pts.map((p) => p.r), pts.map((p) => p.w));
  // Significance of the market-wide move: robust std error of the median across names.
  const dev = pts.map((p) => Math.abs(p.r - raw)).sort((x, y) => x - y);
  const se = (1.2533 * 1.4826 * dev[dev.length >> 1]!) / Math.sqrt(pts.length) || 1e-9;
  const tStat = raw / se;
  const f = shrinkK > 0 ? raw * ((tStat * tStat) / (tStat * tStat + shrinkK)) : raw;
  const state = stateAt(t);
  const hoursToOpen = (gap.openTime - t) / 3_600_000;
  return pts.map((p) => ({ gapId: gap.id, ticker: p.ticker, t, state, hoursToOpen, r: p.r, f, e: p.r - f, v: p.v, g: p.g }));
}

export function predict(params: NfvParams, row: Pick<Row, "state" | "f" | "e" | "v">): Predictive {
  const s = params.states[row.state];
  return { mu: s.a * row.f + s.b * row.e, sigma: s.c * Math.max(params.minVol, row.v), nu: params.nu };
}

export const predictStale = (params: NfvParams, row: Pick<Row, "v">): Predictive => ({
  mu: 0,
  sigma: params.baselines.staleC * Math.max(params.minVol, row.v),
  nu: params.nu,
});

export const predictNaive = (params: NfvParams, row: Pick<Row, "state" | "r" | "v">): Predictive => ({
  mu: row.r,
  sigma: params.baselines.naiveC[row.state] * Math.max(params.minVol, row.v),
  nu: params.nu,
});

/** Least squares for g ≈ a·f + b·e (no intercept: a fair forecast of a gap is unbiased). */
function fitWeights(rows: Row[]): { a: number; b: number } {
  let sff = 0;
  let sfe = 0;
  let see = 0;
  let sfg = 0;
  let seg = 0;
  for (const r of rows) {
    const g = r.g!;
    sff += r.f * r.f;
    sfe += r.f * r.e;
    see += r.e * r.e;
    sfg += r.f * g;
    seg += r.e * g;
  }
  const det = sff * see - sfe * sfe;
  if (!(Math.abs(det) > 1e-18)) return { a: 0, b: 0 };
  // Shrink toward [0, 1]: a weight outside this range would mean "anti-trust" or "over-trust" the market.
  const a = Math.max(0, Math.min(1.2, (sfg * see - seg * sfe) / det));
  const b = Math.max(0, Math.min(1.2, (seg * sff - sfg * sfe) / det));
  return { a, b };
}

/** Deterministic thinning so scale fits stay fast on large row sets. */
function thin<T>(xs: T[], max = 6000): T[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  return Array.from({ length: max }, (_, i) => xs[Math.floor(i * step)]!);
}

/** Scale multiplier minimizing mean CRPS (CRPS is unimodal in the scale: golden-section search). */
function fitScale(rows: Row[], mu: (r: Row) => number, nu: number, minVol: number): number {
  const rs = thin(rows);
  const score = (c: number) => {
    let s = 0;
    for (const r of rs) s += crps({ mu: mu(r), sigma: c * Math.max(minVol, r.v), nu }, r.g!);
    return s;
  };
  let lo = 0.05;
  let hi = 4;
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - phi * (hi - lo);
  let x2 = lo + phi * (hi - lo);
  let f1 = score(x1);
  let f2 = score(x2);
  for (let i = 0; i < 30; i++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - phi * (hi - lo);
      f1 = score(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + phi * (hi - lo);
      f2 = score(x2);
    }
  }
  return Number(((lo + hi) / 2).toFixed(3));
}

export function fit(rows: Row[], opts: { nu?: number; clip?: number; minVol?: number; rowOptions?: { robustHours: number; shrinkK: number } } = {}): NfvParams {
  const nu = opts.nu ?? 4;
  const clip = opts.clip ?? 0.15;
  const minVol = opts.minVol ?? 0.004;
  const states = {} as Record<InfoState, StateParams>;
  const naiveC = {} as Record<InfoState, number>;
  for (const st of ["dark", "live"] as InfoState[]) {
    const rs = rows.filter((r) => r.state === st && r.g != null);
    if (rs.length < 30) {
      states[st] = { a: 0, b: 0, c: 1, z05: -1.645, z95: 1.645 };
      naiveC[st] = 1;
      continue;
    }
    const { a, b } = fitWeights(rs);
    const z = rs.map((r) => (r.g! - (a * r.f + b * r.e)) / Math.max(minVol, r.v)).sort((x, y) => x - y);
    const q = (p: number) => z[Math.min(z.length - 1, Math.max(0, Math.floor(p * (z.length - 1))))]!;
    states[st] = { a, b, c: fitScale(rs, (r) => a * r.f + b * r.e, nu, minVol), z05: q(0.05), z95: q(0.95) };
    naiveC[st] = fitScale(rs, (r) => r.r, nu, minVol);
  }
  const all = rows.filter((r) => r.g != null);
  return {
    version: "nfv-v1",
    nu,
    clip,
    minVol,
    states,
    baselines: { staleC: fitScale(all, () => 0, nu, minVol), naiveC },
    rowOptions: opts.rowOptions ?? { robustHours: 1, shrinkK: 0 },
    fittedAt: new Date().toISOString(),
    sample: { gaps: new Set(all.map((r) => r.gapId)).size, rows: all.length },
  };
}

/**
 * Calibrated 90% band for the gap (log units): μ + v·[z05, z95] from split-conformal residual
 * quantiles. Unlike the CRPS-optimal parametric band, its coverage holds by construction on
 * exchangeable data — the property a lender actually needs.
 */
export function conformalBand(params: NfvParams, row: Pick<Row, "state" | "f" | "e" | "v">): { lo: number; mu: number; hi: number } {
  const s = params.states[row.state];
  const mu = s.a * row.f + s.b * row.e;
  const v = Math.max(params.minVol, row.v);
  return { lo: mu + s.z05 * v, mu, hi: mu + s.z95 * v };
}
