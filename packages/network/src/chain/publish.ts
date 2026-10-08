/**
 * Publishes the Night Shift on-chain:
 *   - each forecaster commits its round's Merkle root to ForecastBook before the open (proof of foresight)
 *   - the treasury posts the consensus fair value + next-open band for every token to NightshiftOracle
 * Contract addresses come from deployments/56.json (written by contracts/script/Deploy.s.sol).
 * Disabled (no-op) until deployments exist and wallets are funded.
 */
import { existsSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { SESSION_CODE } from "@nightshift/nfv";
import type { Abi } from "viem";
import { toE8 } from "../merkle.ts";
import { forecastBookAbi, oracleAbi } from "./abis.ts";
import { sendContractTx } from "./send.ts";
import { type Role, walletFor } from "./wallets.ts";

interface Deployments {
  NightshiftOracle?: `0x${string}`;
  ForecastBook?: `0x${string}`;
  [k: string]: unknown;
}

export function deployments(): Deployments | null {
  const path = "deployments/56.json";
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Deployments) : null;
}

const log = (m: string) => console.log(`${new Date().toISOString()} [chain] ${m}`);

/** Commit every forecaster's pending (local) roots whose open is still in the future. */
export async function commitPending(db: DatabaseSync, now = Date.now()): Promise<number> {
  const d = deployments();
  if (!d?.ForecastBook) return 0;
  const pending = db
    .prepare(`SELECT round, forecaster, root, count, anchor_time FROM commitments WHERE chain_status = 'local' AND anchor_time > ? ORDER BY round`)
    .all(now + 60_000) as { round: number; forecaster: Role; root: `0x${string}`; count: number; anchor_time: number }[];
  let sent = 0;
  for (const c of pending) {
    try {
      const tx = await sendContractTx(walletFor(c.forecaster), d.ForecastBook, forecastBookAbi as Abi, "commit", [BigInt(c.round), BigInt(Math.floor(c.anchor_time / 1000)), c.root, c.count]);
      db.prepare(`UPDATE commitments SET chain_status = ?, tx_hash = ? WHERE round = ? AND forecaster = ?`).run(tx.status === "success" ? "committed" : "reverted", tx.hash, c.round, c.forecaster);
      log(`commit ${c.forecaster} round ${c.round} → ${tx.hash} (${tx.status}, gas ${tx.gasUsed})`);
      sent++;
    } catch (e) {
      log(`commit ${c.forecaster} round ${c.round} failed: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  // Rounds whose open passed without an on-chain commit can never prove foresight: mark them.
  db.prepare(`UPDATE commitments SET chain_status = 'missed' WHERE chain_status = 'local' AND anchor_time <= ?`).run(now);
  return sent;
}

/** Post the latest consensus round to NightshiftOracle (batched). */
export async function postConsensus(db: DatabaseSync, batch = 45): Promise<number> {
  const d = deployments();
  if (!d?.NightshiftOracle) return 0;
  const latest = db.prepare(`SELECT MAX(round) r FROM consensus WHERE chain_status = 'local'`).get() as { r: number | null };
  if (!latest.r) return 0;
  const rows = db.prepare(`SELECT * FROM consensus WHERE round = ? AND chain_status = 'local'`).all(latest.r) as Record<string, number | string>[];
  let posted = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const tokens = chunk.map((r) => r.token as `0x${string}`);
    const reports = chunk.map((r) => ({
      fairValue: toE8(r.fair_value as number),
      lower: toE8(r.lower as number),
      upper: toE8(r.upper as number),
      anchorTime: BigInt(Math.floor((r.anchor_time as number) / 1000)),
      updatedAt: BigInt(Math.floor((r.computed_at as number) / 1000)),
      round: BigInt(r.round as number),
      session: SESSION_CODE[r.session as keyof typeof SESSION_CODE] ?? 4,
      flags: r.flags as number,
    }));
    try {
      const tx = await sendContractTx(walletFor("treasury"), d.NightshiftOracle, oracleAbi as Abi, "postReports", [tokens, reports]);
      const upd = db.prepare(`UPDATE consensus SET chain_status = ?, tx_hash = ? WHERE round = ? AND token = ?`);
      for (const t of tokens) upd.run(tx.status === "success" ? "posted" : "reverted", tx.hash, latest.r, t);
      log(`oracle post round ${latest.r}: ${tokens.length} tokens → ${tx.hash} (${tx.status}, gas ${tx.gasUsed})`);
      posted += tokens.length;
    } catch (e) {
      log(`oracle post failed: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  // Older unposted rounds are superseded by this one.
  db.prepare(`UPDATE consensus SET chain_status = 'superseded' WHERE chain_status = 'local' AND round < ?`).run(latest.r);
  return posted;
}
