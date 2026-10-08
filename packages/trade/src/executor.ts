/**
 * Nightshift Trade executor (EOA mode): executes a swap on BSC through the official Binance Web3
 * Trading API, signed by an agent wallet (@bnbagent/sdk keystore), broadcast through the
 * Transaction API with MEV protection, and closed out with a Nightshift Receipt v1.
 *
 *   SWAP mode  quote → (approve if needed) → swap calldata → sign → broadcast → receipt
 *   RFQ mode   quote → swap returns rfq.typedDataToSign → EIP-712 sign → submitOrder → poll → receipt
 *
 * Market-closed refusals (40367 Ondo / 40369 bStock) surface as BinanceWeb3Error kind
 * "market_closed" so callers can fall back to a limit order or wait for the open.
 */
import type { EVMWalletProvider } from "@bnbagent/sdk";
import type { BinanceWeb3Client } from "@nightshift/sdk";
import { type Hex, createPublicClient, erc20Abi, http } from "viem";
import { bsc } from "viem/chains";
import { type ReceiptV1, buildReceipt } from "./receipt.ts";

const CHAIN = "56";
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const pc = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org", { retryCount: 3 }) });

export interface SwapIntent {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: bigint; // base units of `from`
  slippagePercent?: string; // e.g. "0.5"
  mevProtection?: boolean;
}

export interface SwapOutcome {
  mode: "SWAP" | "RFQ";
  txHash: Hex | null;
  orderId: string | null;
  quote: { toTokenAmount: string | null; priceImpactPercent: string | null; vendor: string | null };
  receipt: ReceiptV1 | null;
}

type Route = Record<string, unknown> & { quoteId?: string; executionMode?: string; isBest?: boolean; approveTarget?: string | null; toTokenAmount?: string; priceImpactPercent?: string | null; vendorName?: string };

const pickBest = (r: unknown): Route => {
  const list = (Array.isArray(r) ? r : [r]) as Route[];
  const best = list.find((x) => x.isBest) ?? list[0];
  if (!best?.quoteId) throw new Error("no executable route returned by the Trading API");
  return best;
};

export class EoaExecutor {
  constructor(
    private readonly client: BinanceWeb3Client,
    private readonly wallet: EVMWalletProvider,
  ) {}

  private async signAndBroadcast(tx: { to: `0x${string}`; data: Hex; value?: bigint; gas?: bigint }, mev: boolean): Promise<Hex> {
    const from = this.wallet.address;
    const [nonce, gasPrice] = await Promise.all([pc.getTransactionCount({ address: from, blockTag: "pending" }), pc.getGasPrice()]);
    const gas = tx.gas ?? (await pc.estimateGas({ account: from, to: tx.to, data: tx.data, value: tx.value ?? 0n }));
    const signed = await this.wallet.signTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0n, nonce, gasPrice, gas: (gas * 13n) / 10n, chainId: bsc.id, type: "legacy" });
    const b = (await this.client.transaction.broadcast({ binanceChainId: CHAIN, signedTransaction: signed.rawTransaction, address: from, enableMevProtection: mev })) as { txHash?: string };
    const hash = (b.txHash ?? signed.hash) as Hex;
    const r = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (r.status !== "success") throw new Error(`transaction ${hash} reverted`);
    return hash;
  }

  private async ensureAllowance(token: `0x${string}`, amount: bigint, spenderHint: string | null | undefined, mev: boolean): Promise<void> {
    if (token.toLowerCase() === NATIVE) return;
    const ap = (await this.client.trading.approveTransaction({ binanceChainId: CHAIN, tokenContractAddress: token, approveAmount: amount.toString() })) as Record<string, string> | Record<string, string>[];
    const a = (Array.isArray(ap) ? ap[0] : ap) ?? {};
    const spender = (a.dexContractAddress ?? spenderHint) as `0x${string}` | undefined;
    if (!spender) throw new Error("Trading API returned no spender for approval");
    const allowance = await pc.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [this.wallet.address, spender] });
    if (allowance >= amount) return;
    await this.signAndBroadcast({ to: token, data: a.data as Hex }, mev);
  }

  async swap(intent: SwapIntent): Promise<SwapOutcome> {
    const mev = intent.mevProtection ?? true;
    const common = { binanceChainId: CHAIN, amount: intent.amount.toString(), fromTokenAddress: intent.from, toTokenAddress: intent.to, userWalletAddress: this.wallet.address };
    const best = pickBest(await this.client.trading.quote(common));
    const quote = { toTokenAmount: best.toTokenAmount ?? null, priceImpactPercent: best.priceImpactPercent ?? null, vendor: best.vendorName ?? null };

    if (best.executionMode === "RFQ") {
      const s = (await this.client.trading.swap({ ...common, quoteId: best.quoteId!, slippagePercent: intent.slippagePercent ?? "0.5" })) as { rfq?: { vendor?: string; typedDataToSign?: string; signingScheme?: string; orderId?: string } | null };
      const rfq = s.rfq;
      if (!rfq?.typedDataToSign) throw new Error("RFQ route without typedDataToSign");
      const td = JSON.parse(rfq.typedDataToSign) as { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; message: Record<string, unknown> };
      const { EIP712Domain: _drop, ...types } = td.types;
      const sig = await this.wallet.signTypedData(td.domain as never, types, td.message);
      const sub = (await this.client.trading.submitOrder({ userSignature: sig.signature, vendor: rfq.vendor ?? best.vendorName ?? "", quoteId: rfq.orderId ?? best.quoteId!, signingScheme: rfq.signingScheme })) as { orderId?: string };
      const orderId = sub.orderId ?? rfq.orderId ?? null;
      let txHash: Hex | null = null;
      for (let i = 0; orderId && i < 30; i++) {
        const st = (await this.client.trading.orderStatus(orderId)) as { status?: string; txHash?: string };
        if (st.status === "FILLED") {
          txHash = (st.txHash as Hex) ?? null;
          break;
        }
        if (st.status === "FAILED") throw new Error(`RFQ order ${orderId} failed`);
        await new Promise((r) => setTimeout(r, 3_000));
      }
      return { mode: "RFQ", txHash, orderId, quote, receipt: txHash ? await buildReceipt(txHash, { trader: this.wallet.address }).catch(() => null) : null };
    }

    await this.ensureAllowance(intent.from, intent.amount, best.approveTarget, mev);
    const s = (await this.client.trading.swap({ ...common, quoteId: best.quoteId!, slippagePercent: intent.slippagePercent ?? "0.5" })) as { tx?: { to?: string; data?: string; value?: string; gas?: string } };
    if (!s.tx?.to || !s.tx.data) throw new Error("swap returned no transaction");
    const hash = await this.signAndBroadcast({ to: s.tx.to as `0x${string}`, data: s.tx.data as Hex, value: BigInt(s.tx.value ?? "0"), gas: s.tx.gas ? BigInt(s.tx.gas) : undefined }, mev);
    return { mode: "SWAP", txHash: hash, orderId: null, quote, receipt: await buildReceipt(hash, { trader: this.wallet.address }).catch(() => null) };
  }
}
