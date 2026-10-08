/**
 * Leave-one-gap-out comparison of NFV v2 (information provenance) vs v1 vs today's oracles.
 *   pnpm exec tsx packages/nfv/src/study-v2.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadUniverse } from "./data.ts";
import { crps } from "./dist.ts";
import { enumerateGaps } from "./gaps.ts";
import { type V2Row, V2_STATES, type V2State, fitV2, v2Mu, v2Predict, v2RowsAt } from "./provenance.ts";
import { lineChart } from "./svg.ts";

const LISTING = Date.UTC(2026, 5, 12);
const STEP_H = 2;
const NU = 4;
const u = loadUniverse();
const gaps = enumerateGaps(u.ref.get("SPY") ?? []).filter((g) => g.closeTime >= LISTING);

const rowsByGap = new Map<string, V2Row[]>();
for (const gap of gaps) {
  const rows: V2Row[] = [];
  for (let t = gap.closeTime + 3_600_000; t <= gap.openTime - 30 * 60_000; t += STEP_H * 3_600_000) rows.push(...v2RowsAt(u, gap, t));
  rows.push(...v2RowsAt(u, gap, gap.openTime - 30 * 60_000));
  if (rows.length) rowsByGap.set(gap.id, rows);
}
const all = [...rowsByGap.values()].flat();
const kindOf = new Map(gaps.map((g) => [g.id, g.kind]));
console.log(`gaps ${rowsByGap.size}, rows ${all.length}`);

/** CRPS-optimal scale for a baseline (stale or echo) on training rows, golden-section. */
function scaleFor(rows: V2Row[], mu: (r: V2Row) => number): number {
  const rs = rows.length > 6000 ? rows.filter((_, i) => i % Math.ceil(rows.length / 6000) === 0) : rows;
  const score = (c: number) => rs.reduce((s, r) => s + crps({ mu: mu(r), sigma: c * Math.max(0.004, r.v), nu: NU }, r.g!), 0);
  let lo = 0.05;
  let hi = 4;
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 28; i++) {
    const x1 = hi - phi * (hi - lo);
    const x2 = lo + phi * (hi - lo);
    if (score(x1) < score(x2)) hi = x2;
    else lo = x1;
  }
  return (lo + hi) / 2;
}

type Key = string;
const agg = new Map<Key, { n: number; stale: number; echo: number; v2: number; cov: number; width: number; mStale: number; mEcho: number; mV2: number }>();
const add = (k: Key, d: { stale: number; echo: number; v2: number; cov: number; width: number; mStale: number; mEcho: number; mV2: number }) => {
  const a = agg.get(k) ?? { n: 0, stale: 0, echo: 0, v2: 0, cov: 0, width: 0, mStale: 0, mEcho: 0, mV2: 0 };
  a.n++;
  for (const f of ["stale", "echo", "v2", "cov", "width", "mStale", "mEcho", "mV2"] as const) a[f] += d[f];
  agg.set(k, a);
};


for (const [gapId, rows] of rowsByGap) {
  const train = all.filter((r) => r.gapId !== gapId);
  const p = fitV2(train);
  // Fair comparison: every estimator's CRPS uses its own CRPS-optimal scale per state; calibration is scored separately (conformal coverage).
  const per = (mu: (r: V2Row, st: V2State) => number) => Object.fromEntries(V2_STATES.map((st) => [st, scaleFor(train.filter((r) => r.state === st), (r) => mu(r, st))])) as Record<V2State, number>;
  const sStale = per(() => 0);
  const sEcho = per((r) => r.r);
  const sV2 = per((r, st) => v2Mu(p.coef[st], r.x));
  const kind = kindOf.get(gapId)!;
  for (const r of rows) {
    const g = r.g!;
    const v = Math.max(0.004, r.v);
    const mu = v2Predict(p, r);
    const cz = p.conformal[r.state];
    const d = {
      stale: crps({ mu: 0, sigma: sStale[r.state] * v, nu: NU }, g),
      echo: crps({ mu: r.r, sigma: sEcho[r.state] * v, nu: NU }, g),
      v2: crps({ mu, sigma: sV2[r.state] * v, nu: NU }, g),
      cov: g >= mu + cz.z05 * v && g <= mu + cz.z95 * v ? 1 : 0,
      width: (cz.z95 - cz.z05) * v,
      mStale: Math.abs(g),
      mEcho: Math.abs(g - r.r),
      mV2: Math.abs(g - mu),
    };
    const hb = r.hoursToOpen <= 1 ? "≤1h" : r.hoursToOpen <= 6 ? "1-6h" : r.hoursToOpen <= 16 ? "6-16h" : r.hoursToOpen <= 40 ? "16-40h" : ">40h";
    for (const k of ["all", `${kind}`, `${kind}|${r.state}`, `${kind}|${r.state}|${hb}`, `${kind}|hb|${hb}`]) add(k, d);
  }
}

