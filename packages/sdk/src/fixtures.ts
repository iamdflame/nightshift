/**
 * Record/replay. `BINANCE_WEB3_MODE=live|record|replay`:
 *  - live:   normal network calls.
 *  - record: live calls, and every final response (success or API error) is written to
 *            packages/sdk/fixtures/<module>/<METHOD>_<path>_<hash>.json
 *  - replay: no network at all; responses come from fixtures (a miss is a typed error).
 *
 * Fixture key = sha256(method + path + canonical query + raw body). Request headers are never
 * stored, so API keys, timestamps and X-OC-SIGN signatures cannot leak; request/response bodies are
 * redacted for signature-/credential-like fields before writing.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModuleName } from "./errors.ts";
import type { Mode } from "./telemetry.ts";

export const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL("../fixtures/", import.meta.url));

export function resolveMode(value: string | undefined = process.env.BINANCE_WEB3_MODE): Mode {
  const v = (value ?? "live").trim().toLowerCase();
  if (v === "" || v === "live") return "live";
  if (v === "record" || v === "replay") return v;
  throw new Error(`BINANCE_WEB3_MODE must be live|record|replay, got "${value}"`);
}

export interface FixtureRequest {
  method: string;
  /** Expanded path without the /build prefix. */
  path: string;
  /** Raw query string as sent (no leading "?"). */
  query: string;
  /** Raw body as sent ("" for none). */
  body: string;
}

export interface FixtureResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface Fixture {
  version: 1;
  key: string;
  module: ModuleName;
  endpointId: string;
  recordedAt: string;
  request: { method: string; path: string; query: string; bodySha256: string | null; body?: unknown };
  response: FixtureResponse;
}

/** Response headers worth keeping (everything else is dropped). */
export const KEPT_HEADERS = [
  "content-type",
  "date",
  "retry-after",
  "location",
  "x-oc-trace-id",
  "x-oc-blocked-by",
  "x-oc-ratelimit-limit",
  "x-oc-ratelimit-remaining",
  "x-oc-used-weight",
  "x-amzn-waf-action",
] as const;

const SENSITIVE = /^(signature|usersignature|signedtransaction|token|apikey|api_key|secret|secretkey|privatekey|mnemonic|seed|authorization|x-oc-sign|x-oc-apikey)$/i;

export function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) && v !== null && v !== "" ? "[redacted]" : redactJson(v)]));
  }
  return value;
}

export function redactBodyText(text: string): string {
  if (!text) return text;
  try {
    return JSON.stringify(redactJson(JSON.parse(text)));
  } catch {
    return text;
  }
}

export function canonicalQuery(query: string): string {
  return query ? query.split("&").sort().join("&") : "";
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function fixtureKey(req: FixtureRequest): string {
  return sha256(`${req.method.toUpperCase()} ${req.path}?${canonicalQuery(req.query)}\n${req.body}`).slice(0, 16);
}

export class FixtureStore {
  constructor(readonly dir: string = process.env.BINANCE_WEB3_FIXTURES_DIR ?? DEFAULT_FIXTURES_DIR) {}

  file(module: ModuleName, req: FixtureRequest): string {
    const slug = req.path.replace(/^\/+/, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^api_v\d+_/, "").slice(0, 80);
    return join(this.dir, module, `${req.method.toUpperCase()}_${slug}_${fixtureKey(req)}.json`);
  }

  read(module: ModuleName, req: FixtureRequest): Fixture | null {
    try {
      return JSON.parse(readFileSync(this.file(module, req), "utf8")) as Fixture;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  write(module: ModuleName, endpointId: string, req: FixtureRequest, res: FixtureResponse): string {
    const path = this.file(module, req);
    let body: unknown;
    if (req.body) {
      try {
        body = redactJson(JSON.parse(req.body));
      } catch {
        body = "[non-JSON body omitted]";
      }
    }
    const keep = new Set<string>(KEPT_HEADERS);
    const fixture: Fixture = {
      version: 1,
      key: fixtureKey(req),
      module,
      endpointId,
      recordedAt: new Date().toISOString(),
      request: { method: req.method.toUpperCase(), path: req.path, query: req.query, bodySha256: req.body ? sha256(req.body) : null, ...(body === undefined ? {} : { body }) },
      response: {
        status: res.status,
        headers: Object.fromEntries(Object.entries(res.headers).filter(([k]) => keep.has(k.toLowerCase()))),
        body: redactBodyText(res.body),
      },
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
    return path;
  }
}
