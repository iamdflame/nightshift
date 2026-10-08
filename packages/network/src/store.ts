/**
 * Network state lives in the same SQLite file as the tape, so every forecast, commitment, score
 * and consensus report is reproducible from the raw observations next to it.
 */
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_DB_PATH } from "@nightshift/tape";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rounds (
  round INTEGER PRIMARY KEY, ts INTEGER NOT NULL, session TEXT NOT NULL, state TEXT NOT NULL,
  anchor_time INTEGER NOT NULL, n_tokens INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS forecasts (
  round INTEGER NOT NULL, forecaster TEXT NOT NULL, token TEXT NOT NULL, symbol TEXT NOT NULL, ticker TEXT NOT NULL,
  state TEXT NOT NULL, anchor_time INTEGER NOT NULL, last_close REAL NOT NULL, basis REAL NOT NULL,
  token_price REAL NOT NULL, move REAL NOT NULL, mu REAL NOT NULL, sigma REAL NOT NULL, nu REAL NOT NULL,
  fair_value REAL NOT NULL, lower REAL NOT NULL, upper REAL NOT NULL, flags INTEGER NOT NULL,
  leaf TEXT NOT NULL,
  PRIMARY KEY (round, forecaster, token)
);
CREATE INDEX IF NOT EXISTS forecasts_anchor ON forecasts(anchor_time);
CREATE TABLE IF NOT EXISTS commitments (
  round INTEGER NOT NULL, forecaster TEXT NOT NULL, root TEXT NOT NULL, count INTEGER NOT NULL,
  anchor_time INTEGER NOT NULL, created_at INTEGER NOT NULL, chain_status TEXT NOT NULL DEFAULT 'local',
  tx_hash TEXT, PRIMARY KEY (round, forecaster)
);
CREATE TABLE IF NOT EXISTS scores (
  round INTEGER NOT NULL, forecaster TEXT NOT NULL, token TEXT NOT NULL, ticker TEXT NOT NULL,
  state TEXT NOT NULL, anchor_time INTEGER NOT NULL, hours_to_open REAL NOT NULL, realized_open REAL NOT NULL,
  realized_gap REAL NOT NULL, crps REAL NOT NULL, abs_err REAL NOT NULL, covered INTEGER NOT NULL,
  scored_at INTEGER NOT NULL, PRIMARY KEY (round, forecaster, token)
);
CREATE TABLE IF NOT EXISTS consensus (
  round INTEGER NOT NULL, token TEXT NOT NULL, symbol TEXT NOT NULL, ticker TEXT NOT NULL,
  session TEXT NOT NULL, state TEXT NOT NULL, anchor_time INTEGER NOT NULL, fair_value REAL NOT NULL,
  lower REAL NOT NULL, upper REAL NOT NULL, flags INTEGER NOT NULL, weights TEXT NOT NULL,
  computed_at INTEGER NOT NULL, chain_status TEXT NOT NULL DEFAULT 'local', tx_hash TEXT,
  PRIMARY KEY (round, token)
);
`;

export function openNetworkDb(path = DEFAULT_DB_PATH): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
  db.exec(SCHEMA);
  return db;
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
