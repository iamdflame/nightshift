/**
 * The live Nightshift Fair Value engine: the same model the study scores, evaluated on the tape's
 * freshest data. Produces one report per bStock per round from each forecaster:
 *
 *   anchor  — the oracle that exists today: last official close, historical-volatility band
 *   echo    — the on-chain price echoed back, scale fitted to its historical error
 *   shrink  — NFV v1: significance-weighted factor + shrunk idiosyncratic move, conformal band
 *
 * Reports follow docs/specs/fair-value-feed-v1.md (USD per token; band = 5th/95th percentile of
 * the token's value at the next regular open).
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { BSC, type Session, lastRegularClose, nextRegularOpen, sessionAt, weightedMedian } from "@nightshift/core";
import { DEFAULT_DB_PATH } from "@nightshift/tape";
import { type Universe, loadUniverse } from "./data.ts";
import { quantile } from "./dist.ts";
import { basisAt } from "./gaps.ts";
import { type InfoState, type NfvParams, gapVolatility } from "./model.ts";

export type ForecasterId = "anchor" | "echo" | "shrink";
export const FORECASTERS: ForecasterId[] = ["anchor", "echo", "shrink"];

export const SESSION_CODE: Record<Session, number> = { regular: 0, pre: 1, post: 2, overnight: 3, closed: 4 };

export const FLAG = { corporateAction: 1, refStale: 2, thinLiquidity: 4, degraded: 8 } as const;

export interface LiveReport {
  forecaster: ForecasterId;
  token: string; // BSC address (lowercase)
  symbol: string;
  ticker: string;
  computedAt: number; // ms
  session: Session;
  state: InfoState | "regular";
  anchorTime: number; // ms — the horizon lower/upper describe
  lastClose: number; // official close per share
  basis: number; // token price per share (multiplier × structural premium)
  tokenPrice: number; // robust current token price (CEX mid)
  move: number; // on-chain log move vs close (r)
  factor: number; // cross-sectional factor (f, significance-weighted)
  mu: number; // predicted log gap at anchor
  fairValue: number; // USD per token
  lower: number; // USD per token, 5th pct at anchor
  upper: number; // USD per token, 95th pct at anchor
  bandBps: number;
  flags: number;
}

const PARAMS_URL = new URL("../params/nfv-v1.json", import.meta.url);

export function loadParams(): NfvParams {
  return JSON.parse(readFileSync(PARAMS_URL, "utf8")) as NfvParams;
}

interface Snapshot {
  mids: Map<string, { mid: number; spreadBps: number; ts: number }>; // by CEX symbol
  depthUsd: Map<string, number>; // by CEX symbol: min(bid, ask) USD within ±50 bps
  refLive: Map<string, { price: number; ts: number }>; // by ticker (Yahoo 1m, regular session)
}

function snapshot(dbPath = DEFAULT_DB_PATH): Snapshot {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const mids = new Map<string, { mid: number; spreadBps: number; ts: number }>();
  const since = Date.now() - 10 * 60_000;
  for (const r of db
    .prepare(`SELECT symbol, bid, ask, ts FROM cex_book WHERE ts > ? AND ts = (SELECT MAX(ts) FROM cex_book c2 WHERE c2.symbol = cex_book.symbol AND c2.ts > ?)`)
    .all(since, since) as { symbol: string; bid: number; ask: number; ts: number }[]) {
    if (r.bid > 0 && r.ask > 0) mids.set(r.symbol, { mid: (r.bid + r.ask) / 2, spreadBps: ((r.ask - r.bid) / ((r.ask + r.bid) / 2)) * 1e4, ts: r.ts });
  }
  const depthUsd = new Map<string, number>();
  for (const r of db
    .prepare(`SELECT symbol, bid_usd50, ask_usd50 FROM cex_depth WHERE ts > ? ORDER BY ts`)
    .all(Date.now() - 30 * 60_000) as { symbol: string; bid_usd50: number; ask_usd50: number }[]) {
    depthUsd.set(r.symbol, Math.min(r.bid_usd50, r.ask_usd50));
  }
  const refLive = new Map<string, { price: number; ts: number }>();
  for (const r of db
    .prepare(`SELECT ticker, price, price_time FROM ref_quote WHERE ts > ? ORDER BY ts`)
    .all(Date.now() - 30 * 60_000) as { ticker: string; price: number | null; price_time: number | null }[]) {
    if (r.price && r.price_time) refLive.set(r.ticker, { price: r.price, ts: r.price_time });
  }
  db.close();
  return { mids, depthUsd, refLive };
}

export class LiveEngine {
  private universe: Universe;
  private loadedAt: number;

  constructor(
    private params = loadParams(),
    private readonly dbPath = DEFAULT_DB_PATH,
  ) {
    this.universe = loadUniverse(dbPath);
    this.loadedAt = Date.now();
  }

  /** Reload history (klines, daily refs) at most every few minutes; live mids come from the snapshot. */
  private refresh(): void {
    if (Date.now() - this.loadedAt > 5 * 60_000) {
      this.universe = loadUniverse(this.dbPath);
      this.loadedAt = Date.now();
    }
  }

  /** Evaluate every forecaster for every bStock at time `t` (default: now). */
  evaluate(t = Date.now()): LiveReport[] {
    this.refresh();
    const u = this.universe;
    const snap = snapshot(this.dbPath);
    const session = sessionAt(t);
    const p = this.params;
    const closeTime = lastRegularClose(t);
    const anchorTime = session === "regular" ? t : nextRegularOpen(t);

    interface Pt {
      inst: (typeof u.instruments)[number];
      close: number;
      basis: number;
      v: number;
      price: number;
      r: number;
      w: number;
      flags: number;
    }
    const pts: Pt[] = [];
    for (const inst of u.instruments) {
      const series = u.token.get(inst.ticker);
      const refs = u.ref.get(inst.ticker);
      const live = snap.mids.get(inst.cexSymbol!);
      if (!series || !refs || refs.length < 20 || !live) continue;
      // The official close that starts the current gap (or the latest one during the session).
      let ci = refs.length - 1;
      while (ci >= 0 && refs[ci]!.closeTime > closeTime) ci--;
      if (ci < 0) continue;
      const basis = basisAt(series, refs, ci);
      const v = gapVolatility(refs, ci);
      if (basis == null || !Number.isFinite(v) || Math.abs(basis / inst.multiplier - 1) > 0.03) continue;
      // Robust price: median of the last two hourly closes and the live mid (mirrors the study's window).
      // Same signal construction the parameters were fitted with (trailing median of hourly closes),
      // with the live mid standing in for the still-open hour.
      const rh = p.rowOptions.robustHours;
      const hourly = rh > 1 ? series.robustPriceAt(t, rh - 1) : null;
      const price = hourly ? (hourly + live.mid) / 2 : live.mid;
      const close = refs[ci]!.close;
      let flags = 0;
      const depth = snap.depthUsd.get(inst.cexSymbol!);
      if ((depth !== undefined && depth < 5_000) || live.spreadBps > 50) flags |= FLAG.thinLiquidity;
      pts.push({ inst, close, basis, v, price, r: Math.max(-p.clip, Math.min(p.clip, Math.log(price / (basis * close)))), w: Math.sqrt(series.volumeBetween(closeTime, t) + 1), flags });
    }
    if (pts.length < 10) return [];

    // Significance-weighted cross-sectional factor (as fitted).
    const raw = weightedMedian(pts.map((x) => x.r), pts.map((x) => x.w));
    const dev = pts.map((x) => Math.abs(x.r - raw)).sort((a, b) => a - b);
    const se = (1.2533 * 1.4826 * dev[dev.length >> 1]!) / Math.sqrt(pts.length) || 1e-9;
    const tStat = raw / se;
    const k = p.rowOptions.shrinkK;
    const f = k > 0 ? raw * ((tStat * tStat) / (tStat * tStat + k)) : raw;

    const out: LiveReport[] = [];
    for (const x of pts) {
      const base = {
        token: x.inst.address,
        symbol: x.inst.symbol,
        ticker: x.inst.ticker,
        computedAt: t,
        session,
        anchorTime,
        lastClose: x.close,
        basis: x.basis,
        tokenPrice: x.price,
        move: x.r,
        factor: f,
      };
      if (session === "regular") {
        // Live market: the reference itself is the fair value; band = live microstructure noise.
        const ref = snap.refLive.get(x.inst.ticker);
        const fresh = ref && t - ref.ts < 15 * 60_000;
        const perShare = fresh ? ref!.price : x.price / x.basis;
        const halfBand = Math.max(0.001, 2 * ((snap.mids.get(x.inst.cexSymbol!)?.spreadBps ?? 10) / 1e4));
        const fv = perShare * x.basis;
        for (const id of FORECASTERS) {
          out.push({ ...base, forecaster: id, state: "regular", mu: Math.log(perShare / x.close), fairValue: fv, lower: fv * (1 - halfBand), upper: fv * (1 + halfBand), bandBps: 2 * halfBand * 1e4, flags: x.flags | (fresh ? 0 : FLAG.refStale) });
        }
        continue;
      }
      const state: InfoState = session === "closed" ? "dark" : "live";
      const vv = Math.max(p.minVol, x.v);
      const e = x.r - f;
      const s = p.states[state];
      const forecasts: Record<ForecasterId, { mu: number; lo: number; hi: number }> = {
        anchor: (() => {
          const d = { mu: 0, sigma: p.baselines.staleC * vv, nu: p.nu };
          return { mu: 0, lo: quantile(d, 0.05), hi: quantile(d, 0.95) };
        })(),
        echo: (() => {
          const d = { mu: x.r, sigma: p.baselines.naiveC[state] * vv, nu: p.nu };
          return { mu: x.r, lo: quantile(d, 0.05), hi: quantile(d, 0.95) };
        })(),
        shrink: (() => {
          const mu = s.a * f + s.b * e;
          return { mu, lo: mu + s.z05 * vv, hi: mu + s.z95 * vv };
        })(),
      };
      for (const id of FORECASTERS) {
        const fc = forecasts[id];
        const scale = x.close * x.basis;
        out.push({
          ...base,
          forecaster: id,
          state,
          mu: fc.mu,
          fairValue: scale * Math.exp(fc.mu),
          lower: scale * Math.exp(fc.lo),
          upper: scale * Math.exp(fc.hi),
          bandBps: (Math.exp(fc.hi) - Math.exp(fc.lo)) * 1e4,
          flags: x.flags,
        });
      }
    }
    return out;
  }
}

export const BSC_CHAIN = BSC;
