import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { nextRegularOpen } from "@ns/calendar";
import { Countdown } from "@/components/ui/Countdown";
import { HashChip } from "@/components/ui/HashChip";
import { useNow } from "@/hooks/useNow";
import { ADDR, FORECASTERS, bscscan } from "@/lib/links";
import { et, short } from "@/lib/format";
import { useOnchain } from "@/lib/queries";
import { Heading } from "./Heading";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type NodeId = "anchor" | "echo" | "nfv" | "book" | "oracle" | "credit" | "venus" | "feeds";
const COLORS = { anchor: "#4A8CF0", echo: "#097C60", nfv: "#D66A98" } as const;

const EDGES: [NodeId, NodeId, string][] = [
  ["anchor", "book", "Merkle root"],
  ["echo", "book", "Merkle root"],
  ["nfv", "book", "Merkle root"],
  ["book", "oracle", "consensus"],
  ["oracle", "credit", "band"],
  ["oracle", "venus", "price"],
  ["oracle", "feeds", "latestRoundData"],
];

function Node({ id, title, sub, href, color, nodeRef }: { id: NodeId; title: string; sub: string; href?: string; color?: string; nodeRef: (el: HTMLElement | null) => void }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[14px] font-medium text-moon-0">
        {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
        {title}
      </span>
      <span className="num mt-0.5 block text-[11.5px] text-moon-3">{sub}</span>
    </>
  );
  const cls = "relative z-10 block rounded-[10px] bg-night-2/95 px-3.5 py-2.5 shadow-[var(--elev-2)] transition-colors hover:bg-night-3";
  return href ? (
    <a ref={nodeRef} data-node={id} href={href} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <div ref={nodeRef} data-node={id} className={cls}>
      {body}
    </div>
  );
}

