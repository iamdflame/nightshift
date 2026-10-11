import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { HashChip } from "@/components/ui/HashChip";
import type { OnChain } from "@/lib/api";
import { FORECASTERS } from "@/lib/links";
import { et, usd } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useOnchain } from "@/lib/queries";

type Kind = "forecasts" | "oracle" | "trades" | "agents";
interface Entry {
  t: number;
  kind: Kind;
  title: string;
  body?: React.ReactNode;
  chips: { label?: string; value: string | null | undefined; kind?: "tx" | "address" | "root" }[];
  verify?: string;
}

const TABS: { id: "all" | Kind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "forecasts", label: "Forecasts" },
  { id: "oracle", label: "Oracle" },
  { id: "trades", label: "Trades and loan" },
  { id: "agents", label: "Agents" },
];
const DOT: Record<Kind, string> = { forecasts: "#D66A98", oracle: "#FFB23F", trades: "#59D98E", agents: "#4A8CF0" };

function buildLog(oc: OnChain): Entry[] {
  const out: Entry[] = [];
  for (const t of oc.agenticWalletTrades) {
    const r = t.receipt;
    out.push({
      t: new Date(r.timestamp).getTime(),
      kind: "trades",
      title: `Agentic Wallet bought ${r.amountToken.toFixed(6)} ${r.token.symbol} for ${r.amountUsd.toFixed(2)} ${r.payToken.symbol}`,
      body: <>Receipt: {r.tca.verdict}. Fair value then {r.reference ? usd(r.reference.fairValue) : "–"}.</>,
      chips: [{ value: t.txHash }, { label: "Wallet", value: t.wallet, kind: "address" }],
    });
  }
  const loan = oc.sundayLoan?.steps ?? {};
  const words: Record<string, string> = { buy: "Bought NVDAB through the Binance Trading API", lend: "Treasury lent USDT into NightshiftCredit", collateral: "Posted NVDAB as collateral", borrow: "Borrowed USDT against NVIDIA" };
  for (const [k, v] of Object.entries(loan)) {
    if (!v?.at) continue;
    const extra = k === "borrow" ? ` (${Number(v.usdt).toFixed(4)} USDT)` : k === "lend" ? ` (${v.usdt} USDT)` : "";
    out.push({ t: new Date(v.at).getTime(), kind: "trades", title: `${words[k] ?? k}${extra}`, body: k === "buy" && v.verdict ? <>Receipt: {String(v.verdict)}.</> : undefined, chips: [{ value: v.tx as string }] });
  }
  for (const a of oc.agents)
    out.push({
      t: a.registeredAt ? new Date(a.registeredAt).getTime() : 0,
      kind: "agents",
      title: `${a.name} registered as ERC-8004 agent #${a.agentId ?? "?"}`,
      chips: [{ value: a.tx }, { label: "Wallet", value: a.address, kind: "address" }],
    });
  const posts = new Map<string, { t: number; n: number; round: number; symbols: string[] }>();
  for (const p of oc.oracle.latest) {
    const e = posts.get(p.tx) ?? { t: p.computedAt, n: 0, round: p.round, symbols: [] };
    e.n++;
    if (e.symbols.length < 6) e.symbols.push(p.symbol);
    posts.set(p.tx, e);
  }
  for (const [tx, e] of posts)
    out.push({ t: e.t, kind: "oracle", title: `Oracle reports posted for round ${e.round}`, body: <>Includes {e.symbols.join(", ")}{e.n > e.symbols.length ? ", and more" : ""}.</>, chips: [{ value: tx }] });
  const rounds = new Map<number, OnChain["recentCommits"]>();
  for (const c of oc.recentCommits) rounds.set(c.round, [...(rounds.get(c.round) ?? []), c]);
  for (const [round, cs] of rounds)
    out.push({
      t: cs[0]!.t,
      kind: "forecasts",
      title: `Round ${round} sealed by ${cs.length} agents for ${et(cs[0]!.anchorTime)}`,
      chips: cs.map((c) => ({ label: c.forecaster, value: c.tx })),
      verify: `/verify?round=${round}&forecaster=nfv&symbol=NVDAB`,
    });
  return out.sort((a, b) => b.t - a.t);
}

