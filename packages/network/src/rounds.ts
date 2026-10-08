/**
 * A round: every forecaster in the Night Shift prices every covered bStock, commits a Merkle root
 * of its forecasts, and the aggregator turns them into one consensus report per token.
 *
 * Consensus = reputation-weighted quantile averaging (Vincentization) in log-gap space, with
 * weights ∝ exp(−(CRPS_f − CRPS_best)/τ) from each forecaster's trailing live scores in the same
 * information state (backtest CRPS as the prior until enough live scores exist).
 */
import type { DatabaseSync } from "node:sqlite";
import { type ForecasterId, FORECASTERS, type LiveEngine, type LiveReport } from "@nightshift/nfv";
import { MerkleTree, leafHash, toE8 } from "./merkle.ts";
import { tx } from "./store.ts";

/** Out-of-sample backtest CRPS (bps) by information state — the reputation prior. */
export const PRIOR_CRPS: Record<string, Record<ForecasterId, number>> = {
  dark: { anchor: 169.1, echo: 166.7, nfv: 163.3 },
  restart: { anchor: 169.1, echo: 94.2, nfv: 94.6 },
  live: { anchor: 162.6, echo: 112.3, nfv: 112.0 },
  regular: { anchor: 1, echo: 1, nfv: 1 },
};
const TAU_BPS = 3;
const MIN_LIVE_SCORES = 200;

export const roundIdFor = (ms: number): number => Math.floor(ms / 60_000);

export interface RoundResult {
  round: number;
  session: string;
  state: string;
  tokens: number;
  roots: Record<string, string>;
  weights: Record<ForecasterId, number>;
}

/** Live reputation: mean CRPS per forecaster over recent scored forecasts in this state. */
export function reputationWeights(db: DatabaseSync, state: string): { weights: Record<ForecasterId, number>; source: "live" | "prior"; crps: Record<ForecasterId, number> } {
  const prior = PRIOR_CRPS[state] ?? PRIOR_CRPS.live!;
  const crps = { ...prior };
  let source: "live" | "prior" = "prior";
  const rows = db
    .prepare(`SELECT forecaster, AVG(crps) c, COUNT(*) n FROM (SELECT forecaster, crps FROM scores WHERE state = ? ORDER BY scored_at DESC LIMIT 20000) GROUP BY forecaster`)
    .all(state) as { forecaster: ForecasterId; c: number; n: number }[];
  if (rows.length === FORECASTERS.length && rows.every((r) => r.n >= MIN_LIVE_SCORES)) {
    for (const r of rows) crps[r.forecaster] = r.c * 1e4;
    source = "live";
  }
  const best = Math.min(...FORECASTERS.map((f) => crps[f]));
  const raw = Object.fromEntries(FORECASTERS.map((f) => [f, Math.exp(-(crps[f] - best) / TAU_BPS)])) as Record<ForecasterId, number>;
  const sum = FORECASTERS.reduce((s, f) => s + raw[f], 0);
  const weights = Object.fromEntries(FORECASTERS.map((f) => [f, raw[f] / sum])) as Record<ForecasterId, number>;
  return { weights, source, crps };
}

export function produceRound(engine: LiveEngine, db: DatabaseSync, now = Date.now()): RoundResult | null {
  const reports = engine.evaluate(now);
  if (reports.length === 0) return null;
  const round = roundIdFor(now);
  const first = reports[0]!;
  const state = first.state;
  const regular = state === "regular";
  const byForecaster = new Map<ForecasterId, LiveReport[]>();
  for (const r of reports) byForecaster.set(r.forecaster, [...(byForecaster.get(r.forecaster) ?? []), r]);
  const { weights } = reputationWeights(db, state);

  const roots: Record<string, string> = {};
  tx(db, () => {
    db.prepare(`INSERT OR REPLACE INTO rounds VALUES (?,?,?,?,?,?)`).run(round, now, first.session, state, first.anchorTime, byForecaster.get("nfv")?.length ?? 0);
    if (!regular) {
      // Forecasts and commitments only exist while the future (the next open) is unknown.
      const ins = db.prepare(`INSERT OR REPLACE INTO forecasts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const [f, list] of byForecaster) {
        const leaves = list.map((r) => {
          const leaf = leafHash({ round: BigInt(round), token: r.token as `0x${string}`, medianE8: toE8(r.fairValue), lowerE8: toE8(r.lower), upperE8: toE8(r.upper), anchorTime: BigInt(Math.floor(r.anchorTime / 1000)) });
          ins.run(round, f, r.token, r.symbol, r.ticker, r.state, r.anchorTime, r.lastClose, r.basis, r.tokenPrice, r.move, r.mu, r.sigma, r.nu, r.fairValue, r.lower, r.upper, r.flags, leaf);
          return leaf;
        });
        const tree = new MerkleTree(leaves);
        roots[f] = tree.root;
        db.prepare(`INSERT OR REPLACE INTO commitments (round, forecaster, root, count, anchor_time, created_at, chain_status) VALUES (?,?,?,?,?,?, 'local')`).run(round, f, tree.root, leaves.length, first.anchorTime, now);
      }
    }
    // Consensus per token: weighted quantile averaging in log space around the close.
    const tokens = new Map<string, Map<ForecasterId, LiveReport>>();
    for (const r of reports) tokens.set(r.token, (tokens.get(r.token) ?? new Map()).set(r.forecaster, r));
    const insC = db.prepare(`INSERT OR REPLACE INTO consensus (round, token, symbol, ticker, session, state, anchor_time, fair_value, lower, upper, flags, weights, computed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const [token, m] of tokens) {
      const any = m.values().next().value as LiveReport;
      const scale = any.lastClose * any.basis;
      let lo = 0;
      let mid = 0;
      let hi = 0;
      let flags = 0;
      for (const f of FORECASTERS) {
        const r = m.get(f);
        if (!r) continue;
        const w = weights[f];
        lo += w * Math.log(r.lower / scale);
        mid += w * Math.log(r.fairValue / scale);
        hi += w * Math.log(r.upper / scale);
        flags |= r.flags;
      }
      insC.run(round, token, any.symbol, any.ticker, any.session, any.state, any.anchorTime, scale * Math.exp(mid), scale * Math.exp(lo), scale * Math.exp(hi), flags, JSON.stringify(weights), now);
    }
  });
  return { round, session: first.session, state, tokens: byForecaster.get("nfv")?.length ?? 0, roots, weights };
}
