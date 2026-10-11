/**
 * Writes deploy/railway/railway.env (gitignored): every variable the Railway service needs, ready to paste
 * into Variables → Raw Editor. Secrets are read from .env and keys/ and written only to that file; this
 * script prints names and sizes, never values.
 *
 *   pnpm exec tsx deploy/railway/make-env.ts [--public-url https://<service>.up.railway.app]
 */
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env");
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} missing from .env`);
  return v;
};

const keys: Record<string, string> = {};
for (const f of readdirSync("keys")) if (f.endsWith(".json")) keys[f] = readFileSync(`keys/${f}`, "utf8");
if (!keys["roles.json"]) throw new Error("keys/roles.json missing");

const OUT = "deploy/railway/railway.env";
const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
const importToken = prev.match(/^NIGHTSHIFT_IMPORT_TOKEN=(.+)$/m)?.[1] ?? randomBytes(24).toString("hex");
const publicUrl = arg("--public-url") ?? prev.match(/^NIGHTSHIFT_PUBLIC_URL=(.+)$/m)?.[1] ?? "";

const vars: Record<string, string> = {
  NODE_ENV: "production",
  NIGHTSHIFT_DB: "/app/data/tape.sqlite",
  BSC_RPC_URL: process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org",
  BINANCE_WEB3_API_KEY: need("BINANCE_WEB3_API_KEY"),
  BINANCE_WEB3_SECRET_KEY: need("BINANCE_WEB3_SECRET_KEY"),
  NIGHTSHIFT_KEY_PASSWORD: need("NIGHTSHIFT_KEY_PASSWORD"),
  NIGHTSHIFT_KEYS_B64: Buffer.from(JSON.stringify(keys)).toString("base64"),
  NIGHTSHIFT_IMPORT_TOKEN: importToken,
  // Publishing stays off until the cut-over: exactly one host may sign for the agent wallets.
  NIGHTSHIFT_CHAIN: "0",
  ...(publicUrl ? { NIGHTSHIFT_PUBLIC_URL: publicUrl } : {}),
};
writeFileSync(OUT, `${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n")}\n`, { mode: 0o600 });
console.log(`wrote ${OUT}:`);
for (const [k, v] of Object.entries(vars)) console.log(`  ${k.padEnd(26)} ${/KEY|SECRET|PASSWORD|TOKEN|B64/.test(k) ? `(${v.length} chars, hidden)` : v}`);
