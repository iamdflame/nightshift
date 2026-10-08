/**
 * Telemetry: one CallRecord per logical call (retries folded in). This is the raw material for the
 * Developer Experience Report — latency, retries, error codes and doc drift, measured as we go.
 * Sinks must never break the call path: every sink call is isolated.
 */
import type { ErrorKind, ModuleName } from "./errors.ts";

export type Mode = "live" | "record" | "replay";

export interface CallRecord {
  /** Epoch ms when the call started. */
  ts: number;
  module: ModuleName;
  /** Path template, e.g. /api/v1/dex/aggregator/order/{orderId} (no /build prefix). */
  endpoint: string;
  method: string;
  httpStatus: number | null;
  /** Envelope code as a string ("0", "40367", "000000000"); null if none. */
  apiCode: string | null;
  latencyMs: number;
  retries: number;
  requestBytes: number;
  responseBytes: number;
  requestId?: string;
  error?: string;
  undocumentedFields: string[];
  missingFields: string[];
  // --- extensions ---
  endpointId?: string;
  errorKind?: ErrorKind;
  schemaIssues?: string[];
  mode?: Mode;
  clockOffsetMs?: number;
  rateLimitWaitMs?: number;
  rateLimitRemaining?: number | null;
}

export interface TelemetrySink {
  record(r: CallRecord): void | Promise<void>;
  close?(): void;
}

export class MemorySink implements TelemetrySink {
  readonly records: CallRecord[] = [];
  record(r: CallRecord): void {
    this.records.push(r);
  }
}

export class ConsoleSink implements TelemetrySink {
  constructor(private readonly log: (line: string) => void = (l) => console.log(l)) {}
  record(r: CallRecord): void {
    const drift = r.undocumentedFields.length || r.missingFields.length ? ` drift(+${r.undocumentedFields.length}/-${r.missingFields.length})` : "";
    const err = r.error ? ` ERR ${r.errorKind ?? ""} ${r.error}` : "";
    this.log(`[dx] ${r.method} ${r.endpoint} http=${r.httpStatus ?? "-"} code=${r.apiCode ?? "-"} ${Math.round(r.latencyMs)}ms r=${r.retries}${drift}${err}`);
  }
}

/** Fan out to several sinks; a failing sink is reported once and never propagates. */
export function emit(sinks: readonly TelemetrySink[], r: CallRecord, onError?: (e: unknown) => void): void {
  for (const s of sinks) {
    try {
      const p = s.record(r);
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch((e) => onError?.(e));
    } catch (e) {
      onError?.(e);
    }
  }
}

export interface EndpointStats {
  module: string;
  method: string;
  endpoint: string;
  calls: number;
  errors: number;
  retries: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  codes: Record<string, number>;
  undocumentedFields: string[];
  missingFields: string[];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

/** Aggregate records per endpoint (latency quantiles, error/code counts, union of drift paths). */
export function summarize(records: readonly CallRecord[]): EndpointStats[] {
  const groups = new Map<string, CallRecord[]>();
  for (const r of records) {
    const k = `${r.method} ${r.endpoint}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  return [...groups.values()].map((rs) => {
    const lat = rs.map((r) => r.latencyMs).sort((a, b) => a - b);
    const codes: Record<string, number> = {};
    for (const r of rs) {
      const key = r.apiCode ?? (r.httpStatus === null ? "network" : `http${r.httpStatus}`);
      codes[key] = (codes[key] ?? 0) + 1;
    }
    return {
      module: rs[0]!.module,
      method: rs[0]!.method,
      endpoint: rs[0]!.endpoint,
      calls: rs.length,
      errors: rs.filter((r) => r.error).length,
      retries: rs.reduce((s, r) => s + r.retries, 0),
      p50Ms: quantile(lat, 0.5),
      p95Ms: quantile(lat, 0.95),
      maxMs: lat[lat.length - 1] ?? Number.NaN,
      codes,
      undocumentedFields: [...new Set(rs.flatMap((r) => r.undocumentedFields))].sort(),
      missingFields: [...new Set(rs.flatMap((r) => r.missingFields))].sort(),
    };
  });
}
