/**
 * One-container runtime for hosts that run a single service per volume (Railway): restores the agent
 * keystores, optionally receives the existing database once, then supervises the collector, the Night
 * Shift runner and the API (on $PORT), restarting any process that exits.
 *
 *   pnpm exec tsx deploy/railway/start.ts
 *
 * Environment (set in the host's variables; produced by deploy/railway/make-env.ts):
 *   NIGHTSHIFT_KEYS_B64       base64 JSON {filename: content} of keys/ (encrypted keystores + roles.json)
 *   NIGHTSHIFT_KEY_PASSWORD   unlocks them (never in the image, never logged)
 *   NIGHTSHIFT_DB             database path on the attached volume (default /app/data/tape.sqlite)
 *   NIGHTSHIFT_IMPORT_TOKEN   if set and no database exists yet: wait for PUT /_import (gzip body, bearer token)
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { timingSafeEqual } from "node:crypto";
import { createGunzip } from "node:zlib";

const DB = process.env.NIGHTSHIFT_DB ?? "/app/data/tape.sqlite";
const PORT = Number(process.env.PORT ?? 8787);
const log = (m: string) => console.log(`${new Date().toISOString()} [start] ${m}`);

function restoreKeys(): void {
  const b64 = process.env.NIGHTSHIFT_KEYS_B64;
  if (!b64 || existsSync("keys/roles.json")) return;
  const files = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, string>;
  mkdirSync("keys", { recursive: true, mode: 0o700 });
  for (const [name, content] of Object.entries(files)) {
    if (!/^[\w.-]+$/.test(name)) throw new Error(`refusing keystore file name ${JSON.stringify(name)}`);
    writeFileSync(`keys/${name}`, content, { mode: 0o600 });
  }
  log(`restored ${Object.keys(files).length} keystore files`);
}

/** Serve PUT /_import until a valid database arrives (everything else: 503 while bootstrapping). */
async function awaitImport(token: string): Promise<void> {
  mkdirSync(dirname(DB), { recursive: true });
  const expected = Buffer.from(`Bearer ${token}`);
  await new Promise<void>((resolve) => {
    const server = createServer(async (req, res) => {
      const auth = Buffer.from(String(req.headers.authorization ?? ""));
      const authorized = auth.length === expected.length && timingSafeEqual(auth, expected);
      if (req.method !== "PUT" || req.url !== "/_import" || !authorized) {
        res.writeHead(req.url === "/_import" ? 401 : 503, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, status: "bootstrapping: waiting for the database import" }));
        return;
      }
      const partial = `${DB}.partial`;
      try {
        await pipeline(req, createGunzip(), createWriteStream(partial));
        const check = new DatabaseSync(partial, { readOnly: true });
        const ok = (check.prepare("PRAGMA quick_check").get() as { quick_check: string }).quick_check;
        const rounds = (check.prepare("SELECT COUNT(*) n FROM rounds").get() as { n: number }).n;
        check.close();
        if (ok !== "ok") throw new Error(`quick_check: ${ok}`);
        renameSync(partial, DB);
        log(`database imported: ${(statSync(DB).size / 1e6).toFixed(1)} MB, ${rounds} rounds`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, bytes: statSync(DB).size, rounds }));
        server.close(() => resolve());
      } catch (e) {
        rmSync(partial, { force: true });
        log(`import rejected: ${(e as Error).message}`);
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
      }
    });
    server.listen(PORT, "0.0.0.0", () => log(`no database at ${DB}: waiting for PUT /_import on :${PORT}`));
  });
}

const children = new Map<string, ChildProcess>();
let stopping = false;

function supervise(name: string, script: string): void {
  const run = () => {
    const child = spawn(process.execPath, ["--import", "tsx", script], { stdio: ["ignore", "inherit", "inherit"], env: process.env });
    children.set(name, child);
    child.on("exit", (code, signal) => {
      children.delete(name);
      if (stopping) return;
      log(`${name} exited (${signal ?? code}); restarting in 10 s`);
      setTimeout(run, 10_000);
    });
  };
  run();
}

restoreKeys();
const token = process.env.NIGHTSHIFT_IMPORT_TOKEN;
if (token && !existsSync(DB)) await awaitImport(token);

supervise("collector", "packages/tape/src/main.ts");
supervise("night-shift", "packages/network/src/runner.ts");
supervise("api", "packages/api/src/server.ts");

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    stopping = true;
    log(`${sig}: stopping ${children.size} processes`);
    for (const c of children.values()) c.kill("SIGTERM");
    setTimeout(() => process.exit(0), 8_000).unref();
  });
}
