/**
 * Copies the live database to the Railway service while it waits in bootstrap mode: a consistent snapshot
 * (VACUUM INTO, safe while the collector writes), gzip-streamed to PUT <url>/_import with the import token.
 *
 *   pnpm exec tsx deploy/railway/push-db.ts https://<service>.up.railway.app
 */
import { createReadStream, readFileSync, rmSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";

const url = process.argv[2]?.replace(/\/+$/, "");
if (!url?.startsWith("https://")) throw new Error("usage: push-db.ts https://<service>.up.railway.app");
const token = readFileSync("deploy/railway/railway.env", "utf8").match(/^NIGHTSHIFT_IMPORT_TOKEN=(.+)$/m)?.[1];
if (!token) throw new Error("run deploy/railway/make-env.ts first");

const SNAP = "data/railway-snapshot.sqlite";
rmSync(SNAP, { force: true });
const db = new DatabaseSync(process.env.NIGHTSHIFT_DB ?? "data/tape.sqlite", { readOnly: true });
db.exec(`VACUUM INTO '${SNAP}'`);
db.close();
console.log(`snapshot ${(statSync(SNAP).size / 1e6).toFixed(1)} MB → gzip → ${url}/_import`);

const t0 = Date.now();
const body = Readable.toWeb(createReadStream(SNAP).pipe(createGzip({ level: 6 }))) as ReadableStream;
const res = await fetch(`${url}/_import`, { method: "PUT", headers: { authorization: `Bearer ${token}` }, body, duplex: "half" } as RequestInit);
console.log(`${res.status} ${await res.text()} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
rmSync(SNAP, { force: true });
if (!res.ok) process.exit(1);
