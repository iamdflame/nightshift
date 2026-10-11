import { leafHash, type ForecastLeaf } from "@ns/merkle";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { keccak256, type Hex } from "viem";
import { Countdown } from "@/components/ui/Countdown";
import { HashChip } from "@/components/ui/HashChip";
import { api, type Proof, type Receipt } from "@/lib/api";
import { ADDR, FORECASTERS, type Forecaster } from "@/lib/links";
import { bps, duration, et, short, usd } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useOpens, useRounds } from "@/lib/queries";

type Status = "idle" | "run" | "ok" | "fail";
interface Step {
  key: string;
  title: string;
  status: Status;
  ms?: number;
  detail?: React.ReactNode;
}

const COLORS: Record<Forecaster, string> = { anchor: "#4A8CF0", echo: "#097C60", nfv: "#D66A98" };

const hashPair = (a: Hex, b: Hex): Hex => (BigInt(a) < BigInt(b) ? keccak256(`0x${a.slice(2)}${b.slice(2)}`) : keccak256(`0x${b.slice(2)}${a.slice(2)}`));

function StepRow({ s, i }: { s: Step; i: number }) {
  const icon =
    s.status === "ok" ? (
      <motion.span key="ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.icon} className="grid size-7 place-items-center rounded-full bg-sodium text-night-0">
        <Check size={15} strokeWidth={2.4} />
      </motion.span>
    ) : s.status === "fail" ? (
      <motion.span key="fail" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.icon} className="grid size-7 place-items-center rounded-full bg-down text-night-0">
        <X size={15} strokeWidth={2.4} />
      </motion.span>
    ) : s.status === "run" ? (
      <span className="grid size-7 place-items-center rounded-full text-sodium hairline">
        <Loader2 size={15} className="animate-spin" />
      </span>
    ) : (
      <span className="num grid size-7 place-items-center rounded-full text-[12px] text-moon-3 hairline">{i + 1}</span>
    );
  return (
    <li className={`relative grid grid-cols-[28px_1fr] gap-4 pb-7 ${s.status === "idle" ? "opacity-55" : ""}`}>
      <span className="absolute left-[13.5px] top-8 bottom-0 w-px bg-rule" aria-hidden />
      <AnimatePresence mode="popLayout">{icon}</AnimatePresence>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-sans text-[16px] font-medium tracking-normal text-moon-0">{s.title}</h3>
          {s.ms != null && <span className="num text-[12px] text-moon-3">{s.ms < 1 ? "<1" : Math.round(s.ms)} ms</span>}
        </div>
        {s.detail && <div className="mt-2 text-[14px] text-moon-2">{s.detail}</div>}
      </div>
    </li>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-1.5 last:border-0">
      <span className="text-[13px] text-moon-3">{k}</span>
      <span className="num min-w-0 break-all text-right text-[12.5px] text-moon-1">{v}</span>
    </div>
  );
}

