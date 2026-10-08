/**
 * Pay-for-accuracy on ERC-8183 (BNB's AgenticCommerce + EvaluatorRouter + OptimisticPolicy on BSC).
 *
 *   open    treasury (client) creates + funds one job per forecaster for an upcoming market open;
 *           the description states the scoring rule and the acceptance bar.
 *   submit  each forecaster submits its final pre-open commitment root (the same root it committed
 *           to ForecastBook) as the deliverable, with a URL to the full forecast set and proofs.
 *   judge   after the open the Scorer computes each forecaster's CRPS on that open:
 *             echo / nfv  accepted iff CRPS ≤ the anchor's (beat the stale oracle)
 *             anchor      accepted iff its 90% band covered ≥ 80% of opens (honest uncertainty)
 *           A failing job is disputed by the client inside the window, with the score report's hash
 *           as evidence; passing jobs settle by optimistic silence → the forecaster is paid in U.
 *
 *   pnpm exec tsx packages/network/src/chain/jobs.ts open|submit|judge|settle [anchorISO]
 */
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ERC8183Client } from "@bnbagent/sdk";
import { nextRegularOpen } from "@nightshift/core";
import { loadEnv } from "../env.ts";
import { openNetworkDb } from "../store.ts";
import { type Role, walletFor } from "./wallets.ts";

const FORECASTERS: Role[] = ["anchor", "echo", "nfv"];
const BUDGET_U = BigInt(process.env.NIGHTSHIFT_JOB_BUDGET_WEI ?? 200_000_000_000_000_000n); // 0.2 U per forecaster per open
const PUBLIC_URL = process.env.NIGHTSHIFT_PUBLIC_URL ?? "http://localhost:8787";

const SCHEMA = `CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY, forecaster TEXT NOT NULL, anchor_time INTEGER NOT NULL, budget TEXT NOT NULL,
  status TEXT NOT NULL, create_tx TEXT, fund_tx TEXT, submit_tx TEXT, deliverable TEXT, verdict TEXT,
  evidence TEXT, judge_tx TEXT, updated_at INTEGER NOT NULL
)`;

const log = (m: string) => console.log(`${new Date().toISOString()} [jobs] ${m}`);
const client = (role: Role) => ERC8183Client.create({ walletProvider: walletFor(role), network: "bsc-mainnet" });

export function jobDescription(forecaster: Role, anchorTime: number): string {
  return JSON.stringify({
    kind: "nightshift.forecast.v1",
    task: `Forecast the next US regular-session open for every covered bStock on BNB Chain; commit before ${new Date(anchorTime).toISOString()}`,
    deliverable: "bytes32 Merkle root of the final pre-open forecast round (also committed to ForecastBook)",
    scoring: "CRPS of the Student-t log-gap forecast vs the official open",
    accept: forecaster === "anchor" ? "90% band covers >= 80% of opens" : "mean CRPS <= anchor (stale-oracle) CRPS on the same opens",
    proofs: `${PUBLIC_URL}/v1/rounds`,
  });
}

