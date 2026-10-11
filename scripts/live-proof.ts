/**
 * Writes docs/LIVE.md: every on-chain fact Nightshift can show, as BscScan links a judge can click without a
 * wallet. Rendered from the API's /v1/onchain view, which is built only from deployments/*.json and the
 * database's recorded transaction hashes, so the page never claims more than the chain holds. Point it at the
 * host that publishes (its database has the commit and post hashes), or leave the URL off to read the local one:
 *
 *   pnpm exec tsx scripts/live-proof.ts https://nightshift-production-f4e3.up.railway.app
 *   pnpm exec tsx scripts/live-proof.ts
 */
import { writeFileSync } from "node:fs";
import type { Queries } from "../packages/api/src/queries.ts";

type OnChain = ReturnType<Queries["onchain"]>;
interface Loan {
  steps: Record<string, { tx?: string; at: string; [k: string]: unknown }>;
  summary?: Record<string, string>;
}
interface Trade {
  wallet: string;
  txHash: string;
  receipt: { tca: { verdict: string }; pricePerToken: number; amountToken: number; amountUsd: number; reference: { fairValue: number; lower: number; upper: number; round: number } | null };
}

const SITE = "https://nightshift-production-f4e3.up.railway.app";
const base = process.argv[2]?.replace(/\/+$/, "");
const oc: OnChain = base
  ? ((await (await fetch(`${base}/v1/onchain`, { headers: { accept: "application/json" } })).json()) as OnChain)
  : new (await import("../packages/api/src/queries.ts")).Queries().onchain();

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const addr = (a: string) => `[\`${a}\`](https://bscscan.com/address/${a})`;
const txl = (h: string | null | undefined, label = "tx") => (h ? `[${label}](https://bscscan.com/tx/${h})` : "–");

const out: string[] = [];
out.push("# Nightshift, live on BSC mainnet", "");
out.push(
  `Generated ${iso(Date.now())} from ${base ? `\`${base}/v1/onchain\`` : "the local database"} (\`pnpm exec tsx scripts/live-proof.ts${base ? ` ${base}` : ""}\`), which lists only transaction hashes the system recorded. Every link opens on BscScan; no wallet needed. The always-current version is the site's [On-chain proof](${SITE}/proof) page, and any sealed forecast can be checked from your browser at [/verify](${SITE}/verify).`,
  "",
);

out.push("## Contracts", "");
if (!oc.contracts.length) out.push("_Not deployed yet._", "");
else {
  out.push(`Deployed at block ${oc.deployBlock?.toLocaleString("en-US") ?? "–"}.`, "");
  out.push("| Contract | Address | What it does |", "|---|---|---|");
  for (const c of oc.contracts) out.push(`| ${c.name} | ${addr(c.address)} | ${c.role} |`);
  for (const f of oc.feeds) out.push(`| AggregatorV3 feed: ${f.symbol} | ${addr(f.feed)} | Chainlink-compatible \`latestRoundData()\` |`);
  out.push("");
}

if (oc.agents.length) {
  out.push("## Agents (ERC-8004 identities)", "", "| Agent | Agent ID | Wallet | Registration |", "|---|---|---|---|");
  for (const a of oc.agents) out.push(`| ${a.name} | ${a.agentId ?? "–"} | ${addr(a.address)} | ${txl(a.tx)} |`);
  out.push("");
}

out.push("## Proof of foresight (ForecastBook)", "");
if (!oc.commitments.length) out.push("_No commitments on-chain yet._", "");
else {
  out.push("Each row: a forecaster's Merkle roots, each covering its forecasts for every bStock, committed **before** that open. Any single forecast can be checked against its root with `/v1/rounds/{round}/proof/{forecaster}/{token}`, or on the site's verify page.", "");
  out.push("| Open (UTC) | Forecaster | Roots committed | Latest commit |", "|---|---|---|---|");
  for (const c of oc.commitments) out.push(`| ${iso(c.anchorTime)} | ${c.forecaster} | ${c.rounds} (rounds ${c.firstRound}–${c.lastRound}) | ${txl(c.lastTx)} |`);
  out.push("");
}

