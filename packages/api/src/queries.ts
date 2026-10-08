/**
 * Read model over the tape + network tables. Every answer the API gives is a query over rows
 * that were written by the collector and the Night Shift — nothing is computed only for display.
 */
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { BSC, hoursToOpen, nextRegularOpen, sessionAt } from "@nightshift/core";
import { MerkleTree, scoreboard } from "@nightshift/network";
import { DEFAULT_DB_PATH } from "@nightshift/tape";

export interface ConsensusRow {
  round: number;
  token: string;
  symbol: string;
  ticker: string;
  session: string;
  state: string;
  anchor_time: number;
  fair_value: number;
  lower: number;
  upper: number;
  flags: number;
  weights: string;
  computed_at: number;
  chain_status: string;
  tx_hash: string | null;
}

const num = (x: number, d = 4) => Number(x.toFixed(d));

export class Queries {
  private readonly db: DatabaseSync;

  constructor(path = DEFAULT_DB_PATH) {
    this.db = new DatabaseSync(path, { readOnly: true });
  }

  status() {
    const now = Date.now();
    const round = this.latestRound();
    const lastBook = this.db.prepare(`SELECT MAX(ts) t FROM cex_book`).get() as { t: number | null };
    return {
      now: new Date(now).toISOString(),
      session: sessionAt(now),
      nextOpen: new Date(nextRegularOpen(now)).toISOString(),
      hoursToOpen: num(hoursToOpen(now), 2),
      latestRound: round,
      tapeLagSeconds: lastBook.t ? Math.round((now - lastBook.t) / 1000) : null,
    };
  }

  latestRound(): { round: number; ts: number; session: string; state: string; anchor_time: number; n_tokens: number } | null {
    return (this.db.prepare(`SELECT * FROM rounds ORDER BY round DESC LIMIT 1`).get() as never) ?? null;
  }

  instruments(ticker?: string) {
    const rows = this.db
      .prepare(`SELECT issuer, chain_id, address, symbol, ticker, asset_type, multiplier, decimals, cex_symbol FROM instruments WHERE (?1 IS NULL OR ticker = ?1) ORDER BY ticker, issuer, chain_id`)
      .all(ticker ?? null) as Record<string, string | number | null>[];
    return rows;
  }

  consensus(): ConsensusRow[] {
    const r = this.latestRound();
    if (!r) return [];
    return this.db.prepare(`SELECT * FROM consensus WHERE round = ? ORDER BY symbol`).all(r.round) as unknown as ConsensusRow[];
  }

  /** Fair value for one token (symbol like NVDAB or a BSC address), with every forecaster's view. */
  fairValue(key: string) {
    const r = this.latestRound();
    if (!r) return null;
    const c = this.db
      .prepare(`SELECT * FROM consensus WHERE round = ? AND (lower(symbol) = lower(?2) OR token = lower(?2))`)
      .get(r.round, key) as unknown as ConsensusRow | undefined;
    if (!c) return null;
    const forecasts = this.db
      .prepare(`SELECT forecaster, fair_value, lower, upper, mu, sigma, token_price, move, last_close, basis, flags FROM forecasts WHERE round = ? AND token = ?`)
      .all(c.round, c.token) as Record<string, number | string>[];
    return { consensus: this.formatConsensus(c), forecasters: forecasts, round: r };
  }

  formatConsensus(c: ConsensusRow) {
    return {
      token: c.token,
      symbol: c.symbol,
      ticker: c.ticker,
      session: c.session,
      state: c.state,
      fairValue: num(c.fair_value),
      lower: num(c.lower),
      upper: num(c.upper),
      bandBps: num(((c.upper - c.lower) / c.fair_value) * 1e4, 1),
      anchorTime: new Date(c.anchor_time).toISOString(),
      flags: c.flags,
      weights: JSON.parse(c.weights) as Record<string, number>,
      round: c.round,
      computedAt: new Date(c.computed_at).toISOString(),
      onChain: { status: c.chain_status, tx: c.tx_hash },
    };
  }

