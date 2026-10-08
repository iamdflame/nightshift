/**
 * The tape: an append-only record of every observation Nightshift makes, in SQLite (node:sqlite,
 * no native deps). Every forecast, oracle report and receipt is reproducible from these rows.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Instrument, Session, TopOfBook } from "@nightshift/core";

export const DEFAULT_DB_PATH = resolve(process.env.NIGHTSHIFT_DB ?? "data/tape.sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS instruments (
  chain_id TEXT NOT NULL, address TEXT NOT NULL, issuer TEXT NOT NULL, symbol TEXT NOT NULL,
  ticker TEXT NOT NULL, asset_type TEXT NOT NULL, multiplier REAL NOT NULL, decimals INTEGER NOT NULL,
  cex_symbol TEXT, updated_at INTEGER, seen_at INTEGER NOT NULL,
  PRIMARY KEY (chain_id, address)
);
CREATE INDEX IF NOT EXISTS instruments_ticker ON instruments(ticker);

CREATE TABLE IF NOT EXISTS multiplier_history (
  chain_id TEXT NOT NULL, address TEXT NOT NULL, ts INTEGER NOT NULL, multiplier REAL NOT NULL,
  PRIMARY KEY (chain_id, address, ts)
);

CREATE TABLE IF NOT EXISTS cex_book (
  ts INTEGER NOT NULL, symbol TEXT NOT NULL, bid REAL, ask REAL, bid_qty REAL, ask_qty REAL, session TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cex_book_sym_ts ON cex_book(symbol, ts);

CREATE TABLE IF NOT EXISTS cex_depth (
  ts INTEGER NOT NULL, symbol TEXT NOT NULL, bid REAL, ask REAL, bid_usd50 REAL, ask_usd50 REAL,
  micro_mid REAL, session TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cex_depth_sym_ts ON cex_depth(symbol, ts);

CREATE TABLE IF NOT EXISTS pool_snapshot (
  ts INTEGER NOT NULL, chain_id TEXT NOT NULL, dex_id TEXT NOT NULL, pair TEXT NOT NULL,
  base_address TEXT NOT NULL, base_symbol TEXT, quote_symbol TEXT, price_usd REAL,
  liquidity_usd REAL, volume24h REAL, session TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pool_snapshot_base_ts ON pool_snapshot(base_address, ts);

CREATE TABLE IF NOT EXISTS ref_quote (
  ts INTEGER NOT NULL, ticker TEXT NOT NULL, price REAL, price_time INTEGER, regular_price REAL,
  regular_time INTEGER, prev_close REAL, session TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ref_quote_ticker_ts ON ref_quote(ticker, ts);

CREATE TABLE IF NOT EXISTS klines (
  symbol TEXT NOT NULL, interval TEXT NOT NULL, open_time INTEGER NOT NULL,
  open REAL, high REAL, low REAL, close REAL, volume REAL, quote_volume REAL, trades INTEGER,
  PRIMARY KEY (symbol, interval, open_time)
);

CREATE TABLE IF NOT EXISTS ref_bars (
  ticker TEXT NOT NULL, interval TEXT NOT NULL, ts INTEGER NOT NULL,
  open REAL, high REAL, low REAL, close REAL, volume REAL, source TEXT NOT NULL,
  PRIMARY KEY (ticker, interval, ts)
);

CREATE TABLE IF NOT EXISTS events (
  ts INTEGER NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL
);
`;

export class Tape {
  readonly db: DatabaseSync;
  private readonly stmts: Record<string, StatementSync>;

  constructor(path = DEFAULT_DB_PATH) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
    this.db.exec(SCHEMA);
    this.stmts = {
      instrument: this.db.prepare(`INSERT INTO instruments VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(chain_id, address) DO UPDATE SET issuer=excluded.issuer, symbol=excluded.symbol,
        ticker=excluded.ticker, asset_type=excluded.asset_type, multiplier=excluded.multiplier,
        decimals=excluded.decimals, cex_symbol=excluded.cex_symbol, updated_at=excluded.updated_at,
        seen_at=excluded.seen_at`),
      multiplier: this.db.prepare(`INSERT OR IGNORE INTO multiplier_history VALUES (?,?,?,?)`),
      book: this.db.prepare(`INSERT INTO cex_book VALUES (?,?,?,?,?,?,?)`),
      depth: this.db.prepare(`INSERT INTO cex_depth VALUES (?,?,?,?,?,?,?,?)`),
      pool: this.db.prepare(`INSERT INTO pool_snapshot VALUES (?,?,?,?,?,?,?,?,?,?,?)`),
      ref: this.db.prepare(`INSERT INTO ref_quote VALUES (?,?,?,?,?,?,?,?,?)`),
      kline: this.db.prepare(`INSERT OR REPLACE INTO klines VALUES (?,?,?,?,?,?,?,?,?,?)`),
      refBar: this.db.prepare(`INSERT OR REPLACE INTO ref_bars VALUES (?,?,?,?,?,?,?,?,?)`),
      event: this.db.prepare(`INSERT INTO events VALUES (?,?,?,?)`),
    };
  }

  tx<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  upsertInstruments(list: Instrument[], now = Date.now()): void {
    this.tx(() => {
      for (const i of list) {
        this.stmts.instrument!.run(i.chainId, i.address, i.issuer, i.symbol, i.ticker, i.assetType, i.multiplier, i.decimals, i.cexSymbol, i.updatedAt, now);
        // Multipliers move with dividends and corporate actions; keep their history for share-equivalent math.
        this.stmts.multiplier!.run(i.chainId, i.address, i.updatedAt ?? now, i.multiplier);
      }
    });
  }

  instruments(filter: { chainId?: string; issuer?: string } = {}): Instrument[] {
    const rows = this.db
      .prepare(`SELECT * FROM instruments WHERE (?1 IS NULL OR chain_id = ?1) AND (?2 IS NULL OR issuer = ?2)`)
      .all(filter.chainId ?? null, filter.issuer ?? null) as Record<string, unknown>[];
    return rows.map((r) => ({
      issuer: r.issuer as Instrument["issuer"],
      chainId: r.chain_id as string,
      address: r.address as string,
      symbol: r.symbol as string,
      ticker: r.ticker as string,
      assetType: r.asset_type as Instrument["assetType"],
      multiplier: r.multiplier as number,
      decimals: r.decimals as number,
      cexSymbol: (r.cex_symbol as string | null) ?? null,
      updatedAt: (r.updated_at as number | null) ?? null,
    }));
  }

  insertBooks(books: Map<string, TopOfBook>, session: Session): void {
    this.tx(() => {
      for (const [symbol, b] of books) this.stmts.book!.run(b.ts, symbol, b.bid, b.ask, b.bidQty, b.askQty, session);
    });
  }

  insertDepth(symbol: string, d: { ts: number; bid: number; ask: number; bidUsd50: number; askUsd50: number; microMid: number }, session: Session): void {
    this.stmts.depth!.run(d.ts, symbol, d.bid, d.ask, d.bidUsd50, d.askUsd50, d.microMid, session);
  }

  insertPools(pools: { ts: number; chainId: string; dexId: string; pairAddress: string; baseAddress: string; baseSymbol: string; quoteSymbol: string; priceUsd: number; liquidityUsd: number; volume24h: number }[], session: Session): void {
    this.tx(() => {
      for (const p of pools) {
        this.stmts.pool!.run(p.ts, p.chainId, p.dexId, p.pairAddress, p.baseAddress, p.baseSymbol, p.quoteSymbol, p.priceUsd, p.liquidityUsd, p.volume24h, session);
      }
    });
  }

  insertRef(row: { ts: number; ticker: string; price: number | null; priceTime: number | null; regularPrice: number | null; regularTime: number | null; prevClose: number | null; session: Session; source: string }): void {
    this.stmts.ref!.run(row.ts, row.ticker, row.price, row.priceTime, row.regularPrice, row.regularTime, row.prevClose, row.session, row.source);
  }

  upsertKlines(symbol: string, interval: string, rows: readonly (readonly number[])[]): void {
    this.tx(() => {
      for (const k of rows) this.stmts.kline!.run(symbol, interval, k[0]!, k[1]!, k[2]!, k[3]!, k[4]!, k[5]!, k[7]!, k[8]!);
    });
  }

  upsertRefBars(ticker: string, interval: string, bars: { ts: number; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null }[], source: string): void {
    this.tx(() => {
      for (const b of bars) {
        if (b.close == null) continue;
        this.stmts.refBar!.run(ticker, interval, b.ts, b.open, b.high, b.low, b.close, b.volume, source);
      }
    });
  }

  log(level: "info" | "warn" | "error", source: string, message: string): void {
    const line = `${new Date().toISOString()} ${level.toUpperCase()} [${source}] ${message}`;
    (level === "error" ? console.error : console.log)(line);
    try {
      this.stmts.event!.run(Date.now(), level, source, message.slice(0, 2000));
    } catch {
      /* logging must never take the collector down */
    }
  }
}
