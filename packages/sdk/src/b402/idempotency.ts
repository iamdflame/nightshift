/**
 * Settlement idempotency, keyed by the signed authorization (and indexed by tx hash), as the B402
 * guide recommends: "Persist settlement results using the signed authorization or transaction hash
 * as an idempotency key." Prevents double delivery for a replayed PAYMENT-SIGNATURE and lets an
 * ambiguous settle be retried safely (B402 settle is idempotent per signed authorization).
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { defaultDbPath } from "../sqlite-sink.ts";
import type { SettlementResponse } from "./types.ts";

export type PaymentState = "settling" | "settled" | "reconcile" | "failed";

export interface PaymentRecord {
  key: string;
  state: PaymentState;
  txHash?: string;
  settlement?: SettlementResponse;
  resource?: string;
  reason?: string;
  updatedAt: number;
}

export interface IdempotencyStore {
  get(key: string): PaymentRecord | undefined | Promise<PaymentRecord | undefined>;
  put(record: PaymentRecord): void | Promise<void>;
  byTxHash?(txHash: string): PaymentRecord | undefined | Promise<PaymentRecord | undefined>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, PaymentRecord>();
  constructor(
    private readonly ttlMs = 7 * 24 * 3600_000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): PaymentRecord | undefined {
    const r = this.map.get(key);
    if (r && this.now() - r.updatedAt > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return r;
  }

  put(record: PaymentRecord): void {
    this.map.set(record.key, record);
  }

  byTxHash(txHash: string): PaymentRecord | undefined {
    const h = txHash.toLowerCase();
    for (const r of this.map.values()) if (r.txHash?.toLowerCase() === h) return r;
    return undefined;
  }
}

/** Durable store in the same SQLite file as the tape (table `b402_payments`). */
export class SqliteIdempotencyStore implements IdempotencyStore {
  readonly db: DatabaseSync;
  private readonly upsert: StatementSync;
  private readonly select: StatementSync;
  private readonly selectTx: StatementSync;

  constructor(target: string | DatabaseSync = defaultDbPath()) {
    if (typeof target === "string") {
      mkdirSync(dirname(target), { recursive: true });
      this.db = new DatabaseSync(target);
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    } else this.db = target;
    this.db.exec(`CREATE TABLE IF NOT EXISTS b402_payments (
      key TEXT PRIMARY KEY, state TEXT NOT NULL, tx_hash TEXT, settlement TEXT, resource TEXT, reason TEXT, updated_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS b402_payments_tx ON b402_payments(tx_hash);`);
    this.upsert = this.db.prepare(`INSERT INTO b402_payments VALUES (?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET state=excluded.state,
      tx_hash=COALESCE(excluded.tx_hash, b402_payments.tx_hash), settlement=COALESCE(excluded.settlement, b402_payments.settlement),
      resource=COALESCE(excluded.resource, b402_payments.resource), reason=excluded.reason, updated_at=excluded.updated_at`);
    this.select = this.db.prepare(`SELECT * FROM b402_payments WHERE key = ?`);
    this.selectTx = this.db.prepare(`SELECT * FROM b402_payments WHERE lower(tx_hash) = lower(?) LIMIT 1`);
  }

  private static row(r: Record<string, unknown> | undefined): PaymentRecord | undefined {
    if (!r) return undefined;
    return {
      key: r.key as string,
      state: r.state as PaymentState,
      txHash: (r.tx_hash as string | null) ?? undefined,
      settlement: r.settlement ? (JSON.parse(r.settlement as string) as SettlementResponse) : undefined,
      resource: (r.resource as string | null) ?? undefined,
      reason: (r.reason as string | null) ?? undefined,
      updatedAt: r.updated_at as number,
    };
  }

  get(key: string): PaymentRecord | undefined {
    return SqliteIdempotencyStore.row(this.select.get(key) as Record<string, unknown> | undefined);
  }

  put(rec: PaymentRecord): void {
    this.upsert.run(rec.key, rec.state, rec.txHash ?? null, rec.settlement ? JSON.stringify(rec.settlement) : null, rec.resource ?? null, rec.reason ?? null, rec.updatedAt);
  }

  byTxHash(txHash: string): PaymentRecord | undefined {
    return SqliteIdempotencyStore.row(this.selectTx.get(txHash) as Record<string, unknown> | undefined);
  }
}
