// Buy one Nightshift fair-value report over x402 with the Binance Agentic Wallet: GET → 402 PAYMENT-REQUIRED →
// `baw x402-payment preview` → `baw x402-payment sign` → replay with PAYMENT-SIGNATURE. $0.01 in USDT, settled
// by Binance's B402 facilitator to the Nightshift treasury.
//
//   node scripts/x402-buy.mjs            # preview only: shows what would be paid, signs nothing
//   node scripts/x402-buy.mjs --pay      # signs with your Agentic Wallet and replays the request
//   node scripts/x402-buy.mjs --pay TSLAB
import { spawnSync } from "node:child_process";

const API = process.env.NIGHTSHIFT_API ?? "https://nightshift-production-f4e3.up.railway.app";
const PAY = process.argv.includes("--pay");
const symbol = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "NVDAB";
const url = `${API}/x402/fair-value/${symbol}`;

function baw(args) {
  const r = spawnSync("baw", args, { encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`baw ${args[0]} ${args[1]} failed: ${(r.stderr || r.stdout).trim()}`);
  return JSON.parse(r.stdout);
}
/** The replay header value, wherever this baw version puts it. */
function headerValue(signed) {
  const d = signed.data ?? signed;
  for (const k of ["paymentSignature", "PAYMENT-SIGNATURE", "headerValue", "header", "value", "signature", "xPayment"]) if (typeof d[k] === "string") return d[k];
  const found = Object.values(d).find((v) => typeof v === "string" && v.length > 100);
  if (!found) throw new Error(`no replay header in sign output: ${JSON.stringify(signed).slice(0, 400)}`);
  return found;
}

const first = await fetch(url);
if (first.status !== 402) throw new Error(`expected 402, got ${first.status}: ${(await first.text()).slice(0, 200)}`);
const required = first.headers.get("payment-required");
if (!required) throw new Error("402 without a PAYMENT-REQUIRED header");

const preview = baw(["x402-payment", "preview", "--paymentRequirements", required, "--json"]);
const options = preview.data?.options ?? [];
const pick = options.find((o) => o.status === "READY_TO_SIGN" && o.tokenSymbol === "USDT") ?? options.find((o) => o.status === "READY_TO_SIGN");
console.log(`resource: ${url}`);
for (const o of options) console.log(`  option ${o.index}: ${o.amount} ${o.tokenSymbol ?? o.originalAccept?.extra?.name} ${o.status}${o.reasons?.length ? ` (${o.reasons.join("; ")})` : ""}`);
if (!pick) throw new Error("no option is ready to sign (fund the Agentic Wallet with USDT, U or USD1)");
console.log(`would pay ${pick.amount} ${pick.tokenSymbol} from ${pick.userWalletAddress} to ${pick.payTo}`);
if (!PAY) {
  console.log("\nPreview only. Re-run with --pay to sign with your Agentic Wallet and fetch the paid report.");
  process.exit(0);
}

const signed = baw(["x402-payment", "sign", "--paymentId", preview.data.paymentId, "--selectedIndex", String(pick.index), "--json"]);
const paid = await fetch(url, { headers: { "PAYMENT-SIGNATURE": headerValue(signed) } });
console.log(`\nreplay: HTTP ${paid.status}`);
const settlement = paid.headers.get("payment-response");
if (settlement) {
  try {
    console.log("settlement:", JSON.stringify(JSON.parse(Buffer.from(settlement, "base64").toString("utf8")), null, 2));
  } catch {
    console.log("settlement header:", settlement.slice(0, 200));
  }
}
console.log((await paid.text()).slice(0, 1200));
