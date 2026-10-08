/**
 * NFV v2 — information provenance.
 *
 * Not all of a weekend token move is equal. The move since Friday's close is split by *when*
 * it happened, because what was trading underneath it differs:
 *   seg 1  post     close → end of the post-market session (the real stock still trades)
 *   seg 2  dark     end of post → restart of the overnight session (no US venue at all)
 *   seg 3  restart  overnight session restart → now (overnight + premarket venues live)
 * Each segment's cross-sectional factor and idiosyncratic part get their own trust weight:
 *     μ = Σ_k a_k·f_k + b_k·e_k
 * Weekday gaps have an empty dark segment, so they train the post/restart weights on thousands
 * of observations; weekends add the dark weights. The predictive band is split-conformal on
 * standardized residuals per information state, so its coverage is calibrated by construction.
 */
import { sessionAt, weightedMedian } from "@nightshift/core";
import type { Series, Universe } from "./data.ts";
import { type Gap, observations } from "./gaps.ts";
import { gapVolatility, stateAt } from "./model.ts";

/**
 * Information state at forecast time τ:
 *   dark     no US venue is trading (weekend/holiday dark segment)
 *   restart  venues are live again after a dark segment (Sunday-night overnight, Monday premarket)
 *   live     an ordinary weekday post/overnight/pre session
 */
export type V2State = "dark" | "restart" | "live";
export const V2_STATES: V2State[] = ["dark", "restart", "live"];

export const SEGMENTS = ["post", "dark", "restart"] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface V2Row {
  gapId: string;
  ticker: string;
  t: number;
  state: V2State;
  hoursToOpen: number;
  x: number[]; // [f1, e1, f2, e2, f3, e3]
  r: number; // total move (for the echo baseline)
  v: number;
  g: number | null;
}

export interface V2Params {
  version: "nfv-v2";
  /** Trust weights per information state, order of V2Row.x. What a segment means depends on what is known at τ. */
  coef: Record<V2State, number[]>;
  minVol: number;
  clip: number;
  conformal: Record<V2State, { z05: number; z95: number }>;
  fittedAt: string;
  sample: { gaps: number; rows: number };
}

/** Boundaries of the gap's segments: end of post-market, and restart of overnight trading. */
export function segmentBounds(gap: Gap): { postEnd: number; restart: number } {
  let postEnd = gap.closeTime;
  while (postEnd < gap.openTime && sessionAt(postEnd + 60_000) === "post") postEnd += 15 * 60_000;
  let restart = postEnd;
  while (restart < gap.openTime && sessionAt(restart + 60_000) === "closed") restart += 15 * 60_000;
  return { postEnd, restart };
}

const clipTo = (x: number, c: number) => Math.max(-c, Math.min(c, x));

export function v2RowsAt(u: Universe, gap: Gap, t: number, clip = 0.15): V2Row[] {
  const { postEnd, restart } = segmentBounds(gap);
  const obs = observations(u, gap);
  interface P {
    ticker: string;
    segs: [number, number, number];
    r: number;
    w: number;
    v: number;
    g: number;
  }
  const pts: P[] = [];
  for (const o of obs) {
    const s: Series = u.token.get(o.ticker)!;
    const base = o.basis * o.refClose;
    const pAt = (when: number) => s.priceAt(Math.min(t, when));
    const p1 = pAt(postEnd);
    const p2 = pAt(restart);
    const p3 = s.priceAt(t);
    if (p1 == null || p2 == null || p3 == null) continue;
    const refs = u.ref.get(o.ticker)!;
    const v = gapVolatility(refs, refs.findIndex((r) => r.date === gap.closeDate));
    if (!Number.isFinite(v)) continue;
    const r1 = clipTo(Math.log(p1 / base), clip);
    const r2 = clipTo(Math.log(p2 / p1), clip);
    const r3 = clipTo(Math.log(p3 / p2), clip);
    pts.push({ ticker: o.ticker, segs: [r1, r2, r3], r: clipTo(Math.log(p3 / base), clip), w: Math.sqrt(s.volumeBetween(gap.closeTime, t) + 1), v, g: Math.log(o.refOpen / o.refClose) });
  }
  if (pts.length < 10) return [];
  const w = pts.map((p) => p.w);
  const f = [0, 1, 2].map((k) => weightedMedian(pts.map((p) => p.segs[k]!), w));
  const base = stateAt(t);
  const state: V2State = base === "dark" ? "dark" : restart > postEnd && t >= restart ? "restart" : "live";
  return pts.map((p) => ({
    gapId: gap.id,
    ticker: p.ticker,
    t,
    state,
    hoursToOpen: (gap.openTime - t) / 3_600_000,
    x: [f[0]!, p.segs[0] - f[0]!, f[1]!, p.segs[1] - f[1]!, f[2]!, p.segs[2] - f[2]!],
    r: p.r,
    v: p.v,
    g: p.g,
  }));
}

