/** Scan blocks around a UTC time for transactions sent by an address (status + gas). */
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
const pc = createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org", { retryCount: 3 }) });
const addr = process.argv[2]!.toLowerCase();
const when = Date.parse(process.argv[3]!) / 1000;
const span = Number(process.argv[4] ?? 40);
const head = await pc.getBlock();
let b = head.number - BigInt(Math.round((Number(head.timestamp) - when) / 0.75));
for (let k = 0; k < 6; k++) { const blk = await pc.getBlock({ blockNumber: b }); b += BigInt(Math.round((when - Number(blk.timestamp)) / 0.75)); }
for (let x = b - BigInt(span); x <= b + BigInt(span); x++) {
  const blk = await pc.getBlock({ blockNumber: x, includeTransactions: true });
  for (const tx of blk.transactions) if (typeof tx !== "string" && tx.from.toLowerCase() === addr) {
    const r = await pc.getTransactionReceipt({ hash: tx.hash });
    console.log(`${new Date(Number(blk.timestamp) * 1000).toISOString()} block ${x} nonce ${tx.nonce} ${tx.hash} to ${tx.to} ${r.status} gas ${r.gasUsed}/${tx.gas}`);
  }
}
