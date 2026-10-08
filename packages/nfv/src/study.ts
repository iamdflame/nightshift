/**
 * The weekend study: strict leave-one-gap-out evaluation of NFV v1 against the two oracles that
 * exist today — a stale reference (last official close) and a naive echo of the on-chain price —
 * over every gap since bStocks listed. Writes:
 *   research/out/study.json        full metrics by gap kind × information state × hours-to-open
 *   research/out/summary.md        the headline tables
 *   docs/figures/*.svg             charts for the whitepaper and README
 *   packages/nfv/params/nfv-v1.json  parameters fitted on all data — what the live oracle runs
 *
 *   pnpm exec tsx packages/nfv/src/study.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadUniverse } from "./data.ts";
import { crps, type Predictive, quantile } from "./dist.ts";
import { type Gap, type GapKind, enumerateGaps } from "./gaps.ts";
import { type NfvParams, type Row, conformalBand, fit, predict, predictNaive, predictStale, rowsAt } from "./model.ts";
import { lineChart } from "./svg.ts";

const LISTING = Date.UTC(2026, 5, 12);
const STEP_H = 2;
const ROW_OPTS = { robustHours: Number(process.env.NFV_ROBUST_H ?? 1), shrinkK: Number(process.env.NFV_SHRINK_K ?? 0) };
console.log("row options:", ROW_OPTS);

const u = loadUniverse();
const gaps = enumerateGaps(u.ref.get("SPY") ?? []).filter((g) => g.closeTime >= LISTING);

// Forecast grid: every STEP_H hours from 1h after the close to 30 min before the open.
const rowsByGap = new Map<string, Row[]>();
for (const gap of gaps) {
  const rows: Row[] = [];
  for (let t = gap.closeTime + 3_600_000; t <= gap.openTime - 30 * 60_000; t += STEP_H * 3_600_000) rows.push(...rowsAt(u, gap, t, ROW_OPTS));
  rows.push(...rowsAt(u, gap, gap.openTime - 30 * 60_000, ROW_OPTS));
  if (rows.length) rowsByGap.set(gap.id, rows);
}
const allRows = [...rowsByGap.values()].flat();
console.log(`gaps: ${rowsByGap.size}/${gaps.length}, rows: ${allRows.length}`);

interface Acc {
  n: number;
  maeStale: number;
  maeNaive: number;
  maeNfv: number;
  crpsStale: number;
  crpsNaive: number;
  crpsNfv: number;
  covStale: number;
  covNaive: number;
  covNfv: number;
  covConf: number;
  widthNfv: number;
  widthConf: number;
}
const acc = () => ({ n: 0, maeStale: 0, maeNaive: 0, maeNfv: 0, crpsStale: 0, crpsNaive: 0, crpsNfv: 0, covStale: 0, covNaive: 0, covNfv: 0, covConf: 0, widthNfv: 0, widthConf: 0 }) as Acc;
const buckets = new Map<string, Acc>();
const bucket = (k: string) => buckets.get(k) ?? (buckets.set(k, acc()), buckets.get(k)!);

const inBand = (p: Predictive, y: number) => y >= quantile(p, 0.05) && y <= quantile(p, 0.95);

// Strict out-of-sample: each gap is scored by parameters fitted on all *other* gaps.
const gapById = new Map<string, Gap>(gaps.map((g) => [g.id, g]));
let fold = 0;
for (const [gapId, rows] of rowsByGap) {
  const train = allRows.filter((r) => r.gapId !== gapId);
  const params = fit(train, { rowOptions: ROW_OPTS });
  const kind = gapById.get(gapId)!.kind;
  for (const r of rows) {
    const g = r.g!;
    const pS = predictStale(params, r);
    const pN = predictNaive(params, r);
    const pM = predict(params, r);
    const cb = conformalBand(params, r);
    const hb = r.hoursToOpen <= 1 ? "≤1h" : r.hoursToOpen <= 6 ? "1-6h" : r.hoursToOpen <= 16 ? "6-16h" : r.hoursToOpen <= 40 ? "16-40h" : ">40h";
    for (const key of [`${kind}|${r.state}|${hb}`, `${kind}|${r.state}|all`, `${kind}|all|all`, `all|${r.state}|all`, "all|all|all"]) {
      const a = bucket(key);
      a.n++;
      a.maeStale += Math.abs(g - pS.mu);
      a.maeNaive += Math.abs(g - pN.mu);
      a.maeNfv += Math.abs(g - pM.mu);
      a.crpsStale += crps(pS, g);
      a.crpsNaive += crps(pN, g);
      a.crpsNfv += crps(pM, g);
      a.covStale += inBand(pS, g) ? 1 : 0;
      a.covNaive += inBand(pN, g) ? 1 : 0;
      a.covNfv += inBand(pM, g) ? 1 : 0;
      a.widthNfv += quantile(pM, 0.95) - quantile(pM, 0.05);
      a.covConf += g >= cb.lo && g <= cb.hi ? 1 : 0;
      a.widthConf += cb.hi - cb.lo;
    }
  }
  if (++fold % 20 === 0) console.log(`fold ${fold}/${rowsByGap.size}`);
}

const fmt = (x: number) => (x * 1e4).toFixed(1);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const table: Record<string, Record<string, number | string>> = {};
for (const [k, a] of [...buckets].sort()) {
  table[k] = {
    n: a.n,
    mae_stale_bps: +fmt(a.maeStale / a.n),
    mae_naive_bps: +fmt(a.maeNaive / a.n),
    mae_nfv_bps: +fmt(a.maeNfv / a.n),
    crps_stale_bps: +fmt(a.crpsStale / a.n),
    crps_naive_bps: +fmt(a.crpsNaive / a.n),
    crps_nfv_bps: +fmt(a.crpsNfv / a.n),
    crps_gain_vs_stale: pct(1 - a.crpsNfv / a.crpsStale),
    crps_gain_vs_naive: pct(1 - a.crpsNfv / a.crpsNaive),
    cov90_stale: pct(a.covStale / a.n),
    cov90_naive: pct(a.covNaive / a.n),
    cov90_nfv: pct(a.covNfv / a.n),
    cov90_conformal: pct(a.covConf / a.n),
    band90_width_bps: +fmt(a.widthNfv / a.n),
    band90_conformal_width_bps: +fmt(a.widthConf / a.n),
  };
}

// Final parameters on all data: what the live oracle runs.
const finalParams: NfvParams = fit(allRows, { rowOptions: ROW_OPTS });
mkdirSync("research/out", { recursive: true });
mkdirSync("packages/nfv/params", { recursive: true });
mkdirSync("docs/figures", { recursive: true });
writeFileSync("research/out/study.json", JSON.stringify({ generatedAt: new Date().toISOString(), gaps: rowsByGap.size, rows: allRows.length, stepHours: STEP_H, table }, null, 2));
writeFileSync("packages/nfv/params/nfv-v1.json", JSON.stringify(finalParams, null, 2));

// Headline table (markdown)
const head = ["all|all|all", "weekend|all|all", "weekend|dark|all", "weekend|live|all", "holiday|all|all", "overnight|all|all"];
const lines = [
  "| Gaps × state | n | CRPS stale | CRPS on-chain echo | CRPS NFV | NFV vs stale | NFV vs echo | 90% coverage (parametric / conformal) | conformal band width (bps) |",
  "|---|---|---|---|---|---|---|---|---|",
  ...head.filter((k) => table[k]).map((k) => {
    const r = table[k]!;
    return `| ${k.replaceAll("|all", "").replace("all", "all gaps")} | ${r.n} | ${r.crps_stale_bps} | ${r.crps_naive_bps} | ${r.crps_nfv_bps} | ${r.crps_gain_vs_stale} | ${r.crps_gain_vs_naive} | ${r.cov90_nfv} / ${r.cov90_conformal} | ${r.band90_conformal_width_bps} |`;
  }),
];
writeFileSync("research/out/summary.md", `${lines.join("\n")}\n\nCRPS in bps of price (lower is better), strict leave-one-gap-out. Params: ${JSON.stringify(finalParams.states)}\n`);
console.log(lines.join("\n"));
console.log("final params:", JSON.stringify(finalParams.states), "baselines:", JSON.stringify(finalParams.baselines));

// Figure: CRPS vs hours-to-open on weekend gaps (the dark-hours story in one chart).
const hbs = [">40h", "16-40h", "6-16h", "1-6h", "≤1h"];
const series = (field: keyof Acc) =>
  hbs.map((hb) => {
    const ks = [`weekend|dark|${hb}`, `weekend|live|${hb}`].map((k) => buckets.get(k)).filter(Boolean) as Acc[];
    const n = ks.reduce((s, a) => s + a.n, 0);
    return n ? (ks.reduce((s, a) => s + (a[field] as number), 0) / n) * 1e4 : Number.NaN;
  });
writeFileSync(
  "docs/figures/weekend-crps.svg",
  lineChart({
    title: "Pricing the weekend: forecast error of Monday's open (CRPS, bps; lower is better)",
    xLabels: hbs.map((h) => `${h} to open`),
    series: [
      { name: "Stale oracle (Friday close)", values: series("crpsStale"), color: "#9aa0a6" },
      { name: "On-chain echo (token price)", values: series("crpsNaive"), color: "#e8a33d" },
      { name: "Nightshift NFV", values: series("crpsNfv"), color: "#3b82f6" },
    ],
    yLabel: "CRPS (bps)",
  }),
);
console.log("wrote research/out/study.json, research/out/summary.md, docs/figures/weekend-crps.svg, packages/nfv/params/nfv-v1.json");