export default function Verify() {
  const [params, setParams] = useSearchParams();
  const { data: rounds } = useRounds(300);
  const [symbol, setSymbol] = useState(params.get("symbol") ?? "NVDAB");
  const [forecaster, setForecaster] = useState<Forecaster>((params.get("forecaster") as Forecaster) || "nfv");
  const committed = useMemo(() => (rounds ?? []).filter((r) => r.commitments?.[forecaster]?.chain === "committed"), [rounds, forecaster]);
  const [round, setRound] = useState<number | null>(params.get("round") ? Number(params.get("round")) : null);
  const [tamper, setTamper] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<{ ok: boolean; proof?: Proof; sealedBefore?: number; committedAt?: number; message?: string } | null>(null);
  const runId = useRef(0);
  const { data: opens } = useOpens(forecaster);

  useEffect(() => {
    if (round == null && committed.length) setRound(committed[0]!.round);
  }, [committed, round]);

  const run = useCallback(async () => {
    if (round == null) return;
    const id = ++runId.current;
    setParams({ symbol, forecaster, round: String(round) }, { replace: true });
    const base: Step[] = [
      { key: "fetch", title: "Fetch the forecast and its Merkle proof", status: "idle" },
      { key: "leaf", title: "Recompute the leaf hash in your browser", status: "idle" },
      { key: "root", title: "Fold the proof into a Merkle root", status: "idle" },
      { key: "chain", title: "Read the sealed root from ForecastBook on BNB Chain", status: "idle" },
      { key: "verify", title: "Ask the contract: was this forecast committed?", status: "idle" },
    ];
    setSteps(base);
    setResult(null);
    const upd = (i: number, patch: Partial<Step>) => id === runId.current && setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const fail = (i: number, detail: React.ReactNode, message: string) => {
      upd(i, { status: "fail", detail: <p role="alert" className="text-down">{detail}</p> });
      setResult({ ok: false, message });
    };
    try {
      // 1. Fetch
      upd(0, { status: "run" });
      let t = performance.now();
      const p = await api.proof(round, forecaster, symbol);
      upd(0, {
        status: "ok",
        ms: performance.now() - t,
        detail: (
          <div className="card mt-1 grid p-3">
            <Kv k="Round" v={p.leaf.round} />
            <Kv k="Token" v={`${p.symbol} ${short(p.leaf.token)}`} />
            <Kv k="Forecast for the open (median)" v={usd(Number(p.leaf.medianE8) / 1e8, 4)} />
            <Kv k="90% band" v={`${usd(Number(p.leaf.lowerE8) / 1e8, 4)} – ${usd(Number(p.leaf.upperE8) / 1e8, 4)}`} />
            <Kv k="For the open at" v={et(p.leaf.anchorTime * 1000)} />
          </div>
        ),
      });
      // 2. Leaf hash (optionally tampered by +$0.01 on the median)
      upd(1, { status: "run" });
      t = performance.now();
      const leaf: ForecastLeaf = {
        round: BigInt(p.leaf.round),
        token: p.leaf.token as `0x${string}`,
        medianE8: BigInt(p.leaf.medianE8) + (tamper ? 1_000_000n : 0n),
        lowerE8: BigInt(p.leaf.lowerE8),
        upperE8: BigInt(p.leaf.upperE8),
        anchorTime: BigInt(p.leaf.anchorTime),
      };
      const mine = leafHash(leaf);
      const leafOk = mine.toLowerCase() === p.leafHash.toLowerCase();
      if (!leafOk && !tamper) return fail(1, <>Your browser computed {short(mine, 10, 8)}, the API said {short(p.leafHash, 10, 8)}.</>, "The leaf hash doesn't match.");
      upd(1, {
        status: leafOk ? "ok" : "fail",
        ms: performance.now() - t,
        detail: (
          <div className="grid gap-1">
            <p>keccak256(keccak256(abi.encode(round, token, median, lower, upper, anchorTime)))</p>
            <HashChip value={mine} kind="root" label={tamper ? "Tampered leaf" : "Leaf"} />
            {!leafOk && (
              <p role="alert" className="text-down">
                Tampered by $0.01: the hash changed completely from {short(p.leafHash, 8, 6)} to {short(mine, 8, 6)}.
              </p>
            )}
          </div>
        ),
      });
      // 3. Fold the proof
      upd(2, { status: "run" });
      t = performance.now();
      let h: Hex = mine;
      for (const s of p.proof) h = hashPair(h, s);
      const rootOk = h.toLowerCase() === p.committedRoot.toLowerCase();
      upd(2, {
        status: rootOk ? "ok" : "fail",
        ms: performance.now() - t,
        detail: (
          <div className="grid gap-1.5">
            <p>
              {p.proof.length} sibling hashes, folded pairwise (sorted, like OpenZeppelin MerkleProof) up to the root.
            </p>
            <HashChip value={h} kind="root" label="Computed root" />
            <HashChip value={p.committedRoot} kind="root" label="Committed root" />
            {!rootOk && (
              <p role="alert" className="text-down">
                The computed root doesn't equal the committed root, so this forecast was not part of what was sealed.
              </p>
            )}
          </div>
        ),
      });
      // 4. Read the commitment from BNB Chain
      upd(3, { status: "run" });
      t = performance.now();
      const { client, forecastBookAbi } = await import("@/lib/chain");
      const who = FORECASTERS[forecaster].address as `0x${string}`;
      const c = (await client.readContract({ address: ADDR.ForecastBook, abi: forecastBookAbi, functionName: "getCommitment", args: [who, BigInt(round)] })) as {
        root: Hex;
        anchorTime: bigint;
        committedAt: bigint;
        count: number;
      };
      if (/^0x0+$/.test(c.root)) {
        return fail(
          3,
          <>
            Round {round} has no commitment on BNB Chain for {FORECASTERS[forecaster].name}. Rounds before Fri Oct 9 21:30 UTC were scored by the official open but not published on-chain.
          </>,
          "Not committed on BNB Chain.",
        );
      }
      const chainRootOk = c.root.toLowerCase() === p.committedRoot.toLowerCase();
      const sealedBefore = Number(c.anchorTime - c.committedAt) * 1000;
      upd(3, {
        status: chainRootOk ? "ok" : "fail",
        ms: performance.now() - t,
        detail: (
          <div className="grid gap-1.5">
            <HashChip value={c.root} kind="root" label="Root on BNB Chain" />
            <p>
              Sealed {new Date(Number(c.committedAt) * 1000).toUTCString().replace("GMT", "UTC")}, <span className="text-sodium">{duration(sealedBefore, true)} before the bell</span>. {c.count} forecasts
              in this root.
            </p>
            {p.onChain.tx && <HashChip value={p.onChain.tx} label="Commit tx" />}
          </div>
        ),
      });
      // 5. verifyForecast on-chain
      upd(4, { status: "run" });
      t = performance.now();
      const ok = (await client.readContract({
        address: ADDR.ForecastBook,
        abi: forecastBookAbi,
        functionName: "verifyForecast",
        args: [who, BigInt(round), leaf, p.proof],
      })) as boolean;
      upd(4, {
        status: ok ? "ok" : "fail",
        ms: performance.now() - t,
        detail: ok ? (
          <p>
            <span className="num text-moon-0">ForecastBook.verifyForecast(...)</span> returned <span className="num text-sodium">true</span>, evaluated by BNB Chain itself.
          </p>
        ) : (
          <p role="alert" className="text-down">
            <span className="num">verifyForecast</span> returned false{tamper ? ": the $0.01 change is caught on-chain" : ""}.
          </p>
        ),
      });
      setResult(ok ? { ok: true, proof: p, sealedBefore, committedAt: Number(c.committedAt) * 1000 } : { ok: false, message: tamper ? "Tampering detected: every check after the change failed, as it should." : "The contract rejected this forecast." });
    } catch (e) {
      setSteps((s) => {
        const i = s.findIndex((x) => x.status === "run");
        return s.map((x, j) => (j === i ? { ...x, status: "fail", detail: <p role="alert" className="text-down">{(e as Error).message.split("\n")[0]}</p> } : x));
      });
      setResult({ ok: false, message: (e as Error).message.split("\n")[0] });
    }
  }, [round, forecaster, symbol, tamper, setParams]);

  useEffect(() => {
    if (round != null && steps.length === 0) void run();
  }, [round, run, steps.length]);

  const scored = result?.proof ? opens?.opens.find((o) => o.symbol === result.proof!.symbol && o.anchorTime === result.proof!.leaf.anchorTime * 1000) : undefined;

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-28 sm:px-6">
      <title>Verify a forecast · Nightshift</title>
      <header className="max-w-[48rem]">
        <p className="text-[14px] font-medium text-sodium/90">No wallet. Check it yourself.</p>
        <h1 className="mt-3 text-[clamp(2.6rem,5vw,4.6rem)] font-[300]">Verify a forecast on BNB Chain.</h1>
        <p className="mt-5 max-w-[60ch] text-[17px] text-moon-2">
          Your browser recomputes the forecast's hash, walks its Merkle proof and asks the ForecastBook contract directly, over a public BNB Chain RPC, whether it was sealed before the bell.
        </p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form
          className="card h-fit p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <label className="block text-[13px] font-medium text-moon-2" htmlFor="v-symbol">
            Stock token
          </label>
          <input id="v-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="num mt-1.5 w-full rounded-md bg-night-1 px-3 py-2.5 text-[15px] text-moon-0 hairline outline-none" />
          <p className="mt-5 text-[13px] font-medium text-moon-2">Forecaster</p>
          <div role="radiogroup" aria-label="Forecaster" className="mt-1.5 grid grid-cols-3 gap-1 rounded-md bg-night-1 p-1 hairline">
            {(Object.keys(FORECASTERS) as Forecaster[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={forecaster === f}
                onClick={() => {
                  setForecaster(f);
                  setRound(null);
                  setSteps([]);
                }}
                className={`pressable relative rounded-[5px] px-2 py-2 text-[14px] ${forecaster === f ? "text-moon-0" : "text-moon-2 hover:text-moon-0"}`}
              >
                {forecaster === f && <motion.span layoutId="fc" className="absolute inset-0 rounded-[5px] bg-night-3" transition={spring.ui} />}
                <span className="relative inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: COLORS[f] }} aria-hidden />
                  {FORECASTERS[f].name}
                </span>
              </button>
            ))}
          </div>
          <label className="mt-5 block text-[13px] font-medium text-moon-2" htmlFor="v-round">
            Round sealed on BNB Chain
          </label>
          <select id="v-round" value={round ?? ""} onChange={(e) => setRound(Number(e.target.value))} className="num mt-1.5 w-full rounded-md bg-night-1 px-3 py-2.5 text-[14px] text-moon-0 hairline outline-none">
            {committed.length === 0 && <option value="">Loading rounds…</option>}
            {committed.map((r) => (
              <option key={r.round} value={r.round}>
                {r.round} sealed {et(new Date(r.ts).getTime())}, for {et(r.anchor_time)}
              </option>
            ))}
          </select>
          <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-md bg-night-1 px-3 py-3 hairline">
            <span>
              <span className="block text-[14px] text-moon-0">Tamper with it</span>
              <span className="block text-[12.5px] text-moon-3">Add $0.01 to the forecast and watch every check fail.</span>
            </span>
            <input type="checkbox" checked={tamper} onChange={(e) => setTamper(e.target.checked)} className="size-5 accent-[#FFB23F]" />
          </label>
          <button type="submit" className="pressable mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-sodium px-5 py-3 font-medium text-night-0">
            <ShieldCheck size={17} strokeWidth={1.75} /> Verify on BNB Chain
          </button>
          <p className="mt-3 text-[12.5px] text-moon-3">Reads go to a public BNB Chain RPC from your browser. Nothing is signed or sent.</p>
        </form>

        <section aria-live="polite" aria-label="Verification steps">
          <ol className="relative">
            {steps.map((s, i) => (
              <StepRow key={s.key} s={s} i={i} />
            ))}
          </ol>
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className={`relative overflow-hidden rounded-[14px] p-6 shadow-[var(--elev-2)] ${result.ok ? "bg-night-2" : "bg-night-2"}`}
              >
                {result.ok && <span className="ns-beam" aria-hidden />}
                {result.ok && result.proof ? (
                  <>
                    <p className="text-[13px] font-medium text-sodium">Verified on BNB Chain</p>
                    <p className="mt-2 font-display text-[clamp(1.5rem,2.4vw,2rem)] font-[350] leading-snug text-moon-0">
                      {FORECASTERS[forecaster].name}'s forecast of {result.proof.symbol} for {et(result.proof.leaf.anchorTime * 1000)} ({usd(Number(result.proof.leaf.medianE8) / 1e8)}, band{" "}
                      {usd(Number(result.proof.leaf.lowerE8) / 1e8)} – {usd(Number(result.proof.leaf.upperE8) / 1e8)}) was sealed {duration(result.sealedBefore ?? 0, true)} before the open.
                    </p>
                    <div className="mt-4 border-t border-rule pt-4 text-[14px] text-moon-2">
                      {scored ? (
                        <p>
                          Reality: the official open was <span className="num text-moon-0">{usd(scored.realized)}</span>, {bps(((Number(result.proof.leaf.medianE8) / 1e8 - scored.realized) / scored.realized) * 1e4)} from this forecast,{" "}
                          {scored.covered ? "inside" : "outside"} its band.
                        </p>
                      ) : (
                        <p>
                          Reality scores it at the bell, in <Countdown to={result.proof.leaf.anchorTime * 1000} className="text-sodium" />.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p role="alert" className="text-[15px] text-moon-1">
                    {result.message}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <ReceiptCheck />
        </section>
      </div>
    </div>
  );
}

function ReceiptCheck() {
  const [tx, setTx] = useState("");
  const [trader, setTrader] = useState("");
  const [r, setR] = useState<Receipt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setR(null);
    try {
      setR(await api.receipt(tx.trim(), trader.trim() || undefined));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card mt-10 p-5 sm:p-6">
      <h2 className="font-sans text-[18px] font-medium tracking-normal">Check any trade</h2>
      <p className="mt-1 text-[14px] text-moon-2">Paste a BNB Chain swap of a tokenized stock. Nightshift rebuilds it from the chain's transfer logs and prices it against the fair value at that moment.</p>
      <form onSubmit={go} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input value={tx} onChange={(e) => setTx(e.target.value)} placeholder="Transaction hash 0x…" aria-label="Transaction hash" className="num rounded-md bg-night-1 px-3 py-2.5 text-[13.5px] text-moon-0 hairline outline-none" />
        <button type="submit" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(tx.trim())} className="pressable rounded-md px-4 py-2.5 text-[14px] text-moon-0 hairline hover:bg-night-3 disabled:opacity-40">
          {busy ? "Rebuilding…" : "Build receipt"}
        </button>
        <input value={trader} onChange={(e) => setTrader(e.target.value)} placeholder="Trader address (optional)" aria-label="Trader address" className="num rounded-md bg-night-1 px-3 py-2.5 text-[13.5px] text-moon-0 hairline outline-none sm:col-span-2" />
      </form>
      <button type="button" onClick={() => { setTx("0xbd77806a9c274aa9d3609df15c856f37ef61ff85f843511371140897a02af92a"); setTrader("0x43Cf3295a41Fc70B215763a47ec36874604EbaD1"); }} className="mt-2 text-[13px] text-moon-2 underline-offset-4 hover:text-moon-0 hover:underline">
        Try our Agentic Wallet trade
      </button>
      {err && (
        <p role="alert" className="mt-3 text-[14px] text-down">
          {err}
        </p>
      )}
      {r && (
        <div className="mt-4 grid gap-0.5">
          <p className="mb-2 text-[16px] text-moon-0">{r.tca.verdict}</p>
          <Kv k="Side" v={`${r.side} ${r.amountToken.toFixed(6)} ${r.token.symbol} for ${r.amountUsd.toFixed(2)} ${r.payToken.symbol}`} />
          <Kv k="Price per token / per real share" v={`${usd(r.pricePerToken)} / ${usd(r.pricePerShare)}`} />
          <Kv k="Fair value then (90% band)" v={r.reference ? `${usd(r.reference.fairValue)} (${usd(r.reference.lower)} – ${usd(r.reference.upper)})` : "no reference at that time"} />
          <Kv k="Receipt hash" v={r.receiptHash} />
        </div>
      )}
    </div>
  );
}