  /** The dark-hours radar: every stock's on-chain move vs Friday's close, Nightshift's view, and the premium. */
  radar() {
    const r = this.latestRound();
    if (!r) return { round: null, rows: [] };
    const rows = this.db
      .prepare(
        `SELECT c.symbol, c.ticker, c.token, c.fair_value, c.lower, c.upper, c.state, c.session, f.token_price, f.move, f.last_close, f.basis
         FROM consensus c LEFT JOIN forecasts f ON f.round = c.round AND f.token = c.token AND f.forecaster = 'nfv'
         WHERE c.round = ? ORDER BY ABS(COALESCE(f.move, 0)) DESC`,
      )
      .all(r.round) as Record<string, number | string | null>[];
    return {
      round: r,
      rows: rows.map((x) => {
        const fv = x.fair_value as number;
        const px = (x.token_price as number | null) ?? fv;
        return {
          symbol: x.symbol,
          ticker: x.ticker,
          token: x.token,
          tokenPrice: num(px),
          lastClosePerToken: x.last_close != null ? num((x.last_close as number) * (x.basis as number)) : null,
          moveBps: x.move != null ? num((x.move as number) * 1e4, 1) : null,
          fairValue: num(fv),
          lower: num(x.lower as number),
          upper: num(x.upper as number),
          premiumToFairValueBps: num(((px - fv) / fv) * 1e4, 1),
          gapRiskDownBps: num(((fv - (x.lower as number)) / fv) * 1e4, 1),
          state: x.state,
        };
      }),
    };
  }

  /** "Which NVIDIA?" — every issuer's token for an underlying, priced per real share, with venues. */
  which(ticker: string) {
    const T = ticker.toUpperCase();
    const insts = this.db.prepare(`SELECT * FROM instruments WHERE ticker = ? ORDER BY issuer, chain_id`).all(T) as Record<string, string | number | null>[];
    if (insts.length === 0) return null;
    const fv = this.fairValue(insts.find((i) => i.issuer === "bstocks" && i.chain_id === BSC)?.symbol as string);
    const fvPerShare = fv ? fv.consensus.fairValue / ((fv.forecasters[0]?.basis as number | undefined) ?? 1) : null;
    const since = Date.now() - 15 * 60_000;
    const tokens = insts.map((i) => {
      const pools = this.db
        .prepare(`SELECT dex_id, pair, quote_symbol, price_usd, liquidity_usd, volume24h, MAX(ts) ts FROM pool_snapshot WHERE base_address = ? AND ts > ? GROUP BY pair ORDER BY liquidity_usd DESC`)
        .all(i.address as string, since) as Record<string, number | string>[];
      const book = i.cex_symbol
        ? (this.db.prepare(`SELECT bid, ask, ts FROM cex_book WHERE symbol = ? ORDER BY ts DESC LIMIT 1`).get(i.cex_symbol) as { bid: number; ask: number; ts: number } | undefined)
        : undefined;
      const mult = i.multiplier as number;
      const liquidity = pools.reduce((s, p) => s + ((p.liquidity_usd as number) || 0), 0);
      const deepest = pools[0];
      const venuePrice = book ? (book.bid + book.ask) / 2 : deepest ? (deepest.price_usd as number) : null;
      const perShare = venuePrice ? venuePrice / mult : null;
      return {
        issuer: i.issuer,
        chainId: i.chain_id,
        symbol: i.symbol,
        address: i.address,
        sharesPerToken: mult,
        cex: book ? { symbol: i.cex_symbol, bid: book.bid, ask: book.ask, spreadBps: num(((book.ask - book.bid) / ((book.ask + book.bid) / 2)) * 1e4, 2) } : null,
        dexPools: pools.slice(0, 6).map((p) => ({ dex: p.dex_id, pair: p.pair, quote: p.quote_symbol, priceUsd: p.price_usd, liquidityUsd: Math.round(p.liquidity_usd as number), volume24h: Math.round(p.volume24h as number) })),
        dexLiquidityUsd: Math.round(liquidity),
        pricePerShare: perShare ? num(perShare) : null,
        vsFairValueBps: perShare && fvPerShare ? num(((perShare - fvPerShare) / fvPerShare) * 1e4, 1) : null,
      };
    });
    const tradable = tokens.filter((t) => t.chainId === BSC && t.pricePerShare && (t.cex || t.dexLiquidityUsd > 25_000));
    const best = [...tradable].sort((a, b) => (a.pricePerShare ?? Infinity) - (b.pricePerShare ?? Infinity))[0];
    return {
      ticker: T,
      fairValuePerShare: fvPerShare ? num(fvPerShare) : null,
      consensus: fv?.consensus ?? null,
      answer: best ? { symbol: best.symbol, issuer: best.issuer, address: best.address, pricePerShare: best.pricePerShare, reason: "cheapest real share among BSC tokens with enough liquidity to fill" } : null,
      tokens,
    };
  }

