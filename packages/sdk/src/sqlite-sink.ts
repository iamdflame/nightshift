/**
 * SQLite telemetry sink: appends CallRecords to `dx_calls` in the same database file the tape uses
 * (NIGHTSHIFT_DB or data/tape.sqlite). The table is created here, inside the SDK; the tape package
 * is untouched and both coexist in one WAL-mode file.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { type CallRecord, type EndpointStats, type TelemetrySink, summarize } from "./telemetry.ts";

export function defaultDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.NIGHTSHIFT_DB ?? "data/tape.sqlite");
}

export const DX_CALLS_SCHEMA = `
CREATE TABLE IF NOT EXISTS dx_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  module TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  http_status INTEGER,
  api_code TEXT,
  latency_ms REAL NOT NULL,
  retries INTEGER NOT NULL,
  request_bytes INTEGER NOT NULL,
  response_bytes INTEGER NOT NULL,
  request_id TEXT,
  error TEXT,
  error_kind TEXT,
  undocumented_fields TEXT NOT NULL,
  missing_fields TEXT NOT NULL,
  schema_issues TEXT,
  mode TEXT,
  clock_offset_ms REAL,
  ratelimit_wait_ms REAL,
  ratelimit_remaining INTEGER
);
CREATE INDEX IF NOT EXISTS dx_calls_endpoint_ts ON dx_calls(endpoint, ts);
CREATE INDEX IF NOT EXISTS dx_calls_ts ON dx_calls(ts);
`;

export class SqliteTelemetrySink implements TelemetrySink {
  readonly db: DatabaseSync;
  private readonly insert: StatementSync;
  private readonly owned: boolean;

  constructor(target: string | DatabaseSync = defaultDbPath()) {
    if (typeof target === "string") {
      mkdirSync(dirname(target), { recursive: true });
      this.db = new DatabaseSync(target);
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
      this.owned = true;
    } else {
      this.db = target;
      this.owned = false;
    }
    this.db.exec(DX_CALLS_SCHEMA);
    this.insert = this.db.prepare(`INSERT INTO dx_calls (ts, module, endpoint, method, http_status, api_code, latency_ms, retries,
      request_bytes, response_bytes, request_id, error, error_kind, undocumented_fields, missing_fields, schema_issues, mode,
      clock_offset_ms, ratelimit_wait_ms, ratelimit_remaining) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  }

  record(r: CallRecord): void {
    this.insert.run(
      r.ts,
      r.module,
      r.endpoint,
      r.method,
      r.httpStatus,
      r.apiCode,
      r.latencyMs,
      r.retries,
      r.requestBytes,
      r.responseBytes,
      r.requestId ?? null,
      r.error ?? null,
      r.errorKind ?? null,
      JSON.stringify(r.undocumentedFields),
      JSON.stringify(r.missingFields),
      r.schemaIssues?.length ? JSON.stringify(r.schemaIssues) : null,
      r.mode ?? null,
      r.clockOffsetMs ?? null,
      r.rateLimitWaitMs ?? null,
      r.rateLimitRemaining ?? null,
    );
  }

  /** Read back records (optionally since `sinceTs`) for reporting. */
  records(sinceTs = 0): CallRecord[] {
    const rows = this.db.prepare(`SELECT * FROM dx_calls WHERE ts >= ? ORDER BY ts`).all(sinceTs) as Record<string, unknown>[];
    return rows.map((row) => ({
      ts: row.ts as number,
      module: row.module as CallRecord["module"],
      endpoint: row.endpoint as string,
      method: row.method as string,
      httpStatus: (row.http_status as number | null) ?? null,
      apiCode: (row.api_code as string | null) ?? null,
      latencyMs: row.latency_ms as number,
      retries: row.retries as number,
      requestBytes: row.request_bytes as number,
      responseBytes: row.response_bytes as number,
      requestId: (row.request_id as string | null) ?? undefined,
      error: (row.error as string | null) ?? undefined,
      errorKind: (row.error_kind as CallRecord["errorKind"] | null) ?? undefined,
      undocumentedFields: JSON.parse(row.undocumented_fields as string) as string[],
      missingFields: JSON.parse(row.missing_fields as string) as string[],
      schemaIssues: row.schema_issues ? (JSON.parse(row.schema_issues as string) as string[]) : undefined,
      mode: (row.mode as CallRecord["mode"] | null) ?? undefined,
    }));
  }

  summary(sinceTs = 0): EndpointStats[] {
    return summarize(this.records(sinceTs));
  }

  close(): void {
    if (this.owned) this.db.close();
  }
}
