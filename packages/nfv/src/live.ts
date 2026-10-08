/**
 * The live Nightshift Fair Value engine — the same NFV v2 model the study scores, evaluated on
 * the tape's freshest data. Every round it produces, for every bStock, one forecast per
 * forecaster in the Night Shift:
 *
 *   anchor  the oracle that exists today: last official close, historical-volatility band
 *   echo    the on-chain price echoed back, band scaled to its historical error
 *   nfv     NFV v2: information-provenance weights + split-conformal 90% band
 *
 * Output follows docs/specs/fair-value-feed-v1.md: USD per token; lower/upper = 5th/95th
 * percentile of the token's value at the next regular-session open (`anchorTime`).
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { type Session, etParts, lastRegularClose, nextRegularOpen, sessionAt, weightedMedian } from "@nightshift/core";
import { DEFAULT_DB_PATH } from "@nightshift/tape";
import { type Universe, loadUniverse } from "./data.ts";
import { quantile } from "./dist.ts";
import { type Gap, basisAt } from "./gaps.ts";
import { gapVolatility } from "./model.ts";
import { type V2Params, type V2State, segmentBounds, v2Mu } from "./provenance.ts";

export type ForecasterId = "anchor" | "echo" | "nfv";
export const FORECASTERS: ForecasterId[] = ["anchor", "echo", "nfv"];

/** Session codes and flag bits exactly as in the on-chain Report. */
export const SESSION_CODE: Record<Session, number> = { regular: 0, pre: 1, post: 2, overnight: 3, closed: 4 };
export const FLAG = { corporateAction: 1, refStale: 2, thinLiquidity: 4, degraded: 8 } as const;

export interface LiveReport {
  forecaster: ForecasterId;
  token: string; // BSC address (lowercase)
  symbol: string;
  ticker: string;
  computedAt: number; // ms
  session: Session;
  state: V2State | "regular";
  anchorTime: number; // ms — the horizon lower/upper describe
  lastClose: number; // official close per share
  basis: number; // token price per share (multiplier × structural premium)
  tokenPrice: number; // live token mid (Binance spot book)
  move: number; // on-chain log move since the close (r)
  mu: number; // forecast log gap at anchorTime
  sigma: number; // Student-t scale of the log-gap forecast (CRPS-optimal; used for scoring)
  nu: number; // Student-t degrees of freedom
  fairValue: number; // USD per token
  lower: number; // USD per token, 5th percentile at anchorTime
  upper: number; // USD per token, 95th percentile at anchorTime
  bandBps: number;
  flags: number;
}

export function loadParams(): V2Params {
  return JSON.parse(readFileSync(new URL("../params/nfv-v2.json", import.meta.url), "utf8")) as V2Params;
}

interface LiveBook {
  mid: number;
  spreadBps: number;
  ts: number;
}

function latestBooks(db: DatabaseSync, now: number): Map<string, LiveBook> {
  const out = new Map<string, LiveBook>();
  const since = now - 5 * 60_000;
  const rows = db
    .prepare(`SELECT symbol, bid, ask, ts FROM cex_book WHERE ts > ? ORDER BY ts`)
    .all(since) as { symbol: string; bid: number; ask: number; ts: number }[];
  for (const r of rows) {
    if (r.bid > 0 && r.ask > 0) out.set(r.symbol, { mid: (r.bid + r.ask) / 2, spreadBps: ((r.ask - r.bid) / ((r.ask + r.bid) / 2)) * 1e4, ts: r.ts });
  }
  return out;
}

function latestDepth(db: DatabaseSync, now: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of db.prepare(`SELECT symbol, bid_usd50, ask_usd50 FROM cex_depth WHERE ts > ? ORDER BY ts`).all(now - 30 * 60_000) as { symbol: string; bid_usd50: number; ask_usd50: number }[]) {
    out.set(r.symbol, Math.min(r.bid_usd50, r.ask_usd50));
  }
  return out;
}

function latestRefs(db: DatabaseSync, now: number): Map<string, { price: number; ts: number }> {
  const out = new Map<string, { price: number; ts: number }>();
  for (const r of db.prepare(`SELECT ticker, price, price_time FROM ref_quote WHERE ts > ? ORDER BY ts`).all(now - 30 * 60_000) as { ticker: string; price: number | null; price_time: number | null }[]) {
    if (r.price && r.price_time) out.set(r.ticker, { price: r.price, ts: r.price_time });
  }
  return out;
}

export class LiveEngine {
  private universe: Universe;
  private loadedAt: number;

  constructor(
    readonly params: V2Params = loadParams(),
    private readonly dbPath = DEFAULT_DB_PATH,
  ) {
    this.universe = loadUniverse(dbPath);
    this.loadedAt = Date.now();
  }

  private refresh(now: number): void {
    if (now - this.loadedAt > 5 * 60_000) {
      this.universe = loadUniverse(this.dbPath);
      this.loadedAt = now;
    }
  }

