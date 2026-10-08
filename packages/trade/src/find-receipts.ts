import { createPublicClient, http, parseAbiItem } from "viem";
import { bsc } from "viem/chains";
import { buildReceipt } from "./receipt.ts";
const scan = createPublicClient({ chain: bsc, transport: http("https://bsc-rpc.publicnode.com", { retryCount: 4 }) });
const token = (process.argv[2] ?? "0x02fca66c1d1afb4e2a7884261eb00f63598a7436") as `0x${string}`;
const head = await scan.getBlockNumber();
const seen = new Set<string>();
let built = 0;
for (let to = head - 30n; to > head - 3000n && built < 3; to -= 100n) {
  let logs: { transactionHash: `0x${string}` | null }[] = [];
  try {
    logs = await scan.getLogs({ address: token, event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"), fromBlock: to - 99n, toBlock: to });
  } catch { continue; }
  for (const l of logs) {
    const h = l.transactionHash!;
    if (seen.has(h)) continue;
    seen.add(h);
    try {
      const r = await buildReceipt(h);
      console.log(JSON.stringify({ tx: h, side: r.side, token: r.token.symbol, qty: +r.amountToken.toFixed(5), usd: +r.amountUsd.toFixed(2), pay: r.payToken.symbol, perToken: +r.pricePerToken.toFixed(3), perShare: +r.pricePerShare.toFixed(3), session: r.session, fairValue: r.reference && +r.reference.fairValue.toFixed(3), band: r.reference && [+r.reference.lower.toFixed(2), +r.reference.upper.toFixed(2)], tca: r.tca.verdict }));
      if (++built >= 3) break;
    } catch {}
  }
}
console.log(`scanned ${seen.size} txs, receipts ${built}`);
