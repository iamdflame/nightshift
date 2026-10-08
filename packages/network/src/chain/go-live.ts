/**
 * Go-live: take the Night Shift from local to BSC mainnet in one command, idempotently.
 *
 *   pnpm exec tsx packages/network/src/chain/go-live.ts            # readiness report only (spends nothing)
 *   pnpm exec tsx packages/network/src/chain/go-live.ts --execute  # deploy, register, fund jobs
 *
 * Steps (each skipped when already done):
 *   1. balances of every agent wallet (BNB for gas, USDT, U)
 *   2. contracts → BSC (deploy/deploy-contracts.sh --broadcast) unless deployments/56.json exists
 *   3. ERC-8004 identities for treasury/anchor/echo/nfv/executor
 *   4. U (United Stables, the ERC-8183 payment token) for the treasury: swap USDT→U via the
 *      Binance Trading API when below the job budget
 * Then: NIGHTSHIFT_CHAIN=1 for the runner, and `jobs.ts open` before the next open.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { BinanceWeb3Client, SqliteTelemetrySink } from "@nightshift/sdk";
import { EoaExecutor } from "@nightshift/trade";
import { createPublicClient, erc20Abi, formatEther, http } from "viem";
import { bsc } from "viem/chains";
import { loadEnv } from "../env.ts";
import { registerAll } from "./identity.ts";
import { ROLES, walletFor } from "./wallets.ts";

loadEnv();
const EXECUTE = process.argv.includes("--execute");
const pc = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org") });
const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;
const U = "0xcE24439F2D9C6a2289F741120FE202248B666666" as const;
const STUDIO_AGENT = "0x9D9675C5523b3b2D42E9989ae13B6081536aC29b" as const;
const MIN_GAS_BNB = 0.002;
const U_TARGET = 2n * 10n ** 18n; // 2 U: ten forecasting jobs at 0.2 U

const fmt = (x: bigint) => Number(formatEther(x)).toFixed(4);
const bal = async (a: `0x${string}`) => ({
  bnb: await pc.getBalance({ address: a }),
  usdt: await pc.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [a] }),
  u: await pc.readContract({ address: U, abi: erc20Abi, functionName: "balanceOf", args: [a] }),
});

console.log(`\n== Night Shift go-live (${EXECUTE ? "EXECUTE" : "readiness report"})\n`);
const wallets = Object.fromEntries(ROLES.map((r) => [r, walletFor(r).address])) as Record<string, `0x${string}`>;
wallets["studio-agent"] = STUDIO_AGENT;
const balances: Record<string, Awaited<ReturnType<typeof bal>>> = {};
for (const [role, addr] of Object.entries(wallets)) {
  balances[role] = await bal(addr);
  const b = balances[role]!;
  const ok = Number(formatEther(b.bnb)) >= MIN_GAS_BNB;
  console.log(`${ok ? "✓" : "✗"} ${role.padEnd(13)} ${addr}  BNB ${fmt(b.bnb)}  USDT ${fmt(b.usdt)}  U ${fmt(b.u)}${ok ? "" : "   ← needs BNB for gas"}`);
}

const apiKey = Boolean(process.env.BINANCE_WEB3_API_KEY && process.env.BINANCE_WEB3_SECRET_KEY);
console.log(`\n${apiKey ? "✓" : "✗"} Binance Web3 API key in .env`);
const deployed = existsSync("deployments/56.json");
console.log(`${deployed ? "✓" : "✗"} contracts deployed (deployments/56.json)`);
const registered = existsSync("deployments/agents.json") ? Object.keys(JSON.parse(readFileSync("deployments/agents.json", "utf8"))).length : 0;
console.log(`${registered >= ROLES.length ? "✓" : "✗"} ERC-8004 identities: ${registered}/${ROLES.length}`);
const tU = balances.treasury!.u;
console.log(`${tU >= U_TARGET ? "✓" : "✗"} treasury U for ERC-8183 jobs: ${fmt(tU)} / ${fmt(U_TARGET)}`);

if (!EXECUTE) {
  console.log("\nRe-run with --execute to perform the missing steps.");
  process.exit(0);
}

const treasuryGas = Number(formatEther(balances.treasury!.bnb)) >= MIN_GAS_BNB;
if (!deployed) {
  if (!treasuryGas) throw new Error("treasury needs BNB before deploying");
  console.log("\n→ deploying contracts …");
  const r = spawnSync("bash", ["deploy/deploy-contracts.sh", "--broadcast"], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("contract deployment failed");
}
console.log("\n→ ERC-8004 registrations …");
await registerAll(false);

if (tU < U_TARGET) {
  if (!apiKey) console.log("! skip USDT→U: needs the Binance Web3 API key");
  else if (balances.treasury!.usdt < U_TARGET - tU) console.log("! skip USDT→U: treasury needs USDT");
  else {
    console.log(`\n→ swapping ${fmt(U_TARGET - tU)} USDT → U via the Binance Trading API …`);
    const client = new BinanceWeb3Client({ telemetry: [new SqliteTelemetrySink()] });
    const out = await new EoaExecutor(client, walletFor("treasury")).swap({ from: USDT, to: U, amount: U_TARGET - tU, slippagePercent: "0.5" });
    console.log(`  ${out.mode} ${out.txHash ?? out.orderId}`);
  }
}
console.log("\nDone. Next: set NIGHTSHIFT_CHAIN=1 in .env (the supervisor restarts the runner with publishing on), then open forecasting jobs: pnpm exec tsx packages/network/src/chain/jobs.ts open");
