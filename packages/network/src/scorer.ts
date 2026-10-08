/**
 * The Scorer: once the market opens, every committed forecast is graded against the official
 * open with CRPS (and absolute error, and whether the 90% band covered it). These scores are the
 * reputation the aggregator weights by, and what ERC-8004 feedback / ERC-8183 settlement attest.
 */
import type { DatabaseSync } from "node:sqlite";
import { etParts } from "@nightshift/core";
import { crps } from "@nightshift/nfv";
import { tx } from "./store.ts";

export interface ScoreSummary {
  anchorTime: number;
  forecaster: string;
  n: number;
  meanCrpsBps: number;
  maeBps: number;
  coverage: number;
}

interface ForecastRow {
  round: number;
  forecaster: string;
  token: string;
  ticker: string;
  state: string;
  last_close: number;
  basis: number;
  mu: number;
  sigma: number;
  nu: number;
  lower: number;
  upper: number;
  round_ts: number;
}

/** Official open per ticker for an ET trading date (from the tape's daily bars). */
function opensFor(db: DatabaseSync, etDate: string): Map<string, number> {
  const out = new Map<string, number>();
  const rows = db.prepare(`SELECT ticker, ts, open FROM ref_bars WHERE interval='1d' AND ts BETWEEN ? AND ?`).all(Date.parse(`${etDate}T00:00:00Z`), Date.parse(`${etDate}T23:59:59Z`)) as { ticker: string; ts: number; open: number | null }[];
  for (const r of rows) if (r.open && r.open > 0 && etParts(r.ts).date === etDate) out.set(r.ticker, r.open);
  return out;
}

/** Score every forecast whose anchor (market open) has passed and whose official open is known. */
export function scorePending(db: DatabaseSync, now = Date.now()): ScoreSummary[] {
  const anchors = db
    .prepare(`SELECT DISTINCT f.anchor_time a FROM forecasts f LEFT JOIN scores s ON s.round=f.round AND s.forecaster=f.forecaster AND s.token=f.token WHERE s.round IS NULL AND f.anchor_time <= ?`)
    .all(now - 2 * 60_000) as { a: number }[];
  const summaries: ScoreSummary[] = [];
  for (const { a } of anchors) {
    const opens = opensFor(db, etParts(a).date);
    if (opens.size === 0) continue; // official opens not published yet; try again next pass
    const pending = db
      .prepare(`SELECT f.* , r.ts AS round_ts FROM forecasts f JOIN rounds r ON r.round=f.round LEFT JOIN scores s ON s.round=f.round AND s.forecaster=f.forecaster AND s.token=f.token WHERE s.round IS NULL AND f.anchor_time = ?`)
      .all(a) as unknown as ForecastRow[];
    const ins = db.prepare(`INSERT OR REPLACE INTO scores VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const agg = new Map<string, { n: number; c: number; e: number; cov: number }>();
    tx(db, () => {
      for (const f of pending) {
        const open = opens.get(f.ticker);
        if (!open) continue;
        const g = Math.log(open / f.last_close);
        const scale = f.last_close * f.basis;
        const lo = Math.log(f.lower / scale);
        const hi = Math.log(f.upper / scale);
        const c = crps({ mu: f.mu, sigma: Math.max(1e-6, f.sigma), nu: f.nu }, g);
        const e = Math.abs(g - f.mu);
        const covered = g >= lo && g <= hi ? 1 : 0;
        ins.run(f.round, f.forecaster, f.token, f.ticker, f.state, a, (a - f.round_ts) / 3_600_000, open, g, c, e, covered, now);
        const k = f.forecaster;
        const s = agg.get(k) ?? { n: 0, c: 0, e: 0, cov: 0 };
        s.n++;
        s.c += c;
        s.e += e;
        s.cov += covered;
        agg.set(k, s);
      }
    });
    for (const [forecaster, s] of agg) summaries.push({ anchorTime: a, forecaster, n: s.n, meanCrpsBps: (s.c / s.n) * 1e4, maeBps: (s.e / s.n) * 1e4, coverage: s.cov / s.n });
  }
  return summaries;
}

/** The public scoreboard: every forecaster's live record, overall and per information state. */
export function scoreboard(db: DatabaseSync): { forecaster: string; state: string; n: number; anchors: number; crps_bps: number; mae_bps: number; coverage: number }[] {
  return (
    db
      .prepare(
        `SELECT forecaster, state, COUNT(*) n, COUNT(DISTINCT anchor_time) anchors, AVG(crps)*1e4 crps_bps, AVG(abs_err)*1e4 mae_bps, AVG(covered) coverage
         FROM scores GROUP BY forecaster, state
         UNION ALL
         SELECT forecaster, 'all', COUNT(*), COUNT(DISTINCT anchor_time), AVG(crps)*1e4, AVG(abs_err)*1e4, AVG(covered) FROM scores GROUP BY forecaster
         ORDER BY state, crps_bps`,
      )
      .all() as { forecaster: string; state: string; n: number; anchors: number; crps_bps: number; mae_bps: number; coverage: number }[]
  );
}