/**
 * Ridge toward a prior: solve (XᵀX + λI) β = Xᵀy + λβ₀ by Gaussian elimination. The prior β₀ is
 * "trust the market" (all ones = the echo); λ sets how much evidence is needed to move off it.
 */
function ridge(X: number[][], y: number[], lambda: number, prior?: number[]): number[] {
  const k = X[0]!.length;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (let i = 0; i < X.length; i++) {
    const xi = X[i]!;
    for (let a = 0; a < k; a++) {
      A[a]![k]! += xi[a]! * y[i]!;
      for (let b = 0; b < k; b++) A[a]![b]! += xi[a]! * xi[b]!;
    }
  }
  for (let a = 0; a < k; a++) {
    A[a]![a]! += lambda;
    A[a]![k]! += lambda * (prior?.[a] ?? 0);
  }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    const d = A[c]![c]! || 1e-18;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const m = A[r]![c]! / d;
      for (let cc = c; cc <= k; cc++) A[r]![cc]! -= m * A[c]![cc]!;
    }
  }
  return A.map((row, i) => row[k]! / (row[i]! || 1e-18));
}

export const v2Mu = (coef: number[], x: number[]): number => x.reduce((s, xi, i) => s + xi * coef[i]!, 0);

export const v2Predict = (p: V2Params, row: Pick<V2Row, "state" | "x">): number => v2Mu(p.coef[row.state], row.x);

/** Prior strength per state as a fraction of the design's average diagonal (more data → prior matters less). */
export const PRIOR_KAPPA: Record<V2State, number> = {
  dark: Number(process.env.NFV_KAPPA_DARK ?? 0.02),
  restart: Number(process.env.NFV_KAPPA_RESTART ?? 2),
  live: Number(process.env.NFV_KAPPA_LIVE ?? 0.02),
};

export function fitV2(rows: V2Row[], opts: { minVol?: number; clip?: number; kappa?: Record<V2State, number> } = {}): V2Params {
  const minVol = opts.minVol ?? 0.004;
  const train = rows.filter((r) => r.g != null);
  const coef = {} as Record<V2State, number[]>;
  for (const st of V2_STATES) {
    const rs = train.filter((r) => r.state === st);
    // Weight rows by 1/v so volatile names (leveraged ETFs) don't dominate the trust estimates.
    const X = rs.map((r) => r.x.map((xi) => xi / Math.max(minVol, r.v)));
    const y = rs.map((r) => r.g! / Math.max(minVol, r.v));
    let diag = 0;
    for (const xi of X) for (const v of xi) diag += v * v;
    const lambda = ((opts.kappa ?? PRIOR_KAPPA)[st] * diag) / 6 + 1e-9;
    coef[st] = rs.length >= 30 ? ridge(X, y, lambda, [1, 1, 1, 1, 1, 1]).map((c) => Math.max(0, Math.min(1.2, c))) : [1, 1, 1, 1, 1, 1];
  }
  const conformal = {} as Record<V2State, { z05: number; z95: number }>;
  for (const st of V2_STATES) {
    const z = train
      .filter((r) => r.state === st)
      .map((r) => (r.g! - v2Mu(coef[st], r.x)) / Math.max(minVol, r.v))
      .sort((a, b) => a - b);
    const q = (p: number) => (z.length ? z[Math.min(z.length - 1, Math.max(0, Math.floor(p * (z.length - 1))))]! : p < 0.5 ? -1.645 : 1.645);
    conformal[st] = { z05: q(0.05), z95: q(0.95) };
  }
  return { version: "nfv-v2", coef, minVol, clip: opts.clip ?? 0.15, conformal, fittedAt: new Date().toISOString(), sample: { gaps: new Set(train.map((r) => r.gapId)).size, rows: train.length } };
}