export async function openJobs(db: DatabaseSync, anchorTime: number): Promise<void> {
  const treasury = await client("treasury");
  for (const f of FORECASTERS) {
    const exists = db.prepare(`SELECT job_id FROM jobs WHERE forecaster = ? AND anchor_time = ?`).get(f, anchorTime);
    if (exists) continue;
    const created = await treasury.createJob({ provider: walletFor(f).address, expiredAt: BigInt(Math.floor(anchorTime / 1000) + 2 * 86_400), description: jobDescription(f, anchorTime) });
    if (created.jobId == null) throw new Error(`createJob returned no jobId (tx ${created.transactionHash})`);
    const jobId = created.jobId;
    await treasury.registerJob(jobId);
    await treasury.setBudget(jobId, BUDGET_U);
    const funded = await treasury.fund(jobId, BUDGET_U);
    db.prepare(`INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(jobId.toString(), f, anchorTime, BUDGET_U.toString(), "funded", created.transactionHash, funded.transactionHash, null, null, null, null, null, Date.now());
    log(`job ${jobId} for ${f} @ ${new Date(anchorTime).toISOString()} created+funded (${created.transactionHash})`);
  }
}

/** Each forecaster delivers the root of its last round committed before the open. */
export async function submitJobs(db: DatabaseSync, anchorTime: number): Promise<void> {
  for (const f of FORECASTERS) {
    const job = db.prepare(`SELECT job_id FROM jobs WHERE forecaster = ? AND anchor_time = ? AND status = 'funded'`).get(f, anchorTime) as { job_id: string } | undefined;
    if (!job) continue;
    const c = db
      .prepare(`SELECT round, root FROM commitments WHERE forecaster = ? AND anchor_time = ? AND chain_status IN ('committed','local') ORDER BY round DESC LIMIT 1`)
      .get(f, anchorTime) as { round: number; root: `0x${string}` } | undefined;
    if (!c) continue;
    const fc = await client(f);
    const tx = await fc.submit(BigInt(job.job_id), c.root, { deliverable_url: `${PUBLIC_URL}/v1/rounds?round=${c.round}` });
    db.prepare(`UPDATE jobs SET status='submitted', submit_tx=?, deliverable=?, updated_at=? WHERE job_id=?`).run(tx.transactionHash, c.root, Date.now(), job.job_id);
    log(`job ${job.job_id} (${f}) submitted root ${c.root.slice(0, 12)}… from round ${c.round}`);
  }
}

/** Score each forecaster on this open and dispute any job that missed its acceptance bar. */
export async function judgeJobs(db: DatabaseSync, anchorTime: number): Promise<void> {
  const rows = db
    .prepare(`SELECT forecaster, AVG(crps) c, AVG(covered) cov, COUNT(*) n FROM scores WHERE anchor_time = ? GROUP BY forecaster`)
    .all(anchorTime) as { forecaster: Role; c: number; cov: number; n: number }[];
  if (rows.length === 0) return;
  const by = Object.fromEntries(rows.map((r) => [r.forecaster, r])) as Record<string, { c: number; cov: number; n: number }>;
  const anchor = by.anchor;
  const treasury = await client("treasury");
  for (const f of FORECASTERS) {
    const job = db.prepare(`SELECT job_id FROM jobs WHERE forecaster = ? AND anchor_time = ? AND status = 'submitted'`).get(f, anchorTime) as { job_id: string } | undefined;
    const s = by[f];
    if (!job || !s || !anchor) continue;
    const pass = f === "anchor" ? s.cov >= 0.8 : s.c <= anchor.c;
    const report = JSON.stringify({ forecaster: f, anchorTime, n: s.n, crpsBps: s.c * 1e4, anchorCrpsBps: anchor.c * 1e4, coverage: s.cov, pass });
    const evidence = `0x${createHash("sha256").update(report).digest("hex")}` as `0x${string}`;
    if (pass) {
      db.prepare(`UPDATE jobs SET status='accepted', verdict='pass', evidence=?, updated_at=? WHERE job_id=?`).run(evidence, Date.now(), job.job_id);
      log(`job ${job.job_id} (${f}) PASSES: CRPS ${(s.c * 1e4).toFixed(1)} vs anchor ${(anchor.c * 1e4).toFixed(1)} bps — settles optimistically`);
    } else {
      const tx = await treasury.dispute(BigInt(job.job_id));
      db.prepare(`UPDATE jobs SET status='disputed', verdict='fail', evidence=?, judge_tx=?, updated_at=? WHERE job_id=?`).run(evidence, tx.transactionHash, Date.now(), job.job_id);
      log(`job ${job.job_id} (${f}) FAILS its bar → disputed (${tx.transactionHash})`);
    }
  }
}

/** After the dispute window, finalize accepted jobs (anyone can settle; we do it for the forecasters). */
export async function settleJobs(db: DatabaseSync): Promise<void> {
  const treasury = await client("treasury");
  for (const j of db.prepare(`SELECT job_id, evidence FROM jobs WHERE status = 'accepted'`).all() as { job_id: string; evidence: `0x${string}` }[]) {
    try {
      const tx = await treasury.settle(BigInt(j.job_id), j.evidence);
      db.prepare(`UPDATE jobs SET status='settled', judge_tx=?, updated_at=? WHERE job_id=?`).run(tx.transactionHash, Date.now(), j.job_id);
      log(`job ${j.job_id} settled (${tx.transactionHash})`);
    } catch (e) {
      log(`job ${j.job_id} not settleable yet: ${(e as Error).message.split("\n")[0]}`);
    }
  }
}

if (process.argv[1]?.endsWith("jobs.ts")) {
  loadEnv();
  const db = openNetworkDb();
  db.exec(SCHEMA);
  const cmd = process.argv[2] ?? "open";
  const anchor = process.argv[3] ? Date.parse(process.argv[3]) : nextRegularOpen(Date.now());
  if (cmd === "open") await openJobs(db, anchor);
  else if (cmd === "submit") await submitJobs(db, anchor);
  else if (cmd === "judge") await judgeJobs(db, anchor);
  else if (cmd === "settle") await settleJobs(db);
}
