/** Minimal .env loader (no dependency): fills process.env from the repo's .env without overriding. */
import { existsSync, readFileSync } from "node:fs";

export function loadEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && m[2] && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2];
  }
}
