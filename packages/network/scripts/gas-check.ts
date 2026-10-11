/** Read-only: build a USDT→token swap for a wallet and compare the API's gas with our simulation. Nothing is signed. */
import { BinanceWeb3Client } from "@nightshift/sdk";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
process.loadEnvFile(".env");
const [from, to, amount] = [process.argv[2] as `0x${string}`, process.argv[3] as `0x${string}`, process.argv[4]!];
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const pc = createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });
const c = new BinanceWeb3Client();
const common = { binanceChainId: "56", amount, fromTokenAddress: USDT, toTokenAddress: to, userWalletAddress: from };
const q = (await c.trading.quote(common)) as Record<string, string>[] | Record<string, string>;
const best = (Array.isArray(q) ? (q.find((r) => (r as { isBest?: boolean }).isBest) ?? q[0]) : q)!;
console.log(`quote: mode ${best.executionMode} vendor ${best.vendorName} out ${best.toTokenAmount}`);
const s = (await c.trading.swap({ ...common, quoteId: best.quoteId!, slippagePercent: process.argv[5] ?? "1" })) as { tx?: { to: string; data: string; value?: string; gas?: string } };
const est = await pc.estimateGas({ account: from, to: s.tx!.to as `0x${string}`, data: s.tx!.data as `0x${string}`, value: BigInt(s.tx!.value ?? "0") }).catch((e) => `FAILS: ${(e as Error).message.split("\n")[0]}`);
console.log(`API gas ${s.tx!.gas} · simulated ${est}`);