const final = fitV2(all);
const bp = (x: number) => (x * 1e4).toFixed(1);
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const lines = ["| Gaps × state | n | CRPS stale | CRPS echo | CRPS NFV-v2 | v2 vs stale | v2 vs echo | MAE stale / echo / v2 | 90% coverage | band width |", "|---|---|---|---|---|---|---|---|---|---|"];
for (const k of ["all", "weekend", "weekend|dark", "weekend|restart", "weekend|live", "holiday", "holiday|dark", "holiday|restart", "overnight"]) {
  const a = agg.get(k);
  if (!a) continue;
  lines.push(`| ${k} | ${a.n} | ${bp(a.stale / a.n)} | ${bp(a.echo / a.n)} | ${bp(a.v2 / a.n)} | ${pc(1 - a.v2 / a.stale)} | ${pc(1 - a.v2 / a.echo)} | ${bp(a.mStale / a.n)} / ${bp(a.mEcho / a.n)} / ${bp(a.mV2 / a.n)} | ${pc(a.cov / a.n)} | ${bp(a.width / a.n)} |`);
}
console.log(lines.join("\n"));
for (const st of V2_STATES) console.log(`final coef ${st} [f_post, e_post, f_dark, e_dark, f_restart, e_restart]:`, final.coef[st].map((c) => c.toFixed(3)).join(", "));
console.log("conformal:", JSON.stringify(final.conformal));

mkdirSync("research/out", { recursive: true });
mkdirSync("docs/figures", { recursive: true });
writeFileSync("packages/nfv/params/nfv-v2.json", JSON.stringify(final, null, 2));
writeFileSync("research/out/summary-v2.md", `${lines.join("\n")}\n\nfinal coef: ${JSON.stringify(final.coef)}\nconformal: ${JSON.stringify(final.conformal)}\n`);
writeFileSync("research/out/study-v2.json", JSON.stringify(Object.fromEntries([...agg].map(([k, a]) => [k, { n: a.n, crps_stale_bps: +bp(a.stale / a.n), crps_echo_bps: +bp(a.echo / a.n), crps_v2_bps: +bp(a.v2 / a.n), mae_stale_bps: +bp(a.mStale / a.n), mae_echo_bps: +bp(a.mEcho / a.n), mae_v2_bps: +bp(a.mV2 / a.n), cov90: +(a.cov / a.n).toFixed(4), band_bps: +bp(a.width / a.n) }])), null, 2));

const hbs = [">40h", "16-40h", "6-16h", "1-6h", "≤1h"];
const ser = (f: "stale" | "echo" | "v2") => hbs.map((h) => {
  const a = agg.get(`weekend|hb|${h}`);
  return a ? (a[f] / a.n) * 1e4 : Number.NaN;
});
writeFileSync(
  "docs/figures/weekend-crps.svg",
  lineChart({
    title: "Pricing the weekend: error forecasting Monday's open (CRPS, bps, out-of-sample)",
    xLabels: hbs.map((h) => `${h} to open`),
    series: [
      { name: "Stale oracle (Friday close)", values: ser("stale"), color: "#9aa0a6" },
      { name: "On-chain echo", values: ser("echo"), color: "#e8a33d" },
      { name: "Nightshift NFV", values: ser("v2"), color: "#3b82f6" },
    ],
    yLabel: "CRPS (bps)",
  }),
);
console.log("wrote packages/nfv/params/nfv-v2.json, research/out/summary-v2.md, docs/figures/weekend-crps.svg");

