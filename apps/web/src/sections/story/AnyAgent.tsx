import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { HashChip } from "@/components/ui/HashChip";
import { ease } from "@/lib/motion";
import { bps, num, short, usd } from "@/lib/format";
import { useOnchain, useX402 } from "@/lib/queries";
import { Heading } from "./Heading";

/** The real Agentic Wallet trade, printed like a till receipt (every field from the on-chain receipt). */
function Receipt() {
  const { data: oc } = useOnchain();
  const t = oc?.agenticWalletTrades[0];
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  if (!t) return <div className="h-[520px] rounded-[6px] bg-night-2/60" aria-hidden />;
  const r = t.receipt;
  const when = new Date(r.timestamp);
  const lines: [string, string][] = [
    ["Wallet", short(t.wallet)],
    ["Time", `${when.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" })} ET`],
    ["Session", r.session === "closed" ? "US market closed" : r.session],
    ["Paid", `${num(r.amountUsd, 2)} ${r.payToken.symbol}`],
    ["Received", `${num(r.amountToken, 6)} ${r.token.symbol}`],
    ["Price per token", usd(r.pricePerToken)],
    ["Per real share", usd(r.pricePerShare)],
    ["Fair value per token then", r.reference ? usd(r.reference.fairValue) : "–"],
    ["90% band", r.reference ? `${usd(r.reference.lower)} – ${usd(r.reference.upper)}` : "–"],
    // The verdict's own figure, so the row and the verdict never round differently (34.75 → "34.7" there, "34.8" by toFixed).
    ["Price vs fair value", r.tca.vsFairValueBps == null ? "–" : `${r.tca.vsFairValueBps >= 0 ? "+" : "−"}${r.tca.verdict.match(/([\d.]+) bps/)?.[1] ?? Math.abs(r.tca.vsFairValueBps).toFixed(1)} bps`],
  ];
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[380px]">
      <div className="mx-auto h-3 w-[92%] rounded-t-md bg-night-3 shadow-[var(--elev-2)]" aria-hidden />
      <motion.div
        initial={reduce ? false : { clipPath: "inset(0 0 100% 0)" }}
        whileInView={{ clipPath: "inset(0 0 0% 0)" }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 2.2, ease: ease.out }}
        className="ns-receipt relative mx-auto w-[88%] bg-[#F4F1E8] px-6 pb-8 pt-6 text-night-0 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.8)]"
      >
        <p className="text-center font-display text-[1.35rem]">Nightshift receipt</p>
        <p className="mt-0.5 text-center text-[11px] text-night-0/60">nightshift.receipt.v1, rebuilt from chain logs</p>
        <div className="my-4 border-t border-dashed border-night-0/30" />
        <dl className="grid gap-1.5 text-[12.5px]">
          {lines.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-night-0/65">{k}</dt>
              <dd className="num text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="my-4 border-t border-dashed border-night-0/30" />
        <p className="text-center text-[15px] font-medium leading-snug">{r.tca.verdict}</p>
        <div className="my-4 border-t border-dashed border-night-0/30" />
        <p className="num break-all text-center text-[10px] leading-relaxed text-night-0/60">receiptHash {r.receiptHash}</p>
        <div className="mt-4 flex justify-center">
          <a href={`https://bscscan.com/tx/${t.txHash}`} target="_blank" rel="noreferrer" className="num rounded border border-night-0/25 px-2 py-1 text-[11px] text-night-0/80 hover:bg-night-0/5">
            tx {short(t.txHash)}
          </a>
        </div>
      </motion.div>
    </div>
  );
}

export default function AnyAgent() {
  const { data: oc } = useOnchain();
  const { data: x } = useX402();
  const t = oc?.agenticWalletTrades[0];
  const live = x?.status === "live";
  return (
    <section className="relative border-t border-rule bg-night-0 py-[clamp(5rem,9vw,8.5rem)]" aria-labelledby="agent-title">
      <div className="mx-auto grid max-w-[1320px] gap-16 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <Heading id="agent-title" kicker="For the Binance Agentic Wallet" title="Any agent can use it, and prove what it paid.">
            The Nightshift Wallet Skill turns "buy NVIDIA" into the cheapest real share, checks the price against Nightshift's band, and only then trades with the Agentic Wallet. Afterwards anyone can rebuild the trade from the chain
            and see exactly what it cost against fair value.
          </Heading>
          <div className="mt-10 grid gap-4">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-rule px-4 py-2.5 text-[12.5px] text-moon-3">
                <span>The real trade, from Claude Code with the Agentic Wallet</span>
                {t && <HashChip value={t.txHash} />}
              </div>
              <pre className="num whitespace-pre-wrap break-all px-4 py-4 text-[12.5px] leading-relaxed text-moon-1">
                {t?.command ?? "baw market-order swap …"}
                {"\n\n"}
                <span className="text-moon-3">GET</span> /v1/receipts/{t ? short(t.txHash, 10, 6) : "{tx}"}
              </pre>
            </div>
            <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="text-[14px] font-medium text-moon-0">Pay per query over x402</p>
                <p className="mt-0.5 text-[13.5px] text-moon-2">
                  {live
                    ? `The full report costs ${x?.priceUsd} USD, settled by Binance B402 into the treasury that pays the oracle's gas. The endpoint answers 402 today; no payment has settled yet.`
                    : "Pay-per-query (0.01 USD, settled by Binance B402) switches on once the facilitator approves our merchant account. The endpoint is built and tested."}
                </p>
              </div>
              <span className={`num rounded-md px-2.5 py-1 text-[12.5px] ${live ? "bg-sodium text-night-0" : "text-moon-2 hairline"}`}>{live ? "live" : "awaiting B402"}</span>
            </div>
          </div>
        </div>
        <Receipt />
      </div>
    </section>
  );
}
