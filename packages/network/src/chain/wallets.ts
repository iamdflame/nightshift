/**
 * Agent wallets for the Night Shift. Each role is a separate EOA with its own ERC-8004 identity:
 *   treasury   — funds forecasting jobs (ERC-8183 client), runs the Scorer, posts oracle reports
 *   anchor / echo / nfv — the forecasters (ERC-8183 providers; commit to ForecastBook)
 *   executor   — Nightshift Trade (best-execution swaps for users)
 * Keys are generated locally and stored only as encrypted keystores in keys/ (gitignored),
 * via @bnbagent/sdk's EVMWalletProvider. Only addresses are ever printed.
 */
import { EVMWalletProvider } from "@bnbagent/sdk";
import { generatePrivateKey } from "viem/accounts";

export const ROLES = ["treasury", "anchor", "echo", "nfv", "executor"] as const;
export type Role = (typeof ROLES)[number];
export const WALLETS_DIR = "keys";

function password(): string {
  const p = process.env.NIGHTSHIFT_KEY_PASSWORD;
  if (!p || p.length < 12) throw new Error("Set NIGHTSHIFT_KEY_PASSWORD (≥12 chars) in .env to create or unlock agent keystores");
  return p;
}

/** Load the role's wallet, creating (and persisting) it on first use. */
export function walletFor(role: Role): EVMWalletProvider {
  const index = loadIndex();
  const known = index[role];
  if (known && EVMWalletProvider.keystoreExists(known, WALLETS_DIR)) {
    return new EVMWalletProvider({ password: password(), address: known, walletsDir: WALLETS_DIR });
  }
  const w = new EVMWalletProvider({ password: password(), privateKey: generatePrivateKey(), persist: true, walletsDir: WALLETS_DIR });
  index[role] = w.address;
  saveIndex(index);
  return w;
}

import { existsSync, readFileSync, writeFileSync } from "node:fs";
const INDEX = `${WALLETS_DIR}/roles.json`;
function loadIndex(): Partial<Record<Role, string>> {
  return existsSync(INDEX) ? (JSON.parse(readFileSync(INDEX, "utf8")) as Partial<Record<Role, string>>) : {};
}
function saveIndex(i: Partial<Record<Role, string>>): void {
  writeFileSync(INDEX, JSON.stringify(i, null, 2));
}
