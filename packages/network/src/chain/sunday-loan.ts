/**
 * The Sunday loan: borrow USDT against NVIDIA on BSC mainnet while the US market is closed. NightshiftCredit
 * values the collateral at the LOWER edge of Nightshift's 90% band for the next open (× base LTV), so the
 * loan is sized for Monday's gap, not for a stale Friday close.
 *
 *   1. oracle  publish the latest consensus round (NVDAB is a consumed token: posted every round)
 *   2. buy     the executor swaps USDT → NVDAB through the Binance Trading API; receipt vs fair value
 *   3. lend    the treasury deposits USDT liquidity into NightshiftCredit (ERC-4626)
 *   4. borrow  the executor posts its NVDAB and borrows a slice of its borrow power
 *
 *   pnpm exec tsx packages/network/src/chain/sunday-loan.ts
 * Idempotent: each finished step is recorded in deployments/sunday-loan.json and skipped on re-run.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { BinanceWeb3Client, SqliteTelemetrySink } from "@nightshift/sdk";
import { EoaExecutor } from "@nightshift/trade";
import { type Abi, erc20Abi, formatUnits, parseAbi } from "viem";
import { loadEnv } from "../env.ts";
import { openNetworkDb } from "../store.ts";
import { oracleAbi } from "./abis.ts";
import { deployments, postConsensus } from "./publish.ts";
import { publicClient, sendContractTx } from "./send.ts";
import { walletFor } from "./wallets.ts";

loadEnv();
const NVDAB = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436" as const;
const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;
const BUY_USDT = BigInt(process.env.LOAN_BUY_USDT_WEI ?? 5n * 10n ** 18n);
const LEND_USDT = BigInt(process.env.LOAN_LEND_USDT_WEI ?? 15n * 10n ** 17n);
const BORROW_SHARE = 0.4; // of borrow power, and never more than the vault's cash
const STATE = "deployments/sunday-loan.json";

const creditAbi = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function depositCollateral(address token, uint256 amount, address onBehalfOf)",
  "function borrow(uint256 amount, address receiver)",
  "function cash() view returns (uint256)",
  "function getAccountData(address account) view returns ((uint256 debt, uint256 borrowPower, uint256 liquidationValue, uint256 healthFactor, uint16 collateralMask))",
]);
const tx = (h: string) => `https://bscscan.com/tx/${h}`;
const log = (m: string) => console.log(`${new Date().toISOString()} [sunday-loan] ${m}`);

type State = Record<string, unknown> & { steps: Record<string, { tx?: string; at: string; [k: string]: unknown }> };
const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { steps: {} };
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
const done = (k: string, v: Record<string, unknown>) => {
  state.steps[k] = { ...v, at: new Date().toISOString() };
  save();
};

const d = deployments() as (ReturnType<typeof deployments> & { NightshiftCredit?: `0x${string}` }) | null;
if (!d?.NightshiftCredit || !d.NightshiftOracle) throw new Error("deploy first: deployments/56.json has no NightshiftCredit / NightshiftOracle");
const credit = d.NightshiftCredit;
const treasury = walletFor("treasury");
const executor = walletFor("executor");
const borrower = executor.address as `0x${string}`;

// 1. A fresh report: credit refuses reports older than its maxAge (1 h).
type Report = { fairValue: bigint; lower: bigint; upper: bigint; updatedAt: bigint; round: bigint };
const readReport = async () => {
  try {
    return (await publicClient.readContract({ address: d.NightshiftOracle!, abi: oracleAbi as Abi, functionName: "getReport", args: [NVDAB] })) as Report;
  } catch {
    return null; // no report yet
  }
};
// Post only when the on-chain report is missing or older than 30 min: if a hosted runner is publishing, it is
// fresh and we never sign for the treasury concurrently with it.
let report = await readReport();
let posted = 0;
if (!report || Math.floor(Date.now() / 1000) - Number(report.updatedAt) > 1800) {
  posted = await postConsensus(openNetworkDb());
  report = await readReport();
}
if (!report) throw new Error("no NVDAB report on-chain");
const age = Math.floor(Date.now() / 1000) - Number(report.updatedAt);
log(`oracle: NVDAB fair value $${formatUnits(report.fairValue, 8)}, next-open band [$${formatUnits(report.lower, 8)}, $${formatUnits(report.upper, 8)}], round ${report.round}, ${age}s old (${posted} reports posted now)`);
if (age > 3000) throw new Error("NVDAB report is stale; is the treasury funded and the oracle reachable?");

// 2. Buy NVDAB through the Binance Trading API (USDT → NVDAB), with a receipt against fair value.
if (!state.steps.buy) {
  const client = new BinanceWeb3Client({ telemetry: [new SqliteTelemetrySink()] });
  const out = await new EoaExecutor(client, executor).swap({ from: USDT, to: NVDAB, amount: BUY_USDT, slippagePercent: "1" });
  // Only a filled swap counts: an RFQ order still pending (no tx hash) must be retried, not skipped.
  if (!out.txHash) throw new Error(`buy not filled yet (order ${out.orderId ?? "?"}); re-run once it settles`);
  done("buy", { tx: out.txHash ?? undefined, mode: out.mode, vendor: out.quote.vendor, verdict: out.receipt?.tca.verdict ?? null, receiptHash: out.receipt?.receiptHash ?? null });
  log(`bought NVDAB with ${formatUnits(BUY_USDT, 18)} USDT via ${out.quote.vendor} (${out.mode}) → ${out.txHash ? tx(out.txHash) : out.orderId}; ${out.receipt?.tca.verdict ?? "receipt pending"}`);
}

// 3. Liquidity: the treasury lends USDT into the vault.
if (!state.steps.lend) {
  await sendContractTx(treasury, USDT, erc20Abi, "approve", [credit, LEND_USDT]);
  const t = await sendContractTx(treasury, credit, creditAbi as Abi, "deposit", [LEND_USDT, treasury.address]);
  if (t.status !== "success") throw new Error(`deposit reverted: ${tx(t.hash)}`);
  done("lend", { tx: t.hash, usdt: formatUnits(LEND_USDT, 18) });
  log(`treasury lent ${formatUnits(LEND_USDT, 18)} USDT → ${tx(t.hash)}`);
}

// 4. Collateral + borrow.
if (!state.steps.collateral) {
  const bal = await publicClient.readContract({ address: NVDAB, abi: erc20Abi, functionName: "balanceOf", args: [borrower] });
  if (bal === 0n) throw new Error("executor holds no NVDAB");
  await sendContractTx(executor, NVDAB, erc20Abi, "approve", [credit, bal]);
  const t = await sendContractTx(executor, credit, creditAbi as Abi, "depositCollateral", [NVDAB, bal, borrower]);
  if (t.status !== "success") throw new Error(`depositCollateral reverted: ${tx(t.hash)}`);
  done("collateral", { tx: t.hash, nvdab: formatUnits(bal, 18) });
  log(`posted ${formatUnits(bal, 18)} NVDAB as collateral → ${tx(t.hash)}`);
}
if (!state.steps.borrow) {
  const acct = (await publicClient.readContract({ address: credit, abi: creditAbi, functionName: "getAccountData", args: [borrower] })) as { borrowPower: bigint; debt: bigint };
  const cash = (await publicClient.readContract({ address: credit, abi: creditAbi, functionName: "cash" })) as bigint;
  const want = (acct.borrowPower * BigInt(Math.round(BORROW_SHARE * 1000))) / 1000n;
  const amount = want < cash ? want : (cash * 9n) / 10n;
  if (amount === 0n) throw new Error(`nothing to borrow (power ${acct.borrowPower}, cash ${cash})`);
  const t = await sendContractTx(executor, credit, creditAbi as Abi, "borrow", [amount, borrower]);
  if (t.status !== "success") throw new Error(`borrow reverted: ${tx(t.hash)}`);
  done("borrow", { tx: t.hash, usdt: formatUnits(amount, 18), borrowPower: formatUnits(acct.borrowPower, 18) });
  log(`borrowed ${formatUnits(amount, 18)} USDT against NVIDIA on a ${new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} → ${tx(t.hash)}`);
}

const acct = (await publicClient.readContract({ address: credit, abi: creditAbi, functionName: "getAccountData", args: [borrower] })) as {
  debt: bigint;
  borrowPower: bigint;
  liquidationValue: bigint;
  healthFactor: bigint;
};
state.summary = {
  borrower,
  credit,
  oracleRound: Number(report.round),
  fairValue: formatUnits(report.fairValue, 8),
  valuedAt: formatUnits(report.lower, 8),
  debtUsdt: formatUnits(acct.debt, 18),
  borrowPowerUsdt: formatUnits(acct.borrowPower, 18),
  healthFactor: formatUnits(acct.healthFactor, 18),
  checkedAt: new Date().toISOString(),
};
save();
log(`position: debt ${formatUnits(acct.debt, 18)} USDT, borrow power ${formatUnits(acct.borrowPower, 18)} USDT, health factor ${Number(formatUnits(acct.healthFactor, 18)).toFixed(2)} (collateral valued at the band's lower edge $${formatUnits(report.lower, 8)}, not the $${formatUnits(report.fairValue, 8)} fair value)`);