  rounds(limit = 50) {
    return this.db
      .prepare(`SELECT r.round, r.ts, r.session, r.state, r.anchor_time, r.n_tokens, (SELECT json_group_object(forecaster, json_object('root', root, 'count', count, 'chain', chain_status, 'tx', tx_hash)) FROM commitments c WHERE c.round = r.round) commitments FROM rounds r ORDER BY r.round DESC LIMIT ?`)
      .all(limit)
      .map((r) => {
        const x = r as Record<string, unknown>;
        return { ...x, ts: new Date(x.ts as number).toISOString(), anchorTime: new Date(x.anchor_time as number).toISOString(), commitments: x.commitments ? JSON.parse(x.commitments as string) : {} };
      });
  }

  /** Merkle proof that a forecast was committed in a round (verifiable on-chain via ForecastBook.verifyForecast). */
  proof(round: number, forecaster: string, key: string) {
    const rows = this.db.prepare(`SELECT token, symbol, leaf, fair_value, lower, upper, anchor_time FROM forecasts WHERE round = ? AND forecaster = ?`).all(round, forecaster) as Record<string, string | number>[];
    if (rows.length === 0) return null;
    const target = rows.find((r) => (r.token as string) === key.toLowerCase() || (r.symbol as string).toLowerCase() === key.toLowerCase());
    if (!target) return null;
    const tree = new MerkleTree(rows.map((r) => r.leaf as `0x${string}`));
    const commit = this.db.prepare(`SELECT root, chain_status, tx_hash FROM commitments WHERE round = ? AND forecaster = ?`).get(round, forecaster) as { root: string; chain_status: string; tx_hash: string | null };
    return {
      round,
      forecaster,
      token: target.token,
      symbol: target.symbol,
      leaf: { round, token: target.token, medianE8: Math.round((target.fair_value as number) * 1e8).toString(), lowerE8: Math.round((target.lower as number) * 1e8).toString(), upperE8: Math.round((target.upper as number) * 1e8).toString(), anchorTime: Math.floor((target.anchor_time as number) / 1000) },
      leafHash: target.leaf,
      proof: tree.proof(target.leaf as `0x${string}`),
      root: tree.root,
      committedRoot: commit.root,
      onChain: { status: commit.chain_status, tx: commit.tx_hash },
    };
  }

  scoreboard() {
    return scoreboard(this.db).map((r) => ({ ...r, crps_bps: num(r.crps_bps, 2), mae_bps: num(r.mae_bps, 2), coverage: num(r.coverage, 4) }));
  }

  /** Per-open live results: how each forecaster did on each scored open. */
  results(limit = 20) {
    return this.db
      .prepare(`SELECT anchor_time, forecaster, COUNT(*) n, AVG(crps)*1e4 crps_bps, AVG(abs_err)*1e4 mae_bps, AVG(covered) coverage FROM scores GROUP BY anchor_time, forecaster ORDER BY anchor_time DESC, crps_bps LIMIT ?`)
      .all(limit * 3)
      .map((r) => {
        const x = r as Record<string, number | string>;
        return { open: new Date(x.anchor_time as number).toISOString(), forecaster: x.forecaster, n: x.n, crpsBps: num(x.crps_bps as number, 2), maeBps: num(x.mae_bps as number, 2), coverage: num(x.coverage as number, 4) };
      });
  }

  study() {
    const path = "research/out/study-v2.json";
    const params = "packages/nfv/params/nfv-v2.json";
    return {
      methodology: "Strict leave-one-gap-out over every gap since bStocks listed (2026-06-11). CRPS and MAE in bps of price; coverage of the split-conformal 90% band.",
      results: existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null,
      params: existsSync(params) ? JSON.parse(readFileSync(params, "utf8")) : null,
    };
  }
}
