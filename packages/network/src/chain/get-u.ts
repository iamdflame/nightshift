/**
 * U (United Stables, the ERC-8183 payment token on BSC) for the treasury, bought on PancakeSwap v3's USDT/U pool
 * (0.01% tier). The Binance Trading API route for USDT→U reverted on-chain twice (docs/der/EVIDENCE.md), so the
 * escrow is funded with one direct swap instead.
 *
 *   pnpm exec tsx packages/network/src/chain/get-u.ts                 # dry run: balances, quote, contract checks
 *   pnpm exec tsx packages/network/src/chain/get-u.ts --execute       # approve USDT (if needed), simulate, swap
 *   pnpm exec tsx packages/network/src/chain/get-u.ts --execute --usdt 1.5
 *
 * Run it away from :00 and :30 UTC: the Railway runner signs oracle posts with the same treasury key then.
 */
import { readFileSync } from "node:fs";
import { type Abi, erc20Abi, formatUnits, parseAbi, parseUnits } from "viem";
import { loadEnv } from "../env.ts";
import { publicClient, sendContractTx } from "./send.ts";
import { WALLETS_DIR, walletFor } from "./wallets.ts";

loadEnv();
const EXECUTE = process.argv.includes("--execute");
const usdtArg = process.argv[process.argv.indexOf("--usdt") + 1];
const AMOUNT_IN = parseUnits(process.argv.includes("--usdt") && usdtArg ? usdtArg : "1", 18);

const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;
const U = "0xcE24439F2D9C6a2289F741120FE202248B666666" as const;
const FEE = 100; // the deep USDT/U pool, 0xa0909f81785f87f3e79309f0e73a7d82208094e4
const ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14" as const; // PancakeSwap v3 SwapRouter (BSC)
const QUOTER = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997" as const; // PancakeSwap v3 QuoterV2 (BSC)

const routerAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
]);
const quoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

const treasury = (JSON.parse(readFileSync(`${WALLETS_DIR}/roles.json`, "utf8")) as Record<string, `0x${string}`>).treasury;
if (!treasury) throw new Error(`no treasury in ${WALLETS_DIR}/roles.json`);
const fmt = (x: bigint) => Number(formatUnits(x, 18)).toFixed(4);
const balances = async () => ({
  bnb: await publicClient.getBalance({ address: treasury }),
  usdt: await publicClient.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [treasury] }),
  u: await publicClient.readContract({ address: U, abi: erc20Abi, functionName: "balanceOf", args: [treasury] }),
});

console.log(`\n== U for the ERC-8183 escrow (${EXECUTE ? "EXECUTE" : "dry run"})\n`);
const before = await balances();
console.log(`treasury ${treasury}  BNB ${fmt(before.bnb)}  USDT ${fmt(before.usdt)}  U ${fmt(before.u)}`);
for (const [name, a] of [["SwapRouter", ROUTER], ["QuoterV2", QUOTER]] as const) {
  const code = await publicClient.getCode({ address: a });
  if (!code || code === "0x") throw new Error(`${name} ${a} has no code on BSC`);
}
if (before.usdt < AMOUNT_IN) throw new Error(`treasury holds ${fmt(before.usdt)} USDT, needs ${fmt(AMOUNT_IN)}`);

const { result: quote } = await publicClient.simulateContract({
  address: QUOTER,
  abi: quoterAbi,
  functionName: "quoteExactInputSingle",
  args: [{ tokenIn: USDT, tokenOut: U, amountIn: AMOUNT_IN, fee: FEE, sqrtPriceLimitX96: 0n }],
});
const quoted = quote[0];
const minOut = (quoted * 995n) / 1000n;
console.log(`quote: ${fmt(AMOUNT_IN)} USDT → ${fmt(quoted)} U (min ${fmt(minOut)} U at 0.5% slippage)`);

const allowance = await publicClient.readContract({ address: USDT, abi: erc20Abi, functionName: "allowance", args: [treasury, ROUTER] });
const params = { tokenIn: USDT, tokenOut: U, fee: FEE, recipient: treasury, deadline: BigInt(Math.floor(Date.now() / 1000) + 600), amountIn: AMOUNT_IN, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n };

if (!EXECUTE) {
  console.log(allowance >= AMOUNT_IN ? "allowance: ok" : `allowance: ${fmt(allowance)} USDT → an approve of ${fmt(AMOUNT_IN)} USDT comes first`);
  console.log("\nDry run only. Re-run with --execute (away from :00/:30 UTC) to approve, simulate and swap.");
  process.exit(0);
}

const wallet = walletFor("treasury");
if (allowance < AMOUNT_IN) {
  const a = await sendContractTx(wallet, USDT, erc20Abi as Abi, "approve", [ROUTER, AMOUNT_IN]);
  console.log(`approve ${a.status}: https://bscscan.com/tx/${a.hash}`);
  if (a.status !== "success") process.exit(1);
}
// The swap is simulated from the treasury first, so a bad route never costs gas.
const sim = await publicClient.simulateContract({ account: treasury, address: ROUTER, abi: routerAbi, functionName: "exactInputSingle", args: [params] });
console.log(`simulated: ${fmt(sim.result)} U`);
const s = await sendContractTx(wallet, ROUTER, routerAbi as Abi, "exactInputSingle", [params]);
console.log(`swap ${s.status}: https://bscscan.com/tx/${s.hash}`);
const after = await balances();
console.log(`treasury now  BNB ${fmt(after.bnb)}  USDT ${fmt(after.usdt)}  U ${fmt(after.u)}`);
process.exit(s.status === "success" ? 0 : 1);
