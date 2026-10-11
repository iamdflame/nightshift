/**
 * Read model over the tape + network tables. Every answer the API gives is a query over rows
 * that were written by the collector and the Night Shift — nothing is computed only for display.
 */
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { BSC, hoursToOpen, lastRegularClose, nextRegularOpen, sessionAt } from "@nightshift/core";
import { MerkleTree, scoreboard } from "@nightshift/network";
import { ENDPOINTS } from "@nightshift/sdk";
import { DEFAULT_DB_PATH } from "@nightshift/tape";
import { isCompliance, noteFor, OK_CODES } from "./stack.ts";

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

  close(): void {
    this.db.close();
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

  /**
   * Component health: is the 24/7 tape fresh, is the Night Shift producing rounds, are opens being
   * scored. Used by the container healthcheck and anyone watching the deployment.
   */
  health() {
    const now = Date.now();
    const age = (sql: string) => {
      const r = this.db.prepare(sql).get() as { t: number | null };
      return r.t ? Math.round((now - r.t) / 1000) : null;
    };
    const tapeLag = age(`SELECT MAX(ts) t FROM cex_book`);
    const roundAge = age(`SELECT MAX(ts) t FROM rounds`);
    const lastScore = age(`SELECT MAX(scored_at) t FROM scores`);
    const refAge = age(`SELECT MAX(ts) t FROM ref_quote`);
    const checks = {
      tape: { ok: tapeLag != null && tapeLag < 120, lagSeconds: tapeLag },
      reference: { ok: refAge != null && refAge < 3 * 3600, ageSeconds: refAge },
      rounds: { ok: roundAge != null && roundAge < 45 * 60, ageSeconds: roundAge },
      scoring: { ok: true, lastScoredSecondsAgo: lastScore },
      chain: this.chainHealth(age),
    };
    return { ok: Object.values(checks).every((c) => c.ok), checks, session: sessionAt(now) };
  }

  /** With publishing on, the proof must keep landing: a commit and a consumed-token oracle post every round. */
  private chainHealth(age: (sql: string) => number | null) {
    if (process.env.NIGHTSHIFT_CHAIN !== "1") return { ok: true, publishing: false };
    const lastCommit = age(`SELECT MAX(round) * 60000 t FROM commitments WHERE chain_status = 'committed'`);
    const lastPost = age(`SELECT MAX(computed_at) t FROM consensus WHERE chain_status = 'posted'`);
    return {
      ok: lastCommit != null && lastCommit < 3600 && lastPost != null && lastPost < 3600,
      publishing: true,
      lastCommitSecondsAgo: lastCommit,
      lastOraclePostSecondsAgo: lastPost,
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
      onChain: { status: c.chain_status, tx: c.tx_hash, latest: this.latestOnChain(c.token) },
    };
  }

  /** The newest report for this token that is actually on BSC (non-consumed tokens post on deviation/heartbeat). */
  latestOnChain(token: string) {
    const p = this.db
      .prepare(`SELECT round, fair_value, lower, upper, computed_at, tx_hash FROM consensus WHERE token = ? AND chain_status = 'posted' ORDER BY round DESC LIMIT 1`)
      .get(token) as { round: number; fair_value: number; lower: number; upper: number; computed_at: number; tx_hash: string } | undefined;
    return p
      ? { round: p.round, fairValue: num(p.fair_value), lower: num(p.lower), upper: num(p.upper), computedAt: new Date(p.computed_at).toISOString(), tx: p.tx_hash }
      : null;
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

  /**
   * The market checking itself: leveraged/inverse ETF tokens must move ≈ L × their base since the
   * close. Every pair gives an independent read of the same underlying move; disagreement is noise
   * (or an opportunity) the 24/7 market hasn't arbitraged away.
   */
  identities() {
    const PAIRS: { lev: string; base: string; L: number }[] = [
      { lev: "SOXL", base: "SMH", L: 3 },
      { lev: "SOXS", base: "SMH", L: -3 },
      { lev: "TQQQ", base: "QQQ", L: 3 },
      { lev: "SQQQ", base: "QQQ", L: -3 },
      { lev: "KORU", base: "EWY", L: 3 },
      { lev: "MUU", base: "MU", L: 2 },
      { lev: "MVLL", base: "MRVL", L: 2 },
      { lev: "INTW", base: "INTC", L: 2 },
      { lev: "SNXX", base: "SNDK", L: 2 },
    ];
    const r = this.latestRound();
    if (!r) return { round: null, pairs: [] };
    const moves = new Map(
      (this.db.prepare(`SELECT ticker, move FROM forecasts WHERE round = ? AND forecaster = 'nfv'`).all(r.round) as { ticker: string; move: number }[]).map((x) => [x.ticker, x.move]),
    );
    const pairs = PAIRS.filter((p) => moves.has(p.lev) && moves.has(p.base)).map((p) => {
      const lev = moves.get(p.lev)!;
      const base = moves.get(p.base)!;
      const implied = lev / p.L;
      return {
        leveraged: `${p.lev}B`,
        base: `${p.base}B`,
        leverage: p.L,
        leveragedMoveBps: num(lev * 1e4, 1),
        baseMoveBps: num(base * 1e4, 1),
        impliedBaseMoveBps: num(implied * 1e4, 1),
        disagreementBps: num((implied - base) * 1e4, 1),
      };
    });
    return { round: r, note: "Since the last official close. Daily-reset leveraged ETFs should move ≈ leverage × base over one gap.", pairs };
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

  /**
   * One token's recent history for the forecast fan: consensus per round (fair value + band aimed at
   * that round's anchor), the nfv view of the token price and last close, hourly CEX closes, and every
   * forecaster's commit for the next open (with its on-chain status and tx).
   *
   * With `anchor` (an open, ms epoch) the answer is that one open instead of the last `hours`: every round
   * aimed at it, the hourly closes over its dark window, the official open per token once it is scored
   * (`realized`, null until then) and each forecaster's last forecast before it, with its error against
   * that open (`lastCommits`). Without it, `anchor` is the next open and `realized` is null.
   */
  history(key: string, hours = 72, anchor?: number) {
    const inst = this.db
      .prepare(`SELECT address, symbol, cex_symbol FROM instruments WHERE chain_id = '56' AND (lower(symbol) = lower(?1) OR address = lower(?1)) ORDER BY issuer = 'bstocks' DESC LIMIT 1`)
      .get(key) as { address: string; symbol: string; cex_symbol: string | null } | undefined;
    if (!inst) return null;
    const since = Date.now() - Math.min(Math.max(hours, 1), 24 * 14) * 3600_000;
    const nextAnchor = nextRegularOpen(Date.now());
    const target = anchor ?? nextAnchor;
    const points = (
      this.db
        .prepare(
          `SELECT c.round, c.computed_at t, c.session, c.state, c.anchor_time, c.fair_value, c.lower, c.upper, c.chain_status, c.tx_hash,
                  f.token_price, f.last_close * f.basis AS last_close_tok
           FROM consensus c LEFT JOIN forecasts f ON f.round = c.round AND f.token = c.token AND f.forecaster = 'nfv'
           WHERE c.token = ? AND ${anchor == null ? "c.computed_at >= ?" : "c.anchor_time = ?"} ORDER BY c.round`,
        )
        .all(inst.address, anchor ?? since) as Record<string, number | string | null>[]
    ).map((r) => ({
      round: r.round as number,
      t: r.t as number,
      session: r.session as string,
      state: r.state as string,
      anchorTime: r.anchor_time as number,
      fairValue: num(r.fair_value as number),
      lower: num(r.lower as number),
      upper: num(r.upper as number),
      tokenPrice: r.token_price == null ? null : num(r.token_price as number),
      lastClose: r.last_close_tok == null ? null : num(r.last_close_tok as number),
      chainStatus: r.chain_status as string,
      tx: (r.tx_hash as string | null) ?? null,
    }));
    // One open's window runs from the close before it (or its first round, if earlier) to the open itself.
    const from = anchor == null ? since : Math.min(points[0]?.t ?? Infinity, lastRegularClose(anchor - 60_000)) - 2 * 3600_000;
    const klines = inst.cex_symbol
      ? (this.db
          .prepare(`SELECT open_time t, close FROM klines WHERE symbol = ? AND interval = '1h' AND open_time >= ? AND open_time <= ? ORDER BY open_time`)
          .all(inst.cex_symbol, from, anchor ?? Number.MAX_SAFE_INTEGER) as { t: number; close: number }[])
      : [];
    const commits = (
      this.db
        .prepare(
          `SELECT f.round, r.ts t, f.forecaster, f.fair_value, f.lower, f.upper, c.chain_status, c.tx_hash
           FROM forecasts f JOIN rounds r ON r.round = f.round LEFT JOIN commitments c ON c.round = f.round AND c.forecaster = f.forecaster
           WHERE f.token = ? AND f.anchor_time = ? ORDER BY f.round`,
        )
        .all(inst.address, target) as Record<string, number | string | null>[]
    ).map((r) => ({
      round: r.round as number,
      t: r.t as number,
      forecaster: r.forecaster as string,
      fairValue: num(r.fair_value as number),
      lower: num(r.lower as number),
      upper: num(r.upper as number),
      chain: (r.chain_status as string | null) ?? "local",
      tx: (r.tx_hash as string | null) ?? null,
    }));
    // The official open per token, as opens() derives it: the scored open per share × the token's basis.
    const scored = this.db
      .prepare(
        `SELECT s.realized_open * f.basis AS realized FROM forecasts f JOIN scores s ON s.round = f.round AND s.forecaster = f.forecaster AND s.token = f.token
         WHERE f.token = ? AND f.anchor_time = ? ORDER BY f.round DESC LIMIT 1`,
      )
      .get(inst.address, target) as { realized: number } | undefined;
    const realized = scored ? num(scored.realized) : null;
    // Each forecaster's last forecast before the open; its error is in log terms, like the scores' abs_err (signed: + is above the open).
    const last = new Map<string, (typeof commits)[number]>();
    for (const c of commits) if (c.t < target) last.set(c.forecaster, c);
    const lastCommits = [...last.values()].map((c) => ({
      ...c,
      errBps: realized == null ? null : num(Math.log(c.fairValue / realized) * 1e4, 1),
      covered: realized == null ? null : realized >= c.lower && realized <= c.upper,
    }));
    return { token: inst.address, symbol: inst.symbol, nextAnchor, anchor: target, points, klines, commits, realized, lastCommits };
  }

  /** Everything on BSC mainnet, as JSON (the same facts as docs/LIVE.md): contracts, agents, commits, posts, loan, trades, jobs, scores. */
  onchain() {
    const read = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);
    const dep = read<Record<string, unknown> & { feeds?: Record<string, string>; block?: number }>("deployments/56.json");
    const agentsFile = read<Record<string, { agentId: number | null; address: string; tx: string; registeredAt?: string }>>("deployments/agents.json") ?? {};
    const names: Record<string, string> = { treasury: "Nightshift Scorer", anchor: "Forecaster: Anchor", echo: "Forecaster: Echo", nfv: "Forecaster: NFV", executor: "Nightshift Trade" };
    const sym = new Map((this.db.prepare(`SELECT lower(address) a, symbol FROM instruments WHERE chain_id = '56'`).all() as { a: string; symbol: string }[]).map((r) => [r.a, r.symbol]));
    const roles: Record<string, string> = {
      ForecastBook: "Forecasters commit a Merkle root of every forecast before the open",
      NightshiftOracle: "Consensus fair value + 90% next-open band per token",
      NightshiftCredit: "Borrow USDT against bStocks 24/7, valued at the band's lower edge",
      NightshiftVenusOracle: "Venus OracleInterface adapter over the same reports",
    };
    const has = (t: string) => Boolean(this.db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t));
    const posts = this.db.prepare(`SELECT COUNT(DISTINCT tx_hash) txs, COUNT(*) reports FROM consensus WHERE chain_status = 'posted'`).get() as { txs: number; reports: number };
    const latest = this.db
      .prepare(
        `SELECT c.symbol, c.round, c.fair_value, c.lower, c.upper, c.computed_at, c.tx_hash FROM consensus c
         JOIN (SELECT token, MAX(round) r FROM consensus WHERE chain_status = 'posted' GROUP BY token) m ON m.token = c.token AND m.r = c.round
         ORDER BY c.computed_at DESC, c.symbol LIMIT 24`,
      )
      .all() as Record<string, number | string>[];
    return {
      chainId: 56 as const,
      deployBlock: (dep?.block as number | undefined) ?? null,
      contracts: dep ? Object.entries(roles).filter(([k]) => typeof dep[k] === "string").map(([k, role]) => ({ name: k, address: dep[k] as string, role })) : [],
      feeds: Object.entries(dep?.feeds ?? {}).map(([token, feed]) => ({ token, symbol: sym.get(token.toLowerCase()) ?? token, feed })),
      agents: Object.entries(agentsFile).map(([role, a]) => ({ role, name: names[role] ?? role, agentId: a.agentId, address: a.address, tx: a.tx, registeredAt: a.registeredAt ?? null })),
      commitments: (
        this.db
          // lastTx is the commit tx of the group's newest round (MAX(tx_hash) would be the lexicographically largest hash).
          .prepare(
            `SELECT c.anchor_time, c.forecaster, COUNT(*) n, MIN(c.round) r0, MAX(c.round) r1,
                    (SELECT l.tx_hash FROM commitments l
                     WHERE l.anchor_time = c.anchor_time AND l.forecaster = c.forecaster AND l.chain_status = 'committed' AND l.tx_hash IS NOT NULL
                     ORDER BY l.round DESC LIMIT 1) last
             FROM commitments c WHERE c.chain_status = 'committed' GROUP BY c.anchor_time, c.forecaster ORDER BY c.anchor_time DESC, c.forecaster`,
          )
          .all() as Record<string, number | string>[]
      ).map((r) => ({ anchorTime: r.anchor_time as number, forecaster: r.forecaster as string, rounds: r.n as number, firstRound: r.r0 as number, lastRound: r.r1 as number, lastTx: (r.last as string) ?? null })),
      recentCommits: (
        this.db
          .prepare(`SELECT c.round, c.forecaster, c.tx_hash, c.anchor_time, COALESCE(r.ts, c.round * 60000) t FROM commitments c LEFT JOIN rounds r ON r.round = c.round WHERE c.chain_status = 'committed' AND c.tx_hash IS NOT NULL ORDER BY c.round DESC, c.forecaster LIMIT 120`)
          .all() as Record<string, number | string>[]
      ).map((r) => ({ round: r.round as number, t: r.t as number, forecaster: r.forecaster as string, tx: r.tx_hash as string, anchorTime: r.anchor_time as number })),
      oracle: {
        reports: posts.reports,
        txs: posts.txs,
        latest: latest.map((r) => ({ symbol: r.symbol as string, round: r.round as number, fairValue: num(r.fair_value as number), lower: num(r.lower as number), upper: num(r.upper as number), computedAt: r.computed_at as number, tx: r.tx_hash as string })),
      },
      sundayLoan: read<Record<string, unknown>>("deployments/sunday-loan.json"),
      agenticWalletTrades: read<unknown[]>("deployments/agentic-wallet-trades.json") ?? [],
      jobs: has("jobs")
        ? (this.db.prepare(`SELECT * FROM jobs ORDER BY anchor_time DESC, forecaster`).all() as Record<string, string | number | null>[]).map((j) => ({
            jobId: j.job_id as string,
            forecaster: j.forecaster as string,
            anchorTime: j.anchor_time as number,
            budget: j.budget as string,
            status: j.status as string,
            createTx: j.create_tx as string | null,
            fundTx: j.fund_tx as string | null,
            submitTx: j.submit_tx as string | null,
            verdict: j.verdict as string | null,
            judgeTx: j.judge_tx as string | null,
          }))
        : [],
      scores: (
        this.db.prepare(`SELECT anchor_time, forecaster, COUNT(*) n, AVG(crps) c, AVG(abs_err) e, AVG(covered) cov FROM scores GROUP BY anchor_time, forecaster ORDER BY anchor_time DESC, forecaster`).all() as Record<string, number | string>[]
      ).map((r) => ({ anchorTime: r.anchor_time as number, forecaster: r.forecaster as string, n: r.n as number, crpsBps: num((r.c as number) * 1e4, 2), maeBps: num((r.e as number) * 1e4, 2), coverage: num(r.cov as number, 4) })),
    };
  }

  /**
   * The Binance Web3 API as Nightshift uses it, read from the SDK's own telemetry (`dx_calls`, one row per logical
   * call with its retries folded in). A call our circuit breaker refused before sending (`circuit_open`) never
   * reached Binance: it is counted as `notSent` and in `codes`, never as a call. Latency is the nearest-rank p50/p95
   * (as the SDK's summarize()) over the last 24 h, or over all time for an endpoint with no call in the last 24 h.
   * No table yet → zero calls, with the SDK's coverage still listed.
   */
  stack(now = Date.now()) {
    const day = now - 86_400_000;
    const NOT_SENT = "circuit_open";
    const has = Boolean(this.db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dx_calls'`).get());
    type Row = { module: string; endpoint: string; method: string };
    const all = <T>(sql: string, ...args: (string | number)[]): T[] => (has ? (this.db.prepare(sql).all(...args) as T[]) : []);

    const outcomes = all<Row & { code: string; n: number; n24: number; first: number; last: number }>(
      `SELECT module, endpoint, method, COALESCE(api_code, 'HTTP ' || http_status, error_kind, 'unknown') code,
              COUNT(*) n, SUM(ts >= ?) n24, MIN(ts) first, MAX(ts) last
       FROM dx_calls GROUP BY 1, 2, 3, 4`,
      day,
    );
    const latencySql = (where: string) =>
      `SELECT module, endpoint, method, MIN(CASE WHEN rn >= n * 0.5 THEN latency_ms END) p50, MIN(CASE WHEN rn >= n * 0.95 THEN latency_ms END) p95
       FROM (SELECT module, endpoint, method, latency_ms,
                    ROW_NUMBER() OVER (PARTITION BY module, endpoint, method ORDER BY latency_ms) rn,
                    COUNT(*) OVER (PARTITION BY module, endpoint, method) n
             FROM dx_calls WHERE ${where} AND COALESCE(error_kind, '') <> '${NOT_SENT}')
       GROUP BY module, endpoint, method`;
    type Lat = Row & { p50: number; p95: number };
    const recent = all<Lat>(latencySql("ts >= ?"), day);
    // What Binance answered most recently, per endpoint. A module whose most recent call got a compliance code is
    // refused to this host, whatever its earlier traffic (or an endpoint it seldom calls) says.
    const latest = all<Row & { code: string }>(
      `SELECT module, endpoint, method, code FROM (
         SELECT module, endpoint, method, COALESCE(api_code, 'HTTP ' || http_status, error_kind, 'unknown') code,
                ROW_NUMBER() OVER (PARTITION BY module, endpoint, method ORDER BY ts DESC, id DESC) rn
         FROM dx_calls WHERE COALESCE(error_kind, '') <> '${NOT_SENT}')
       WHERE rn = 1`,
    );
    const drift = all<Row & { u: string; m: string }>(
      `SELECT module, endpoint, method, undocumented_fields u, missing_fields m FROM dx_calls
       WHERE undocumented_fields <> '[]' OR missing_fields <> '[]' GROUP BY 1, 2, 3, 4, 5`,
    );

    const key = (r: Row) => `${r.module} ${r.method} ${r.endpoint}`;
    interface Ep {
      endpoint: string;
      method: string;
      calls24h: number;
      callsAll: number;
      notSent: number;
      p50Ms: number | null;
      p95Ms: number | null;
      latencyWindow: "24h" | "all" | null;
      lastAt: number | null;
      lastCode: string | null;
      codes: Record<string, number>;
      drift: { undocumented: string[]; missing: string[] };
    }
    const eps = new Map<string, Ep & { module: string }>();
    for (const o of outcomes) {
      const e = eps.get(key(o)) ?? { module: o.module, endpoint: o.endpoint, method: o.method, calls24h: 0, callsAll: 0, notSent: 0, p50Ms: null, p95Ms: null, latencyWindow: null, lastAt: null, lastCode: null, codes: {}, drift: { undocumented: [], missing: [] } };
      eps.set(key(o), e);
      if (o.code === NOT_SENT) {
        e.notSent += o.n;
        continue;
      }
      e.callsAll += o.n;
      e.calls24h += o.n24;
      e.codes[o.code] = o.n;
      e.lastAt = Math.max(e.lastAt ?? 0, o.last);
    }
    const setLatency = (rows: Lat[], window: "24h" | "all") => {
      for (const l of rows) {
        const e = eps.get(key(l));
        if (e && l.p50 != null) Object.assign(e, { p50Ms: Math.round(l.p50), p95Ms: Math.round(l.p95), latencyWindow: window });
      }
    };
    setLatency(recent, "24h");
    // Endpoints quiet for a day (e.g. the swap and broadcast behind a real trade): all time, one indexed lookup each.
    for (const e of eps.values()) {
      if (e.calls24h === 0 && e.callsAll > 0) setLatency(all<Lat>(latencySql("module = ? AND endpoint = ? AND method = ?"), e.module, e.endpoint, e.method), "all");
    }
    for (const l of latest) {
      const e = eps.get(key(l));
      if (e) e.lastCode = l.code;
    }
    for (const d of drift) {
      const e = eps.get(key(d));
      if (!e) continue;
      e.drift.undocumented = [...new Set([...e.drift.undocumented, ...(JSON.parse(d.u) as string[])])].sort();
      e.drift.missing = [...new Set([...e.drift.missing, ...(JSON.parse(d.m) as string[])])].sort();
    }

    // Every SDK module, in the SDK's order, then anything the table has that the SDK doesn't (none today).
    const sdk = ENDPOINTS as unknown as Record<string, Record<string, { method: string; path: string }>>;
    const names = [...new Set([...Object.keys(sdk), ...[...eps.values()].map((e) => e.module)])];
    const modules = names.map((module) => {
      const endpoints = [...eps.values()].filter((e) => e.module === module).sort((a, b) => b.callsAll - a.callsAll || a.endpoint.localeCompare(b.endpoint));
      const lastAt = Math.max(0, ...endpoints.map((e) => e.lastAt ?? 0));
      const newest = endpoints.reduce<(typeof endpoints)[number] | null>((a, e) => ((e.lastAt ?? 0) > (a?.lastAt ?? 0) ? e : a), null);
      const refusedWith = newest?.lastCode != null && isCompliance(newest.lastCode, module) ? newest.lastCode : null;
      return {
        module,
        refusedWith,
        calls24h: endpoints.reduce((s, e) => s + e.calls24h, 0),
        callsAll: endpoints.reduce((s, e) => s + e.callsAll, 0),
        lastAt: lastAt || null,
        sdkEndpoints: Object.values(sdk[module] ?? {}).map((d) => ({ method: d.method, path: d.path })),
        endpoints: endpoints.map(({ module: _m, ...e }) => e),
      };
    });

    const byCode = new Map<string, { code: string; count: number; count24h: number; firstAt: number; lastAt: number; modules: Set<string> }>();
    for (const o of outcomes) {
      const c = byCode.get(o.code) ?? { code: o.code, count: 0, count24h: 0, firstAt: o.first, lastAt: o.last, modules: new Set<string>() };
      byCode.set(o.code, c);
      c.count += o.n;
      c.count24h += o.n24;
      c.firstAt = Math.min(c.firstAt, o.first);
      c.lastAt = Math.max(c.lastAt, o.last);
      c.modules.add(o.module);
    }
    const codes = [...byCode.values()]
      .sort((a, b) => b.count - a.count)
      .map((c) => {
        const modulesSeen = [...c.modules].sort();
        const note = noteFor(c.code, modulesSeen[0] ?? "");
        return { code: c.code, name: note.name, ok: OK_CODES.has(c.code), sent: c.code !== NOT_SENT, count: c.count, count24h: c.count24h, firstAt: c.firstAt, lastAt: c.lastAt, modules: modulesSeen, meaning: note.meaning, ourHandling: note.ourHandling };
      });

    const notSent = outcomes.filter((o) => o.code === NOT_SENT);
    const first = outcomes.length ? Math.min(...outcomes.map((o) => o.first)) : null;
    return {
      generatedAt: new Date(now).toISOString(),
      since: first,
      totalCalls: modules.reduce((s, m) => s + m.callsAll, 0),
      calls24h: modules.reduce((s, m) => s + m.calls24h, 0),
      notSent: { total: notSent.reduce((s, o) => s + o.n, 0), last24h: notSent.reduce((s, o) => s + o.n24, 0) },
      sdk: { modules: Object.keys(sdk).length, endpoints: Object.values(sdk).reduce((s, m) => s + Object.keys(m).length, 0) },
      modules,
      codes,
    };
  }

  /** Each scored open, per token: the forecaster's last pre-open forecast against the realized open (both per token). */
  opens(forecaster = "nfv") {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT s.anchor_time, f.symbol, s.ticker, s.realized_open * f.basis AS realized, f.fair_value, f.lower, f.upper, s.hours_to_open, s.crps, s.abs_err, s.covered,
                  ROW_NUMBER() OVER (PARTITION BY s.anchor_time, s.token ORDER BY s.round DESC) rn
           FROM scores s JOIN forecasts f ON f.round = s.round AND f.forecaster = s.forecaster AND f.token = s.token
           WHERE s.forecaster = ?
         ) WHERE rn = 1 ORDER BY anchor_time DESC, symbol`,
      )
      .all(forecaster) as Record<string, number | string>[];
    return rows.map((r) => ({
      anchorTime: r.anchor_time as number,
      symbol: r.symbol as string,
      ticker: r.ticker as string,
      realized: num(r.realized as number),
      fairValue: num(r.fair_value as number),
      lower: num(r.lower as number),
      upper: num(r.upper as number),
      hoursToOpen: num(r.hours_to_open as number, 2),
      crpsBps: num((r.crps as number) * 1e4, 2),
      errBps: num((r.abs_err as number) * 1e4, 2),
      covered: Boolean(r.covered),
    }));
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
    // research/out is the backtest's working output (gitignored); research/study-v2.json is the tracked copy deployments ship with.
    const path = ["research/out/study-v2.json", "research/study-v2.json"].find((p) => existsSync(p));
    const params = "packages/nfv/params/nfv-v2.json";
    return {
      methodology: "Strict leave-one-gap-out over every gap since bStocks listed (2026-06-11). CRPS and MAE in bps of price; coverage of the split-conformal 90% band.",
      results: path ? JSON.parse(readFileSync(path, "utf8")) : null,
      params: existsSync(params) ? JSON.parse(readFileSync(params, "utf8")) : null,
    };
  }
}
