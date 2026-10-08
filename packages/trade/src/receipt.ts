/**
 * Nightshift Receipt v1 — proof of what a tokenized-stock trade actually cost, per real share,
 * against the fair value Nightshift had published at that moment.
 *
 * Works for ANY swap on BSC (Agentic Wallet `baw` trades, our executor, a DEX UI): the receipt is
 * rebuilt from the chain itself — ERC-20 Transfer logs of the transaction — never from what the
 * trader claims. Anyone can re-derive it from the tx hash; the receipt hash (keccak256 of its
 * canonical JSON) pins every number.
 */
import { DatabaseSync } from "node:sqlite";
import { BSC, sessionAt } from "@nightshift/core";
import { DEFAULT_DB_PATH } from "@nightshift/tape";
import { type Hex, createPublicClient, decodeEventLog, erc20Abi, http, keccak256, parseAbiItem, toHex } from "viem";
import { bsc } from "viem/chains";

const client = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org", { retryCount: 3 }) });
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** Stablecoins treated as USD 1:1 for pricing (BSC). */
export const STABLES: Record<string, string> = {
  "0x55d398326f99059ff775485246999027b3197955": "USDT",
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC",
  "0xce24439f2d9c6a2289f741120fe202248b666666": "U",
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": "USD1",
};

export interface ReceiptV1 {
  version: "nightshift.receipt.v1";
  chainId: 56;
  txHash: Hex;
  block: number;
  timestamp: string;
  trader: string;
  side: "buy" | "sell";
  token: { address: string; symbol: string; ticker: string; sharesPerToken: number };
  payToken: { address: string; symbol: string };
  amountToken: number;
  amountUsd: number;
  pricePerToken: number;
  pricePerShare: number;
  session: string;
  reference: { round: number; fairValue: number; lower: number; upper: number; anchorTime: string } | null;
  tca: { vsFairValueBps: number | null; insideBand: boolean | null; verdict: string };
  receiptHash: Hex;
}

interface Inst {
  address: string;
  symbol: string;
  ticker: string;
  multiplier: number;
  decimals: number;
}

/** Canonical JSON (sorted keys) so the hash is reproducible across implementations. */
export function canonical(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  return `{${Object.keys(x as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export async function buildReceipt(txHash: Hex, opts: { trader?: string; dbPath?: string } = {}): Promise<ReceiptV1> {
  const db = new DatabaseSync(opts.dbPath ?? DEFAULT_DB_PATH, { readOnly: true });
  try {
    const [tx, receipt] = await Promise.all([client.getTransaction({ hash: txHash }), client.getTransactionReceipt({ hash: txHash })]);
    if (receipt.status !== "success") throw new Error(`transaction ${txHash} reverted`);
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const ts = Number(block.timestamp) * 1000;
    const trader = (opts.trader ?? tx.from).toLowerCase();

    // Net token flows into/out of the trader, from the logs alone.
    const flows = new Map<string, bigint>();
    for (const log of receipt.logs) {
      if (log.topics[0] !== keccak256(toHex("Transfer(address,address,uint256)"))) continue;
      try {
        const ev = decodeEventLog({ abi: [TRANSFER], data: log.data, topics: log.topics });
        const { from, to, value } = ev.args as { from: string; to: string; value: bigint };
        const token = log.address.toLowerCase();
        if (to.toLowerCase() === trader) flows.set(token, (flows.get(token) ?? 0n) + value);
        if (from.toLowerCase() === trader) flows.set(token, (flows.get(token) ?? 0n) - value);
      } catch {
        /* non-standard Transfer encodings are ignored */
      }
    }
    const lookup = db.prepare(`SELECT address, symbol, ticker, multiplier, decimals FROM instruments WHERE chain_id = ? AND address = ?`);
    let stock: { inst: Inst; delta: bigint } | null = null;
    let stable: { address: string; delta: bigint } | null = null;
    for (const [addr, delta] of flows) {
      if (delta === 0n) continue;
      const inst = lookup.get(BSC, addr) as Inst | undefined;
      if (inst) stock = { inst, delta };
      else if (STABLES[addr]) stable = { address: addr, delta };
    }
    if (!stock) throw new Error("no tokenized-stock transfer to/from the trader in this transaction");
    if (!stable) throw new Error("no USD stablecoin leg found (pay with USDT, USDC, U or USD1 for a priced receipt)");
    const stableDecimals = Number(await client.readContract({ address: stable.address as Hex, abi: erc20Abi, functionName: "decimals" }));
    const side: "buy" | "sell" = stock.delta > 0n ? "buy" : "sell";
    const amountToken = Math.abs(Number(stock.delta)) / 10 ** stock.inst.decimals;
    const amountUsd = Math.abs(Number(stable.delta)) / 10 ** stableDecimals;
    const pricePerToken = amountUsd / amountToken;
    const pricePerShare = pricePerToken / stock.inst.multiplier;

    // The fair value Nightshift had published at that moment (latest consensus at or before the block).
    const ref = db
      .prepare(`SELECT round, fair_value, lower, upper, anchor_time FROM consensus WHERE token = ? AND computed_at <= ? ORDER BY computed_at DESC LIMIT 1`)
      .get(stock.inst.address, ts) as { round: number; fair_value: number; lower: number; upper: number; anchor_time: number } | undefined;
    const vs = ref ? ((pricePerToken - ref.fair_value) / ref.fair_value) * 1e4 * (side === "buy" ? 1 : -1) : null;
    const inside = ref ? pricePerToken >= ref.lower && pricePerToken <= ref.upper : null;
    // vs > 0 means the trade was worse than fair value for the trader (bought above / sold below).
    const band = inside ? " (inside the 90% band)" : " (OUTSIDE the 90% band)";
    const verdict =
      vs == null
        ? "no Nightshift reference at trade time"
        : side === "buy"
          ? vs <= 0
            ? `bought ${Math.abs(vs).toFixed(1)} bps below fair value`
            : `bought ${vs.toFixed(1)} bps above fair value${band}`
          : vs <= 0
            ? `sold ${Math.abs(vs).toFixed(1)} bps above fair value`
            : `sold ${vs.toFixed(1)} bps below fair value${band}`;

    const body = {
      version: "nightshift.receipt.v1" as const,
      chainId: 56 as const,
      txHash,
      block: Number(receipt.blockNumber),
      timestamp: new Date(ts).toISOString(),
      trader,
      side,
      token: { address: stock.inst.address, symbol: stock.inst.symbol, ticker: stock.inst.ticker, sharesPerToken: stock.inst.multiplier },
      payToken: { address: stable.address, symbol: STABLES[stable.address]! },
      amountToken,
      amountUsd,
      pricePerToken,
      pricePerShare,
      session: sessionAt(ts),
      reference: ref ? { round: ref.round, fairValue: ref.fair_value, lower: ref.lower, upper: ref.upper, anchorTime: new Date(ref.anchor_time).toISOString() } : null,
      tca: { vsFairValueBps: vs == null ? null : Number(vs.toFixed(2)), insideBand: inside, verdict },
    };
    return { ...body, receiptHash: keccak256(toHex(canonical(body))) };
  } finally {
    db.close();
  }
}

/** Re-derive a receipt from the chain and check every field matches (what `nightshift verify` does). */
export async function verifyReceipt(r: ReceiptV1, dbPath?: string): Promise<{ ok: boolean; recomputedHash: Hex }> {
  const again = await buildReceipt(r.txHash, { trader: r.trader, dbPath });
  return { ok: again.receiptHash === r.receiptHash, recomputedHash: again.receiptHash };
}
