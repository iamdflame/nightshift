import { useGSAP } from "@gsap/react";
import { scaleLinear, scalePoint } from "d3-scale";
import { line as d3line } from "d3-shape";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Photo } from "@/components/ui/Photo";
import { BACKTEST } from "@/data/backtest";
import { num, pct } from "@/lib/format";
import { useOpens, useResults } from "@/lib/queries";
import { Heading } from "./Heading";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const SERIES = [
  { key: "stale", label: "Stale oracle (last close)", color: "#7C859D", dash: "6 5" },
  { key: "echo", label: "On-chain echo", color: "#097C60", dash: "2 4" },
  { key: "nfv", label: "Nightshift NFV", color: "#FFB23F", dash: "" },
] as const;

function BacktestChart() {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const data = BACKTEST.byHorizon;
  const W = 720, H = 360, m = { t: 24, r: 128, b: 44, l: 52 };
  const x = scalePoint<string>().domain(data.map((d) => d.bucket)).range([m.l, W - m.r]).padding(0.25);
  const y = scaleLinear().domain([40, 180]).range([H - m.b, m.t]);
  const paths = useMemo(
    () => SERIES.map((s) => ({ ...s, d: d3line<(typeof data)[number]>().x((d) => x(d.bucket)!).y((d) => y(d[s.key]))(data as unknown as (typeof data)[number][]) ?? "" })),
    [data, x, y],
  );
  useGSAP(
    () => {
      if (reduce) return;
      gsap.fromTo(".ns-draw", { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "none", stagger: 0.15, scrollTrigger: { trigger: root.current, start: "top 75%", end: "bottom 60%", scrub: 0.8 } });
      gsap.from(".ns-dot", { opacity: 0, scale: 0.4, transformOrigin: "center", stagger: 0.05, scrollTrigger: { trigger: root.current, start: "top 55%" } });
    },
    { scope: root, dependencies: [reduce] },
  );
  const last = data[data.length - 1]!;
  // End labels, nudged apart so close series never overlap (min 16px).
  const labelY = (() => {
    const ys = SERIES.map((s) => ({ key: s.key, y: y(last[s.key]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ys.length; i++) if (ys[i]!.y - ys[i - 1]!.y < 16) ys[i]!.y = ys[i - 1]!.y + 16;
    return Object.fromEntries(ys.map((v) => [v.key, v.y])) as Record<string, number>;
  })();
  return (
    <div ref={root} className="card relative p-4 sm:p-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Forecast error by hours to the open. Far from the bell all three are about ${data[0]!.stale} bps; in the last hour the stale oracle is ${last.stale} bps, Nightshift ${last.nfv} bps.`}>
        {[50, 100, 150].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="rgb(160 180 220 / 0.1)" />
            <text x={m.l - 10} y={y(v) + 4} textAnchor="end" className="num" fontSize="11" fill="#7C859D">
              {v}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.bucket} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <rect x={x(d.bucket)! - 40} y={m.t} width={80} height={H - m.t - m.b} fill="transparent" />
            {hover === i && <line x1={x(d.bucket)} x2={x(d.bucket)} y1={m.t} y2={H - m.b} stroke="rgb(244 241 232 / 0.25)" />}
            <text x={x(d.bucket)} y={H - m.b + 22} textAnchor="middle" fontSize="12" fill="#A9B0C2">
              {d.bucket}
            </text>
          </g>
        ))}
        <text x={m.l} y={H - 6} fontSize="11.5" fill="#7C859D">
          Hours before the open
        </text>
        {paths.map((p) => (
          <g key={p.key}>
            <path d={p.d} fill="none" stroke={p.color} strokeWidth={p.key === "nfv" ? 2.6 : 1.8} strokeDasharray={p.dash || undefined} pathLength={p.dash ? undefined : 1} className={p.dash ? "" : "ns-draw"} style={p.dash ? undefined : { strokeDasharray: 1, strokeDashoffset: reduce ? 0 : 1 }} />
            {data.map((d) => (
              <circle key={d.bucket} className="ns-dot" cx={x(d.bucket)} cy={y(d[p.key])} r={p.key === "nfv" ? 4 : 3} fill={p.color} stroke="#151E35" strokeWidth="2" />
            ))}
            <text x={W - m.r + 12} y={labelY[p.key]! + 4} fontSize="12.5" fill="#E4E1D6">
              {p.label.split(" (")[0]}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-2 min-h-[2.5rem] text-[13px] text-moon-2" aria-live="polite">
        {hover != null ? (
          <span>
            {data[hover]!.bucket} before the open, {data[hover]!.n.toLocaleString("en-US")} forecasts: stale <span className="num text-moon-1">{data[hover]!.stale}</span>, echo{" "}
            <span className="num text-moon-1">{data[hover]!.echo}</span>, Nightshift <span className="num text-sodium">{data[hover]!.nfv}</span> bps CRPS. Band coverage{" "}
            <span className="num text-moon-1">{pct(data[hover]!.cov90)}</span>.
          </span>
        ) : (
          <span>Hover a column for the numbers. CRPS in basis points of price, lower is better.</span>
        )}
      </div>
    </div>
  );
}

function LiveOpens() {
  const { data: r } = useResults();
  const { data: o } = useOpens("nfv");
  const opens = useMemo(() => {
    const by = new Map<string, Record<string, number>>();
    for (const x of r?.results ?? []) {
      const e = by.get(x.open) ?? {};
      e[x.forecaster] = x.crpsBps;
      e[`${x.forecaster}N`] = x.n;
      by.set(x.open, e);
    }
    return [...by.entries()]
      .filter(([, e]) => e.nfv != null && e.anchor != null)
      .map(([open, e]) => {
        const rows = (o?.opens ?? []).filter((x) => new Date(x.anchorTime).toISOString() === open);
        return { open, nfv: e.nfv!, stale: e.anchor!, n: e.nfvN ?? 0, inBand: rows.filter((x) => x.covered).length, total: rows.length };
      })
      .sort((a, b) => a.open.localeCompare(b.open));
  }, [r, o]);
  if (!opens.length) return <p className="text-moon-3">Live opens appear here after the next bell.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {opens.map((x) => {
        const d = new Date(x.open);
        const cut = (x.nfv / x.stale - 1) * 100;
        return (
          <div key={x.open} className="card p-5">
            <p className="text-[13px] text-moon-2">
              Official open, {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}
            </p>
            <p className="mt-2 text-[2.6rem] leading-none text-moon-0">
              <span className="num">{cut < 0 ? "−" : "+"}{Math.abs(cut).toFixed(0)}%</span>
            </p>
            <p className="mt-2 text-[14px] text-moon-2">
              forecast error vs a stale oracle (<span className="num">{num(x.nfv, 1)}</span> vs <span className="num">{num(x.stale, 1)}</span> bps, {x.n.toLocaleString("en-US")} forecasts)
            </p>
            {x.total > 0 && (
              <p className="mt-3 border-t border-rule pt-3 text-[13px] text-moon-3">
                At the bell, <span className="num text-moon-1">{x.inBand}</span> of <span className="num text-moon-1">{x.total}</span> stocks opened inside NFV's 90% band.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RealityScores() {
  const a = BACKTEST.all;
  return (
    <section className="grain relative isolate overflow-hidden py-[clamp(5rem,9vw,8.5rem)]" aria-labelledby="scores-title">
      <div className="absolute inset-0 -z-10">
        <Photo name="observatory" alt="" className="h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--color-night-0)_0%,rgb(10_15_30/0.82)_30%,rgb(10_15_30/0.9)_100%)]" />
      </div>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
        <Heading id="scores-title" kicker="Measured, not claimed" title="Reality scores every forecast.">
          Out of sample, over {a.n.toLocaleString("en-US")} forecasts since bStocks launched, Nightshift's error is {Math.round((1 - a.crps_v2_bps / a.crps_stale_bps) * 100)}% lower than the stale oracle lenders
          use today. Deep in the weekend nobody knows much; as the restart approaches, the 24/7 market starts telling the truth, and Nightshift reads it.
        </Heading>
        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <BacktestChart />
          <div>
            <p className="text-[14px] font-medium text-moon-1">Live, since Thursday</p>
            <p className="mt-1 text-[14px] text-moon-3">Every official open is scored automatically against the forecasts sealed before it.</p>
            <div className="mt-5">
              <LiveOpens />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