export default function Proof() {
  const { data: oc, isLoading, isError } = useOnchain();
  const [tab, setTab] = useState<"all" | Kind>("all");
  const [limit, setLimit] = useState(40);
  const log = useMemo(() => (oc ? buildLog(oc) : []), [oc]);
  const shown = log.filter((e) => tab === "all" || e.kind === tab);
  const days = useMemo(() => {
    const g = new Map<string, Entry[]>();
    for (const e of shown.slice(0, limit)) {
      const d = e.t ? new Date(e.t).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }) : "Earlier";
      g.set(d, [...(g.get(d) ?? []), e]);
    }
    return [...g.entries()];
  }, [shown, limit]);
  const sealed = oc?.commitments.reduce((a, c) => a + c.rounds, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-28 sm:px-6">
      <title>On-chain proof · Nightshift</title>
      <header className="max-w-[52rem]">
        <p className="text-[14px] font-medium text-sodium/90">On-chain proof</p>
        <h1 className="mt-3 text-[clamp(2.6rem,5vw,4.4rem)] font-[300]">Everything we claim is on BNB Chain.</h1>
        <p className="mt-4 max-w-[60ch] text-[17px] text-moon-2">An observatory log of every contract, identity, forecast seal, oracle report and trade. Each line links to BscScan; nothing here needs a wallet.</p>
      </header>

      {oc && (
        <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Forecast seals on-chain", sealed * 1],
            ["Oracle reports", oc.oracle.reports],
            ["ERC-8004 agents", oc.agents.length],
            ["Contracts and feeds", oc.contracts.length + oc.feeds.length],
          ].map(([k, v]) => (
            <div key={k as string} className="card p-4">
              <dt className="text-[13px] text-moon-3">{k}</dt>
              <dd className="num mt-1 text-[1.9rem] text-moon-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-labelledby="log-title">
          <h2 id="log-title" className="sr-only">
            Log
          </h2>
          <div role="tablist" aria-label="Filter the log" className="flex flex-wrap gap-1 border-b border-rule">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative px-3 py-2.5 text-[14px] ${tab === t.id ? "text-moon-0" : "text-moon-2 hover:text-moon-0"}`}>
                {t.label}
                {tab === t.id && <motion.span layoutId="tab-u" className="absolute inset-x-2 -bottom-px h-0.5 bg-sodium" transition={spring.ui} />}
              </button>
            ))}
          </div>
          {isLoading && <div className="mt-6 h-64 animate-pulse rounded-[10px] bg-night-2" />}
          {isError && (
            <p role="alert" className="mt-6 text-down">
              The log couldn't load.
            </p>
          )}
          <div className="mt-6 grid gap-8">
            {days.map(([day, es]) => (
              <div key={day}>
                <h3 className="font-sans text-[13px] font-medium tracking-normal text-moon-2">{day}</h3>
                <ol className="mt-3 grid gap-2">
                  {es.map((e, i) => (
                    <li key={`${e.title}-${i}`} className="card grid grid-cols-[auto_1fr] gap-x-3 p-4">
                      <span className="mt-1.5 size-2 rounded-full" style={{ background: DOT[e.kind] }} aria-hidden />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-[14.5px] text-moon-0">{e.title}</p>
                          {e.t > 0 && <time className="num text-[12px] text-moon-3">{et(e.t)}</time>}
                        </div>
                        {e.body && <p className="mt-1 text-[13.5px] text-moon-2">{e.body}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {e.chips.map((c, j) => (
                            <HashChip key={j} value={c.value} kind={c.kind ?? "tx"} label={c.label} />
                          ))}
                          {e.verify && (
                            <Link to={e.verify} className="ml-1 text-[12.5px] text-moon-2 underline-offset-4 hover:text-moon-0 hover:underline">
                              Verify this seal
                            </Link>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {shown.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + 40)} className="pressable mt-6 rounded-md px-4 py-2 text-[14px] text-moon-1 hairline hover:bg-night-2">
              Show more ({shown.length - limit} left)
            </button>
          )}
        </section>

        <aside className="grid h-fit gap-8">
          <section className="card p-5" aria-labelledby="c-title">
            <h2 id="c-title" className="font-sans text-[17px] font-medium tracking-normal">
              Contracts on BNB Chain
            </h2>
            <ul className="mt-4 grid gap-3">
              {oc?.contracts.map((c) => (
                <li key={c.name}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px] text-moon-0">{c.name}</span>
                    <HashChip value={c.address} kind="address" />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-moon-3">{c.role}</p>
                </li>
              ))}
            </ul>
            {oc?.deployBlock && <p className="mt-4 border-t border-rule pt-3 text-[12.5px] text-moon-3">Deployed at block {oc.deployBlock.toLocaleString("en-US")}.</p>}
          </section>
          <section className="card p-5" aria-labelledby="f-title">
            <h2 id="f-title" className="font-sans text-[17px] font-medium tracking-normal">
              Chainlink-compatible price feeds
            </h2>
            <p className="mt-1 text-[12.5px] text-moon-3">AggregatorV3 latestRoundData() over the same reports.</p>
            <ul className="mt-3 grid gap-2">
              {oc?.feeds.map((f) => (
                <li key={f.feed} className="flex items-center justify-between gap-2">
                  <span className="num text-[13.5px] text-moon-1">{f.symbol}</span>
                  <HashChip value={f.feed} kind="address" />
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-5" aria-labelledby="a-title">
            <h2 id="a-title" className="font-sans text-[17px] font-medium tracking-normal">
              Agents (ERC-8004)
            </h2>
            <ul className="mt-3 grid gap-2.5">
              {oc?.agents.map((a) => (
                <li key={a.role} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13.5px] text-moon-1">
                    {a.name} <span className="num text-moon-3">#{a.agentId}</span>
                  </span>
                  <HashChip value={a.address} kind="address" />
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-rule pt-3 text-[12.5px] text-moon-3">
              {oc && oc.jobs.length === 0 ? "ERC-8183 pay-for-accuracy jobs open once the escrow is funded; until then scores are published, not paid." : `${oc?.jobs.length ?? 0} ERC-8183 jobs on-chain.`}
            </p>
          </section>
          <p className="text-[12.5px] text-moon-3">
            Forecasters: {Object.values(FORECASTERS).map((f) => f.name).join(", ")}. Every seal can be checked on the <Link className="underline underline-offset-4 hover:text-moon-0" to="/verify">verify page</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
