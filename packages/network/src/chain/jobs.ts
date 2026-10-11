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
const BUDGET_U = BigInt(process.env.NIGHTSHIFT_JOB_BUDGET_WEI ?? 100_000_000_000_000_000n); // 0.1 U per forecaster per open
/** On-chain job text must point somewhere a stranger can open: the live API, else the public repo. */
const PUBLIC_URL = process.env.NIGHTSHIFT_PUBLIC_URL?.replace(/\/+$/, "") || "https://github.com/iamdflame/nightshift";

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

/**
 * Create + register + budget + fund each forecaster's job for one open. Every stage is recorded as it lands,
 * so a failure part-way (e.g. too little U) resumes on the next tick instead of minting another job.
 */
export async function openJobs(db: DatabaseSync, anchorTime: number): Promise<void> {
  const treasury = await client("treasury");
  for (const f of FORECASTERS) {
    let row = db.prepare(`SELECT job_id, status FROM jobs WHERE forecaster = ? AND anchor_time = ?`).get(f, anchorTime) as { job_id: string; status: string } | undefined;
    if (!row) {
      if ((await treasury.tokenBalance()) < BUDGET_U) {
        log(`no job for ${f}: treasury holds less than ${Number(BUDGET_U) / 1e18} U`);
        continue;
      }
      const created = await treasury.createJob({ provider: walletFor(f).address, expiredAt: BigInt(Math.floor(anchorTime / 1000) + 2 * 86_400), description: jobDescription(f, anchorTime) });
      if (created.jobId == null) throw new Error(`createJob returned no jobId (tx ${created.transactionHash})`);
      db.prepare(`INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(created.jobId.toString(), f, anchorTime, BUDGET_U.toString(), "created", created.transactionHash, null, null, null, null, null, null, Date.now());
      row = { job_id: created.jobId.toString(), status: "created" };
      log(`job ${row.job_id} for ${f} @ ${new Date(anchorTime).toISOString()} created (${created.transactionHash})`);
    }
    const r = row;
    const id = BigInt(r.job_id);
    const set = (status: string, fundTx?: string) => {
      r.status = status;
      db.prepare(`UPDATE jobs SET status = ?, fund_tx = COALESCE(?, fund_tx), updated_at = ? WHERE job_id = ?`).run(status, fundTx ?? null, Date.now(), r.job_id);
    };
    if (r.status === "created") {
      await treasury.registerJob(id);
      set("registered");
    }
    if (r.status === "registered") {
      await treasury.setBudget(id, BUDGET_U);
      set("budgeted");
    }
    if (r.status === "budgeted") {
      const funded = await treasury.fund(id, BUDGET_U);
      set("funded", funded.transactionHash);
      log(`job ${r.job_id} (${f}) funded with ${Number(BUDGET_U) / 1e18} U (${funded.transactionHash})`);
    }
  }
}

/** Each forecaster delivers the root of its last round committed before the open. */
export async function submitJobs(db: DatabaseSync, anchorTime: number): Promise<void> {
  for (const f of FORECASTERS) {
    const job = db.prepare(`SELECT job_id FROM jobs WHERE forecaster = ? AND anchor_time = ? AND status = 'funded'`).get(f, anchorTime) as { job_id: string } | undefined;
    if (!job) continue;
    const c = db
      .prepare(`SELECT round, root FROM commitments WHERE forecaster = ? AND anchor_time = ? AND chain_status = 'committed' ORDER BY round DESC LIMIT 1`)
      .get(f, anchorTime) as { round: number; root: `0x${string}` } | undefined;
    if (!c) continue;
    const fc = await client(f);
    const tx = await fc.submit(BigInt(job.job_id), c.root, { deliverable_url: `${PUBLIC_URL}/v1/rounds?round=${c.round}` });
    db.prepare(`UPDATE jobs SET status='submitted', submit_tx=?, deliverable=?, updated_at=? WHERE job_id=?`).run(tx.transactionHash, c.root, Date.now(), job.job_id);
    log(`job ${job.job_id} (${f}) submitted root ${c.root.slice(0, 12)}… from round ${c.round}`);
  }
}

/**
 * Score each submitted job on exactly the round it delivered, against the anchor (stale oracle) on the same
 * round and tokens, and dispute any job that missed its acceptance bar.
 */
export async function judgeJobs(db: DatabaseSync, anchorTime: number): Promise<void> {
  const treasury = await client("treasury");
  const jobs = db.prepare(`SELECT job_id, forecaster, deliverable FROM jobs WHERE anchor_time = ? AND status = 'submitted'`).all(anchorTime) as { job_id: string; forecaster: Role; deliverable: string }[];
  for (const job of jobs) {
    const c = db.prepare(`SELECT round FROM commitments WHERE forecaster = ? AND anchor_time = ? AND root = ?`).get(job.forecaster, anchorTime, job.deliverable) as { round: number } | undefined;
    if (!c) continue;
    const stats = (f: string) =>
      db.prepare(`SELECT AVG(crps) c, AVG(covered) cov, COUNT(*) n FROM scores WHERE anchor_time = ? AND round = ? AND forecaster = ?`).get(anchorTime, c.round, f) as { c: number | null; cov: number | null; n: number };
    const s = stats(job.forecaster);
    const anchor = stats("anchor");
    if (!s.n || !anchor.n || s.c == null || anchor.c == null) continue;
    const pass = job.forecaster === "anchor" ? (s.cov ?? 0) >= 0.8 : s.c <= anchor.c;
    const report = JSON.stringify({ forecaster: job.forecaster, anchorTime, round: c.round, n: s.n, crpsBps: s.c * 1e4, anchorCrpsBps: anchor.c * 1e4, coverage: s.cov, pass });
    const evidence = `0x${createHash("sha256").update(report).digest("hex")}` as `0x${string}`;
    if (pass) {
      db.prepare(`UPDATE jobs SET status='accepted', verdict='pass', evidence=?, updated_at=? WHERE job_id=?`).run(evidence, Date.now(), job.job_id);
      log(`job ${job.job_id} (${job.forecaster}) PASSES on round ${c.round}: CRPS ${(s.c * 1e4).toFixed(1)} vs anchor ${(anchor.c * 1e4).toFixed(1)} bps; settles optimistically`);
    } else {
      const tx = await treasury.dispute(BigInt(job.job_id));
      db.prepare(`UPDATE jobs SET status='disputed', verdict='fail', evidence=?, judge_tx=?, updated_at=? WHERE job_id=?`).run(evidence, tx.transactionHash, Date.now(), job.job_id);
      log(`job ${job.job_id} (${job.forecaster}) FAILS its bar on round ${c.round} → disputed (${tx.transactionHash})`);
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

/** Funded jobs that never got a deliverable: reclaim the escrow once they expire; unfunded leftovers are closed. */
export async function reclaimJobs(db: DatabaseSync, now = Date.now()): Promise<void> {
  const treasury = await client("treasury");
  const expired = db.prepare(`SELECT job_id FROM jobs WHERE status = 'funded' AND anchor_time + 2 * 86400000 + 600000 < ?`).all(now) as { job_id: string }[];
  for (const j of expired) {
    try {
      const tx = await treasury.claimRefund(BigInt(j.job_id));
      db.prepare(`UPDATE jobs SET status='refunded', judge_tx=?, updated_at=? WHERE job_id=?`).run(tx.transactionHash, Date.now(), j.job_id);
      log(`job ${j.job_id} expired without a deliverable → refunded (${tx.transactionHash})`);
    } catch (e) {
      log(`job ${j.job_id} refund not available yet: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  db.prepare(`UPDATE jobs SET status='abandoned', updated_at=? WHERE status IN ('created','registered','budgeted') AND anchor_time < ?`).run(Date.now(), now);
}

/**
 * The autonomous lifecycle, run by the Night Shift runner after every round (serialized with the other
 * treasury transactions): open (or resume opening) the next open's jobs, submit each forecaster's last on-chain
 * root in the final round before the bell, judge two hours after the open (every ticker's open is in by then),
 * settle after the dispute window, reclaim expired escrow.
 */
export async function jobsTick(db: DatabaseSync, now = Date.now()): Promise<void> {
  db.exec(SCHEMA);
  const next = nextRegularOpen(now);
  if (next - now > 45 * 60_000) await openJobs(db, next);
  // Rounds land at :00/:30 and opens at :30, so the round 30 min before the bell is the last chance.
  if (next - now <= 35 * 60_000) await submitJobs(db, next);
  const due = db.prepare(`SELECT DISTINCT anchor_time a FROM jobs WHERE status = 'submitted' AND anchor_time + 2 * 3600000 < ?`).all(now) as { a: number }[];
  for (const { a } of due) await judgeJobs(db, a);
  await settleJobs(db);
  await reclaimJobs(db, now);
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
