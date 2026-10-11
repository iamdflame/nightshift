/**
 * Writes docs/LIVE.md: every on-chain fact Nightshift can show, as BscScan links a judge can click without a
 * wallet. Built only from deployments/*.json and the database's recorded transaction hashes, so the page never
 * claims more than the chain holds.
 *
 *   pnpm exec tsx scripts/live-proof.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const DB = process.env.NIGHTSHIFT_DB ?? "data/tape.sqlite";
const read = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null);
const addr = (a: string) => `[\`${a}\`](https://bscscan.com/address/${a})`;
const txl = (h: string | null | undefined, label = "tx") => (h ? `[${label}](https://bscscan.com/tx/${h})` : "–");
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

const dep = read<Record<string, unknown> & { feeds?: Record<string, string> }>("deployments/56.json");
const agents = read<Record<string, { agentId: number | null; address: string; tx: string }>>("deployments/agents.json");
const loan = read<{ steps: Record<string, { tx?: string; at: string; [k: string]: unknown }>; summary?: Record<string, string> }>("deployments/sunday-loan.json");
const db = new DatabaseSync(DB, { readOnly: true });
const has = (t: string) => Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t));
const sym = new Map((db.prepare(`SELECT lower(address) a, symbol FROM instruments WHERE chain_id = 56`).all() as { a: string; symbol: string }[]).map((r) => [r.a, r.symbol]));

const out: string[] = [];
out.push("# Nightshift, live on BSC mainnet", "");
out.push(`Generated ${iso(Date.now())} from \`deployments/*.json\` and the transaction hashes the system recorded (\`pnpm exec tsx scripts/live-proof.ts\`). Every link opens on BscScan; no wallet needed.`, "");

out.push("## Contracts", "");
if (!dep) out.push("_Not deployed yet._", "");
else {
  out.push("| Contract | Address | What it does |", "|---|---|---|");
  const roles: Record<string, string> = {
    ForecastBook: "Forecasters commit a Merkle root of every forecast before the open (proof of foresight), then reveal",
    NightshiftOracle: "Consensus fair value + 90% next-open band per token, posted by the Scorer",
    NightshiftCredit: "Borrow USDT against bStocks 24/7; collateral counts at the band's lower edge",
    NightshiftVenusOracle: "Venus `OracleInterface` adapter over the same reports",
  };
  for (const [k, v] of Object.entries(roles)) if (typeof dep[k] === "string") out.push(`| ${k} | ${addr(dep[k] as string)} | ${v} |`);
  for (const [token, feed] of Object.entries(dep.feeds ?? {})) out.push(`| AggregatorV3 feed: ${sym.get(token.toLowerCase()) ?? token} | ${addr(feed)} | Chainlink-compatible \`latestRoundData()\` |`);
  out.push("");
}

if (agents && Object.keys(agents).length) {
  out.push("## Agents (ERC-8004 identities)", "", "| Role | Agent ID | Wallet | Registration |", "|---|---|---|---|");
  for (const [role, a] of Object.entries(agents)) out.push(`| ${role} | ${a.agentId ?? "–"} | ${addr(a.address)} | ${txl(a.tx)} |`);
  out.push("");
}

if (has("commitments")) {
  const rows = db
    .prepare(`SELECT anchor_time, forecaster, COUNT(*) n, MIN(round) r0, MAX(round) r1, MAX(tx_hash) last FROM commitments WHERE chain_status = 'committed' GROUP BY anchor_time, forecaster ORDER BY anchor_time DESC, forecaster LIMIT 30`)
    .all() as { anchor_time: number; forecaster: string; n: number; r0: number; r1: number; last: string }[];
  out.push("## Proof of foresight (ForecastBook)", "");
  if (!rows.length) out.push("_No commitments on-chain yet._", "");
  else {
    out.push("Each row: a forecaster's Merkle roots committed **before** that open. Any single forecast can be checked against its root with `/v1/rounds/{round}/proof/{forecaster}/{token}`.", "");
    out.push("| Open (UTC) | Forecaster | Rounds committed | Latest commit |", "|---|---|---|---|");
    for (const r of rows) out.push(`| ${iso(r.anchor_time)} | ${r.forecaster} | ${r.n} (rounds ${r.r0}–${r.r1}) | ${txl(r.last)} |`);
    out.push("");
  }
}

if (has("consensus")) {
  const rows = db
    .prepare(`SELECT c.token, c.symbol, c.round, c.fair_value, c.lower, c.upper, c.computed_at, c.tx_hash FROM consensus c JOIN (SELECT token, MAX(round) r FROM consensus WHERE chain_status = 'posted' GROUP BY token) m ON m.token = c.token AND m.r = c.round ORDER BY c.symbol LIMIT 12`)
    .all() as { symbol: string; round: number; fair_value: number; lower: number; upper: number; computed_at: number; tx_hash: string }[];
  const posts = (db.prepare(`SELECT COUNT(DISTINCT tx_hash) n, COUNT(*) reports FROM consensus WHERE chain_status = 'posted'`).get() as { n: number; reports: number });
  out.push("## Oracle reports (NightshiftOracle)", "");
  if (!rows.length) out.push("_No reports posted yet._", "");
  else {
    out.push(`${posts.reports} reports in ${posts.n} transactions so far. Latest per token (first 12):`, "");
    out.push("| Token | Round | Fair value | 90% next-open band | Posted | Tx |", "|---|---|---|---|---|---|");
    for (const r of rows) out.push(`| ${r.symbol} | ${r.round} | $${r.fair_value.toFixed(2)} | $${r.lower.toFixed(2)} – $${r.upper.toFixed(2)} | ${iso(r.computed_at)} | ${txl(r.tx_hash)} |`);
    out.push("");
  }
}

if (loan?.steps && Object.keys(loan.steps).length) {
  out.push("## The Sunday loan (NightshiftCredit)", "");
  const s = loan.steps;
  const line = (k: string, what: string) => s[k] && out.push(`- ${what} (${s[k]!.at}): ${txl(s[k]!.tx)}`);
  line("buy", `Bought NVDAB through the Binance Trading API${s.buy?.verdict ? `: ${s.buy.verdict}` : ""}`);
  line("lend", `Treasury lent ${s.lend?.usdt ?? ""} USDT into the vault`);
  line("collateral", `Posted ${s.collateral?.nvdab ?? ""} NVDAB as collateral`);
  line("borrow", `Borrowed ${s.borrow?.usdt ?? ""} USDT against it`);
  if (loan.summary)
    out.push("", `Collateral is valued at **$${Number(loan.summary.valuedAt).toFixed(2)}** (the lower edge of the 90% band for Monday's open), not the $${Number(loan.summary.fairValue).toFixed(2)} fair value. Health factor ${Number(loan.summary.healthFactor).toFixed(2)}.`);
  out.push("");
}

const awTrades = read<{ wallet: string; command: string; txHash: string; receipt: { tca: { verdict: string; vsFairValueBps: number | null }; pricePerToken: number; amountToken: number; amountUsd: number; reference: { fairValue: number; lower: number; upper: number; round: number } | null; receiptHash: string } }[]>("deployments/agentic-wallet-trades.json");
if (awTrades?.length) {
  out.push("## Binance Agentic Wallet trades (Wallet Skill + receipts)", "");
  out.push("| Trade | Price paid | Fair value at that moment (90% band) | Receipt verdict | Tx |", "|---|---|---|---|---|");
  for (const t of awTrades) {
    const r = t.receipt;
    out.push(
      `| $${r.amountUsd} → ${r.amountToken.toFixed(6)} NVDAB from ${addr(t.wallet)} | $${r.pricePerToken.toFixed(2)} | ${r.reference ? `$${r.reference.fairValue.toFixed(2)} ($${r.reference.lower.toFixed(2)} – $${r.reference.upper.toFixed(2)}), round ${r.reference.round}` : "–"} | ${r.tca.verdict} | ${txl(t.txHash)} |`,
    );
  }
  out.push("", "Receipts are rebuilt from the chain's Transfer logs: `GET /v1/receipts/{tx}?trader={wallet}`; the `receiptHash` pins every number.", "");
}

if (has("jobs")) {
  const rows = db.prepare(`SELECT job_id, forecaster, anchor_time, budget, status, create_tx, fund_tx, submit_tx, verdict, judge_tx FROM jobs ORDER BY anchor_time DESC, forecaster LIMIT 30`).all() as Record<string, string | number | null>[];
  if (rows.length) {
    out.push("## Pay-for-accuracy (ERC-8183 jobs on BNB's commerce contracts)", "");
    out.push("| Open (UTC) | Forecaster | Job | Budget (U) | Status | Create | Fund | Submit | Verdict |", "|---|---|---|---|---|---|---|---|---|");
    for (const r of rows)
      out.push(`| ${iso(Number(r.anchor_time))} | ${r.forecaster} | ${r.job_id} | ${Number(r.budget) / 1e18} | ${r.status} | ${txl(r.create_tx as string)} | ${txl(r.fund_tx as string)} | ${txl(r.submit_tx as string)} | ${r.verdict ?? "–"} ${r.judge_tx ? txl(r.judge_tx as string, "dispute/settle") : ""} |`);
    out.push("");
  }
}

if (has("scores")) {
  const rows = db
    .prepare(`SELECT anchor_time, forecaster, COUNT(*) n, AVG(crps) crps, AVG(abs_err) mae, AVG(covered) cov FROM scores GROUP BY anchor_time, forecaster ORDER BY anchor_time DESC, forecaster`)
    .all() as { anchor_time: number; forecaster: string; n: number; crps: number; mae: number; cov: number }[];
  if (rows.length) {
    out.push("## Scored by reality (every official open since Oct 8)", "", "CRPS and MAE in basis points of price, lower is better; coverage = share of opens inside the 90% band.", "");
    out.push("| Open (UTC) | Forecaster | Forecasts | CRPS | MAE | 90% band coverage |", "|---|---|---|---|---|---|");
    for (const r of rows) out.push(`| ${iso(r.anchor_time)} | ${r.forecaster} | ${r.n} | ${(r.crps * 1e4).toFixed(1)} | ${(r.mae * 1e4).toFixed(1)} | ${(r.cov * 100).toFixed(1)}% |`);
    out.push("");
  }
}

writeFileSync("docs/LIVE.md", `${out.join("\n")}\n`);
console.log(`docs/LIVE.md: ${out.length} lines`);