out.push("## Oracle reports (NightshiftOracle)", "");
if (!oc.oracle.reports) out.push("_No reports posted yet._", "");
else {
  out.push(`${oc.oracle.reports} reports in ${oc.oracle.txs} transactions so far. The most recent:`, "");
  out.push("| Token | Round | Fair value | 90% next-open band | Posted | Tx |", "|---|---|---|---|---|---|");
  for (const r of oc.oracle.latest.slice(0, 12)) out.push(`| ${r.symbol} | ${r.round} | $${r.fairValue.toFixed(2)} | $${r.lower.toFixed(2)} – $${r.upper.toFixed(2)} | ${iso(r.computedAt)} | ${txl(r.tx)} |`);
  out.push("");
}

const loan = oc.sundayLoan as Loan | null;
if (loan?.steps && Object.keys(loan.steps).length) {
  out.push("## The weekend loan (NightshiftCredit)", "");
  const s = loan.steps;
  const line = (k: string, what: string) => s[k] && out.push(`- ${what} (${s[k]!.at}): ${txl(s[k]!.tx)}`);
  line("buy", `Bought NVDAB through the Binance Trading API${s.buy?.verdict ? `: ${String(s.buy.verdict)}` : ""}`);
  line("lend", `Treasury lent ${String(s.lend?.usdt ?? "")} USDT into the vault`);
  line("collateral", `Posted ${String(s.collateral?.nvdab ?? "")} NVDAB as collateral`);
  line("borrow", `Borrowed ${String(s.borrow?.usdt ?? "")} USDT against it`);
  if (loan.summary)
    out.push("", `Collateral is valued at **$${Number(loan.summary.valuedAt).toFixed(2)}** (the lower edge of the 90% band for Monday's open), not the $${Number(loan.summary.fairValue).toFixed(2)} fair value. Health factor ${Number(loan.summary.healthFactor).toFixed(2)}.`);
  out.push("");
}

const trades = oc.agenticWalletTrades as Trade[];
if (trades.length) {
  out.push("## Binance Agentic Wallet trades (Wallet Skill + receipts)", "");
  out.push("| Trade | Price paid | Fair value at that moment (90% band) | Receipt verdict | Tx |", "|---|---|---|---|---|");
  for (const t of trades) {
    const r = t.receipt;
    out.push(
      `| $${r.amountUsd} → ${r.amountToken.toFixed(6)} NVDAB from ${addr(t.wallet)} | $${r.pricePerToken.toFixed(2)} | ${r.reference ? `$${r.reference.fairValue.toFixed(2)} ($${r.reference.lower.toFixed(2)} – $${r.reference.upper.toFixed(2)}), round ${r.reference.round}` : "–"} | ${r.tca.verdict} | ${txl(t.txHash)} |`,
    );
  }
  out.push("", "Receipts are rebuilt from the chain's Transfer logs: `GET /v1/receipts/{tx}?trader={wallet}`; the `receiptHash` pins every number.", "");
}

out.push("## Pay-for-accuracy (ERC-8183 jobs on BNB's commerce contracts)", "");
if (!oc.jobs.length) out.push("_No jobs on-chain yet: they open once the escrow holds U. Until then the scores below are published, not paid._", "");
else {
  out.push("| Open (UTC) | Forecaster | Job | Budget (U) | Status | Create | Fund | Submit | Verdict |", "|---|---|---|---|---|---|---|---|---|");
  for (const j of oc.jobs)
    out.push(`| ${iso(j.anchorTime)} | ${j.forecaster} | ${j.jobId} | ${Number(j.budget) / 1e18} | ${j.status} | ${txl(j.createTx)} | ${txl(j.fundTx)} | ${txl(j.submitTx)} | ${j.verdict ?? "–"} ${j.judgeTx ? txl(j.judgeTx, "dispute/settle") : ""} |`);
  out.push("");
}

if (oc.scores.length) {
  out.push("## Scored by reality (every official open since Oct 8)", "", "CRPS and MAE in basis points of price, lower is better; coverage = share of opens inside the 90% band.", "");
  out.push("| Open (UTC) | Forecaster | Forecasts | CRPS | MAE | 90% band coverage |", "|---|---|---|---|---|---|");
  for (const r of oc.scores) out.push(`| ${iso(r.anchorTime)} | ${r.forecaster} | ${r.n} | ${r.crpsBps.toFixed(1)} | ${r.maeBps.toFixed(1)} | ${(r.coverage * 100).toFixed(1)}% |`);
  out.push("");
}

writeFileSync("docs/LIVE.md", `${out.join("\n")}\n`);
console.log(`docs/LIVE.md: ${out.length} lines from ${base ?? "the local database"}`);
