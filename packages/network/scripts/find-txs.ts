/** Find recent transactions from an address: its ERC-20 Approval logs, then the following blocks. */
import { createPublicClient, http, parseAbiItem } from "viem";
import { bsc } from "viem/chains";
const logs = createPublicClient({ chain: bsc, transport: http("https://bsc-rpc.publicnode.com", { retryCount: 3 }) });
const pc = createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org", { retryCount: 3 }) });
const addr = (process.argv[2] as string).toLowerCase() as `0x${string}`;
const token = process.argv[3] as `0x${string}`;
const lookback = BigInt(process.argv[4] ?? "3000");
const head = await pc.getBlockNumber();
const ev = parseAbiItem("event Approval(address indexed owner, address indexed spender, uint256 value)");
const found: bigint[] = [];
for (let b = head - lookback; b <= head; b += 500n) {
  const to = b + 499n > head ? head : b + 499n;
  const ls = await logs.getLogs({ address: token, event: ev, args: { owner: addr }, fromBlock: b, toBlock: to });
  for (const l of ls) { console.log(`Approval block ${l.blockNumber} tx ${l.transactionHash} spender ${l.args.spender}`); found.push(l.blockNumber!); }
}
for (const start of found) for (let b = start; b < start + 30n; b++) {
  const blk = await pc.getBlock({ blockNumber: b, includeTransactions: true });
  for (const tx of blk.transactions) if (typeof tx !== "string" && tx.from.toLowerCase() === addr) {
    const r = await pc.getTransactionReceipt({ hash: tx.hash });
    console.log(`block ${b} ${new Date(Number(blk.timestamp) * 1000).toISOString()} nonce ${tx.nonce} ${tx.hash} to ${tx.to} ${r.status} gas ${r.gasUsed}/${tx.gas}`);
  }
}