/** Live beam diagram: every edge pulses along its real path; agent beams carry their latest real commit tx. */
function Diagram() {
  const box = useRef<HTMLDivElement>(null);
  const nodes = useRef<Partial<Record<NodeId, HTMLElement | null>>>({});
  const [paths, setPaths] = useState<{ d: string; from: NodeId; to: NodeId; label: string }[]>([]);
  const reduce = useReducedMotion();
  const { data: oc } = useOnchain();

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const out: { d: string; from: NodeId; to: NodeId; label: string }[] = [];
      for (const [f, t, label] of EDGES) {
        const a = nodes.current[f]?.getBoundingClientRect();
        const c = nodes.current[t]?.getBoundingClientRect();
        if (!a || !c) continue;
        const x1 = a.right - b.left, y1 = a.top + a.height / 2 - b.top;
        const x2 = c.left - b.left, y2 = c.top + c.height / 2 - b.top;
        const mx = (x1 + x2) / 2;
        out.push({ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, from: f, to: t, label });
      }
      setPaths(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lastBy = (f: string) => oc?.recentCommits.find((c) => c.forecaster === f);
  const reg = (id: NodeId) => (el: HTMLElement | null) => {
    nodes.current[id] = el;
  };
  const feeds = oc?.feeds.length ?? 6;

  return (
    <div ref={box} className="relative grid grid-cols-[1fr_1fr_1fr] items-center gap-x-[clamp(1.5rem,5vw,4.5rem)] gap-y-5 py-4">
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="beam" x1="0" x2="1">
            <stop offset="0%" stopColor="#F4F1E8" stopOpacity="0" />
            <stop offset="55%" stopColor="#F4F1E8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#FFB23F" />
          </linearGradient>
        </defs>
        {paths.map((p, i) => (
          <g key={`${p.from}-${p.to}`}>
            <path d={p.d} fill="none" stroke="rgb(160 180 220 / 0.18)" strokeWidth="1.25" />
            {!reduce && (
              <path d={p.d} fill="none" stroke="url(#beam)" strokeWidth="2" strokeLinecap="round" pathLength={100} strokeDasharray="14 86" className="ns-beam-pulse" style={{ animationDelay: `${(i % 4) * 0.7}s` }} />
            )}
          </g>
        ))}
      </svg>
      <div className="grid gap-5">
        {(["anchor", "echo", "nfv"] as const).map((f) => (
          <Node
            key={f}
            id={f}
            nodeRef={reg(f)}
            color={COLORS[f]}
            title={`${FORECASTERS[f].name} agent`}
            sub={lastBy(f) ? `sealed ${short(lastBy(f)!.tx)}` : `ERC-8004 #${FORECASTERS[f].agentId}`}
            href={lastBy(f) ? bscscan.tx(lastBy(f)!.tx) : bscscan.address(FORECASTERS[f].address)}
          />
        ))}
      </div>
      <div className="grid gap-10">
        <Node id="book" nodeRef={reg("book")} title="ForecastBook" sub={`${short(ADDR.ForecastBook)} on BSC`} href={bscscan.address(ADDR.ForecastBook)} />
        <Node id="oracle" nodeRef={reg("oracle")} title="NightshiftOracle" sub={`${oc?.oracle.reports ?? "–"} reports posted`} href={bscscan.address(ADDR.NightshiftOracle)} />
      </div>
      <div className="grid gap-5">
        <Node id="credit" nodeRef={reg("credit")} title="Credit vault" sub="lends at the band's low edge" href={bscscan.address(ADDR.NightshiftCredit)} />
        <Node id="venus" nodeRef={reg("venus")} title="Venus adapter" sub="OracleInterface" href={bscscan.address(ADDR.NightshiftVenusOracle)} />
        <Node id="feeds" nodeRef={reg("feeds")} title={`${feeds} price feeds`} sub="Chainlink AggregatorV3" href="/proof" />
      </div>
    </div>
  );
}

const STEPS = [
  { t: "Commit", d: "Every 30 minutes, each agent seals a Merkle root of its forecasts for all 91 stocks into ForecastBook on BNB Chain." },
  { t: "Seal", d: "Once a root is on-chain, no one can change a forecast after the fact. Not the agents, not us. Any single forecast can be checked against it." },
  { t: "Bell", d: "The official US open is the only judge. It arrives whether anyone likes the forecast or not." },
  { t: "Score and pay", d: "Every forecast gets a CRPS score against the open. ERC-8183 escrow on BNB's own commerce contracts pays only the agents that beat a stale oracle." },
];

export default function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const { data: oc } = useOnchain();
  const now = useNow();
  const bell = nextRegularOpen(now);
  const latest = oc?.recentCommits[0];

  useGSAP(
    () => {
      if (reduce) return;
      gsap.utils.toArray<HTMLElement>(".ns-step").forEach((el, i) => {
        ScrollTrigger.create({ trigger: el, start: "top 62%", end: "bottom 38%", onToggle: (s) => s.isActive && setActive(i) });
      });
    },
    { scope: root, dependencies: [reduce] },
  );

  const artifact = (i: number) => {
    if (i === 0) return <HashChip value={latest?.tx} label="Latest seal" />;
    if (i === 1) return <HashChip value={ADDR.ForecastBook} kind="address" label="ForecastBook" />;
    if (i === 2)
      return (
        <span className="text-[14px] text-moon-2">
          Next bell {et(bell)}, in <Countdown to={bell} className="text-sodium" />
        </span>
      );
    return (
      <span className="text-[14px] text-moon-2">
        {oc && oc.jobs.length === 0 ? "The first jobs open when the escrow is funded; until then, scores are published, not paid." : `${oc?.jobs.length ?? 0} jobs on-chain`}
      </span>
    );
  };

  return (
    <section ref={root} className="relative border-t border-rule bg-night-0 py-[clamp(5rem,9vw,8.5rem)]" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
        <Heading id="how-title" kicker="How it works" title="How a forecast becomes a price.">
          Three AI agents forecast every stock. Reality grades them. Contracts read what survives.
        </Heading>
        <div className="mt-16 grid grid-cols-[minmax(0,1fr)] gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] lg:gap-20">
          <ol className="relative grid gap-3">
            {STEPS.map((s, i) => (
              <li key={s.t} className={`ns-step rounded-[12px] p-5 transition-colors duration-300 ${active === i ? "bg-night-2 shadow-[var(--elev-1)]" : ""}`}>
                <div className="flex items-baseline gap-3">
                  <span className={`num text-[13px] ${active === i ? "text-sodium" : "text-moon-3"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className={`font-display text-[1.7rem] font-[350] transition-colors duration-300 ${active === i ? "text-moon-0" : "text-moon-2"}`}>{s.t}</h3>
                </div>
                <p className={`mt-2 max-w-[48ch] text-[15.5px] transition-colors duration-300 ${active === i ? "text-moon-1" : "text-moon-3"}`}>{s.d}</p>
                <div className="mt-3">{artifact(i)}</div>
              </li>
            ))}
          </ol>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="card relative overflow-hidden p-4 sm:p-6">
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="min-w-[620px]">
                  <Diagram />
                </div>
              </div>
              <p className="mt-4 border-t border-rule pt-3 text-[12.5px] text-moon-3">Every box links to its contract or its latest transaction on BscScan.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
