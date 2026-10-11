/**
 * Sets every variable in deploy/railway/railway.env on the linked Railway service, value via stdin (never argv,
 * never printed), without triggering a deploy per variable.
 *
 *   pnpm exec tsx deploy/railway/push-env.ts [--only KEY,KEY]
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const only = process.argv.includes("--only") ? new Set(process.argv[process.argv.indexOf("--only") + 1]!.split(",")) : null;
const lines = readFileSync("deploy/railway/railway.env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l));
for (const line of lines) {
  const i = line.indexOf("=");
  const key = line.slice(0, i);
  if (only && !only.has(key)) continue;
  const r = spawnSync("railway", ["variable", "set", key, "--stdin", "--skip-deploys", "--service", "nightshift"], { input: line.slice(i + 1), encoding: "utf8", shell: process.platform === "win32" });
  console.log(`${key.padEnd(26)} ${r.status === 0 ? "set" : `FAILED: ${(r.stderr || r.stdout).split("\n")[0]}`}`);
}
