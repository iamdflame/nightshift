/** Basis points of `x` relative to `ref` (positive = x above ref). */
export const bps = (x: number, ref: number): number => ((x - ref) / ref) * 10_000;

/** Price per underlying share given a token price and the token's shares-per-token multiplier. */
export const perShare = (tokenPrice: number, multiplier: number): number => tokenPrice / multiplier;

export const mid = (bid: number, ask: number): number => (bid + ask) / 2;

export function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Weighted median: robust to a minority of manipulated or stale observations. */
export function weightedMedian(values: number[], weights: number[]): number {
  const pairs = values.map((v, i) => [v, weights[i] ?? 0] as const).filter(([, w]) => w > 0);
  if (pairs.length === 0) return Number.NaN;
  pairs.sort((a, b) => a[0] - b[0]);
  const half = pairs.reduce((s, [, w]) => s + w, 0) / 2;
  let acc = 0;
  for (const [v, w] of pairs) {
    acc += w;
    if (acc >= half) return v;
  }
  return pairs[pairs.length - 1]![0];
}