  /** Every forecaster's report for every covered bStock at time `t`. */
  evaluate(t = Date.now()): LiveReport[] {
    this.refresh(t);
    const u = this.universe;
    const p = this.params;
    const db = new DatabaseSync(this.dbPath, { readOnly: true });
    const books = latestBooks(db, t);
    const depth = latestDepth(db, t);
    const refs = latestRefs(db, t);
    db.close();

    const session = sessionAt(t);
    const closeTime = lastRegularClose(t);
    const openTime = nextRegularOpen(t);
    const closeDate = etParts(closeTime).date;
    const gap: Gap = { id: `${closeDate}>live`, kind: "overnight", closeTime, openTime, closeDate, openDate: etParts(openTime).date };
    const { postEnd, restart } = segmentBounds(gap);
    const state: V2State = session === "closed" ? "dark" : restart > postEnd && t >= restart ? "restart" : "live";
    const clip = (x: number) => Math.max(-p.clip, Math.min(p.clip, x));

    interface Pt {
      inst: Universe["instruments"][number];
      close: number;
      basis: number;
      v: number;
      price: number;
      segs: [number, number, number];
      r: number;
      w: number;
      flags: number;
    }
    const pts: Pt[] = [];
    for (const inst of u.instruments) {
      const series = u.token.get(inst.ticker);
      const daily = u.ref.get(inst.ticker);
      const book = books.get(inst.cexSymbol!);
      if (!series || !daily || daily.length < 20 || !book) continue;
      let ci = daily.length - 1;
      while (ci >= 0 && daily[ci]!.closeTime > closeTime) ci--;
      if (ci < 0 || daily[ci]!.date !== closeDate) continue; // the official close that starts this gap must be known
      const basis = basisAt(series, daily, ci);
      const v = gapVolatility(daily, ci);
      if (basis == null || !Number.isFinite(v) || Math.abs(basis / inst.multiplier - 1) > 0.03) continue;
      const close = daily[ci]!.close;
      const base = basis * close;
      // Segment boundary prices from the hourly tape; the live mid stands in for "now".
      const at = (when: number) => (when >= t ? book.mid : (series.priceAt(when) ?? book.mid));
      const p1 = at(postEnd);
      const p2 = at(restart);
      const p3 = book.mid;
      let flags = 0;
      const d = depth.get(inst.cexSymbol!);
      if ((d !== undefined && d < 5_000) || book.spreadBps > 50) flags |= FLAG.thinLiquidity;
      pts.push({
        inst,
        close,
        basis,
        v,
        price: p3,
        segs: [clip(Math.log(p1 / base)), clip(Math.log(p2 / p1)), clip(Math.log(p3 / p2))],
        r: clip(Math.log(p3 / base)),
        w: Math.sqrt(series.volumeBetween(closeTime, t) + 1),
        flags,
      });
    }
    if (pts.length < 10) return [];
    const w = pts.map((x) => x.w);
    const f = [0, 1, 2].map((k) => weightedMedian(pts.map((x) => x.segs[k]!), w));

    const out: LiveReport[] = [];
    const nu = p.nu ?? 4;
    for (const x of pts) {
      const common = {
        token: x.inst.address,
        symbol: x.inst.symbol,
        ticker: x.inst.ticker,
        computedAt: t,
        session,
        lastClose: x.close,
        basis: x.basis,
        tokenPrice: x.price,
        move: x.r,
      };
      if (session === "regular") {
        // During the session the reference is live: fair value is the market, band = microstructure noise.
        const ref = refs.get(x.inst.ticker);
        const fresh = ref !== undefined && t - ref.ts < 15 * 60_000;
        const perShare = fresh ? ref.price : x.price / x.basis;
        const half = Math.max(0.001, (2 * (books.get(x.inst.cexSymbol!)?.spreadBps ?? 10)) / 1e4);
        const fv = perShare * x.basis;
        for (const id of FORECASTERS) {
          out.push({ ...common, forecaster: id, state: "regular", anchorTime: t, mu: Math.log(perShare / x.close), sigma: half / 1.645, nu, fairValue: fv, lower: fv * (1 - half), upper: fv * (1 + half), bandBps: 2 * half * 1e4, flags: x.flags | (fresh ? 0 : FLAG.refStale) });
        }
        continue;
      }
      const vv = Math.max(p.minVol, x.v);
      const xs = [f[0]!, x.segs[0] - f[0]!, f[1]!, x.segs[1] - f[1]!, f[2]!, x.segs[2] - f[2]!];
      const scales = p.scales ?? { anchor: { dark: 0.7, restart: 0.7, live: 0.64 }, echo: { dark: 0.7, restart: 0.37, live: 0.43 }, nfv: { dark: 0.68, restart: 0.37, live: 0.43 } };
      const tq = (mu: number, sigma: number) => ({ lo: quantile({ mu, sigma, nu }, 0.05), hi: quantile({ mu, sigma, nu }, 0.95) });
      const muN = v2Mu(p.coef[state], xs);
      const cz = p.conformal[state];
      const fc: Record<ForecasterId, { mu: number; sigma: number; lo: number; hi: number }> = {
        anchor: { mu: 0, sigma: scales.anchor[state] * vv, ...tq(0, scales.anchor[state] * vv) },
        echo: { mu: x.r, sigma: scales.echo[state] * vv, ...tq(x.r, scales.echo[state] * vv) },
        nfv: { mu: muN, sigma: scales.nfv[state] * vv, lo: muN + cz.z05 * vv, hi: muN + cz.z95 * vv },
      };
      const scale = x.close * x.basis;
      for (const id of FORECASTERS) {
        const c = fc[id];
        out.push({
          ...common,
          forecaster: id,
          state,
          anchorTime: openTime,
          mu: c.mu,
          sigma: c.sigma,
          nu,
          fairValue: scale * Math.exp(c.mu),
          lower: scale * Math.exp(c.lo),
          upper: scale * Math.exp(c.hi),
          bandBps: (Math.exp(c.hi) - Math.exp(c.lo)) * 1e4,
          flags: x.flags,
        });
      }
    }
    return out;
  }
}
