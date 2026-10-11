import { bisector } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { sessionAt } from "@ns/calendar";
import type { History } from "@/lib/api";
import { et, usd } from "@/lib/format";

const F = {
  anchor: { color: "#4A8CF0", dash: "6 4", label: "Anchor (last close)" },
  echo: { color: "#097C60", dash: "2 3", label: "Echo (on-chain price)" },
  nfv: { color: "#D66A98", dash: "8 3 2 3", label: "NFV (Nightshift model)" },
} as const;
type Fc = keyof typeof F;

/**
 * The forecast fan for one stock: real hourly token price, the consensus band for the next open stepping
 * round by round (it ends in a bracket at the bell), each forecaster's sealed forecasts, now, and the bell.
 */
export function FanChart({ h, height = 420 }: { h: History; height?: number }) {
  const [ref, { width }] = useMeasure();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  const model = useMemo(() => {
    const pts = h.points.filter((p) => p.anchorTime === h.nextAnchor);
    if (!pts.length) return null;
    const t0 = pts[0]!.t - 2 * 3600_000;
    const t1 = h.nextAnchor + 45 * 60_000;
    const k = h.klines.filter((x) => x.t >= t0);
    const byF = { anchor: [] as History["commits"], echo: [] as History["commits"], nfv: [] as History["commits"] };
    for (const c of h.commits) byF[c.forecaster]?.push(c);
    const lastClose = pts.find((p) => p.lastClose != null)?.lastClose ?? null;
    const vals = [...pts.flatMap((p) => [p.lower, p.upper]), ...k.map((x) => x.close), ...h.commits.map((c) => c.fairValue), ...(lastClose ? [lastClose] : [])];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08;
    // Session shading every 15 min, merged.
    const segs: { a: number; b: number; s: string }[] = [];
    for (let t = t0; t < t1; t += 15 * 60_000) {
      const s = sessionAt(t);
      const last = segs[segs.length - 1];
      if (last && last.s === s) last.b = t + 15 * 60_000;
      else segs.push({ a: t, b: t + 15 * 60_000, s });
    }
    return { pts, t0, t1, k, byF, lastClose, lo: lo - pad, hi: hi + pad, segs };
  }, [h]);

  if (!model) return <div className="card grid h-[300px] place-items-center p-6 text-center text-moon-2">No forecasts for the next open yet. The first round after the close seals them.</div>;
  const { pts, t0, t1, k, byF, lastClose, lo, hi, segs } = model;
  const m = { t: 18, r: width < 640 ? 64 : 150, b: 34, l: width < 640 ? 44 : 60 };
  const W = Math.max(320, width);
  const x = scaleUtc().domain([t0, t1]).range([m.l, W - m.r]);
  const y = scaleLinear().domain([lo, hi]).range([height - m.b, m.t]).nice();
  const now = Date.now();
  const xn = Math.min(x(now), x(t1));
  const stepD = (sel: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(sel(p))}H${i < pts.length - 1 ? x(pts[i + 1]!.t) : x(Math.min(now, h.nextAnchor))}`).join("");
  const bandD = `${stepD((p) => p.upper)}${[...pts].reverse().map((p, i, a) => `L${i === 0 ? x(Math.min(now, h.nextAnchor)) : x(a[i - 1]!.t)},${y(p.lower)}L${x(p.t)},${y(p.lower)}`).join("")}Z`;
  const priceD = k.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.close)}`).join("");
  const last = pts[pts.length - 1]!;
  const ticks = x.ticks(width < 640 ? 4 : 8);
  const bis = bisector<(typeof pts)[number], number>((p) => p.t).center;
  const hp = hover != null ? pts[hover]! : null;
  const commitAt = (f: Fc, t: number) => [...byF[f]].reverse().find((c) => c.t <= t);
  const endLabels = (Object.keys(F) as Fc[])
    .map((f) => ({ f, c: byF[f][byF[f].length - 1] }))
    .filter((e) => e.c)
    .map((e) => ({ ...e, y: y(e.c!.fairValue) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) if (endLabels[i]!.y - endLabels[i - 1]!.y < 15) endLabels[i]!.y = endLabels[i - 1]!.y + 15;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const t = x.invert(((e.clientX - r.left) / r.width) * W).getTime();
    setHover(bis(pts, t));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setHover((v) => Math.max(0, Math.min(pts.length - 1, (v ?? pts.length - 1) + (e.key === "ArrowRight" ? 1 : -1))));
    }
    if (e.key === "Escape") setHover(null);
  };

  return (
    <div className="card p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-moon-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 bg-moon-1" aria-hidden /> Token price, hourly
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-sodium/60 bg-sodium/20" aria-hidden /> Consensus and 90% band for the bell
          </span>
          {(Object.keys(F) as Fc[]).map((f) => (
            <span key={f} className="inline-flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden>
                <line x1="0" x2="18" y1="3" y2="3" stroke={F[f].color} strokeWidth="2" strokeDasharray={F[f].dash} />
              </svg>
              {F[f].label}
            </span>
          ))}
        </div>
        <button type="button" onClick={() => setTable((v) => !v)} className="pressable rounded-md px-2.5 py-1 text-[12.5px] text-moon-1 hairline hover:bg-night-3">
          {table ? "View as chart" : "View as table"}
        </button>
      </div>
      {table ? (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-night-2 text-moon-2">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Round (ET)</th>
                <th className="px-2 py-2 text-right font-medium">Consensus</th>
                <th className="px-2 py-2 text-right font-medium">Band</th>
                <th className="px-2 py-2 text-right font-medium">Token</th>
              </tr>
            </thead>
            <tbody>
              {[...pts].reverse().map((p) => (
                <tr key={p.round} className="border-t border-rule">
                  <td className="px-2 py-1.5 text-moon-1">{et(p.t)}</td>
                  <td className="num px-2 py-1.5 text-right text-moon-0">{usd(p.fairValue)}</td>
                  <td className="num px-2 py-1.5 text-right text-moon-2">
                    {usd(p.lower)} – {usd(p.upper)}
                  </td>
                  <td className="num px-2 py-1.5 text-right text-moon-2">{usd(p.tokenPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${height}`}
            className="block w-full touch-pan-y outline-none"
            role="img"
            tabIndex={0}
            aria-label={`Consensus for ${et(h.nextAnchor)} is ${usd(last.fairValue)}, band ${usd(last.lower)} to ${usd(last.upper)}, from ${pts.length} rounds. Use left and right arrows to inspect rounds.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
          >
            {segs.map((s) => (
              <rect key={s.a} x={x(s.a)} width={Math.max(0, x(s.b) - x(s.a))} y={m.t} height={height - m.t - m.b} fill={s.s === "closed" ? "rgb(0 0 0 / 0.16)" : s.s === "regular" ? "rgb(244 241 232 / 0.05)" : "rgb(244 241 232 / 0.02)"} />
            ))}
            {y.ticks(5).map((v) => (
              <g key={v}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="rgb(160 180 220 / 0.08)" />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" className="num" fill="#7C859D">
                  {v.toFixed(v >= 100 ? 0 : 2)}
                </text>
              </g>
            ))}
            {ticks.map((t) => (
              <text key={+t} x={x(t)} y={height - 10} textAnchor="middle" fontSize="11" fill="#7C859D">
                {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric" }).format(t)}
              </text>
            ))}
            {lastClose != null && (
              <g>
                <line x1={m.l} x2={W - m.r} y1={y(lastClose)} y2={y(lastClose)} stroke="#7C859D" strokeDasharray="3 4" />
                <text x={m.l + 6} y={y(lastClose) - 6} fontSize="11" fill="#A9B0C2">
                  Last close {usd(lastClose)}
                </text>
              </g>
            )}
            <motion.g initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }} transition={{ duration: 1.6, ease: [0.77, 0, 0.175, 1] }}>
              <path d={bandD} fill="rgb(255 178 63 / 0.14)" />
              <path d={stepD((p) => p.upper)} fill="none" stroke="rgb(255 178 63 / 0.5)" strokeWidth="1" />
              <path d={stepD((p) => p.lower)} fill="none" stroke="rgb(255 178 63 / 0.5)" strokeWidth="1" />
              <path d={stepD((p) => p.fairValue)} fill="none" stroke="#FFB23F" strokeWidth="2" />
              {priceD && <path d={priceD} fill="none" stroke="#E4E1D6" strokeOpacity="0.9" strokeWidth="1.4" strokeLinejoin="round" />}
              {(Object.keys(F) as Fc[]).map((f) => {
                const cs = byF[f];
                if (!cs.length) return null;
                const d = cs.map((c, i) => `${i ? "L" : "M"}${x(c.t)},${y(c.fairValue)}H${i < cs.length - 1 ? x(cs[i + 1]!.t) : xn}`).join("");
                return (
                  <g key={f}>
                    <path d={d} fill="none" stroke={F[f].color} strokeWidth="1.6" strokeDasharray={F[f].dash} />
                    {cs.map((c) => (
                      <circle key={c.round} cx={x(c.t)} cy={y(c.fairValue)} r={2.6} fill={c.chain === "committed" ? F[f].color : "#151E35"} stroke={c.chain === "committed" ? "#151E35" : F[f].color} strokeWidth="1.4" />
                    ))}
                  </g>
                );
              })}
            </motion.g>
            <line x1={xn} x2={xn} y1={m.t} y2={height - m.b} stroke="#F4F1E8" strokeOpacity="0.55" />
            <text x={xn + 5} y={m.t + 12} fontSize="11" fill="#E4E1D6">
              now
            </text>
            <line x1={x(h.nextAnchor)} x2={x(h.nextAnchor)} y1={m.t} y2={height - m.b} stroke="#FFB23F" strokeDasharray={now < h.nextAnchor ? "4 4" : undefined} />
            <path d={`M${x(h.nextAnchor) - 8},${y(last.upper)}H${x(h.nextAnchor)}V${y(last.lower)}H${x(h.nextAnchor) - 8}`} fill="none" stroke="#FFB23F" strokeWidth="1.8" />
            <line x1={x(h.nextAnchor) - 12} x2={x(h.nextAnchor) + 4} y1={y(last.fairValue)} y2={y(last.fairValue)} stroke="#FFB23F" strokeWidth="2" />
            <text x={x(h.nextAnchor) + 8} y={y(last.fairValue) + 4} fontSize="12" fill="#FFB23F" className="num">
              {usd(last.fairValue)}
            </text>
            <text x={x(h.nextAnchor)} y={m.t - 4} textAnchor="middle" fontSize="11" fill="#FFB23F">
              The bell
            </text>
            {width >= 640 &&
              endLabels.map((e) => (
                <text key={e.f} x={W - m.r + 46} y={e.y + 4} fontSize="11.5" fill="#E4E1D6">
                  <tspan fill={F[e.f].color}>●</tspan> {e.f} {usd(e.c!.fairValue)}
                </text>
              ))}
            {hp && (
              <g pointerEvents="none">
                <line x1={x(hp.t)} x2={x(hp.t)} y1={m.t} y2={height - m.b} stroke="rgb(244 241 232 / 0.35)" />
                <circle cx={x(hp.t)} cy={y(hp.fairValue)} r={4} fill="#FFB23F" stroke="#151E35" strokeWidth="2" />
              </g>
            )}
          </svg>
          {hp && (
            <div className="pointer-events-none absolute top-3 z-10 w-[230px] rounded-[10px] bg-night-3 p-3 text-[12.5px] shadow-[var(--elev-3)]" style={{ left: Math.min(Math.max(8, (x(hp.t) / W) * width + 14), width - 240) }}>
              <p className="text-moon-2">{et(hp.t)}</p>
              <p className="num mt-1 text-[15px] text-moon-0">{usd(hp.fairValue)}</p>
              <p className="num text-moon-2">
                band {usd(hp.lower)} – {usd(hp.upper)}
              </p>
              <div className="mt-2 grid gap-0.5 border-t border-rule pt-2">
                {(Object.keys(F) as Fc[]).map((f) => {
                  const c = commitAt(f, hp.t);
                  return (
                    <p key={f} className="flex justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-moon-2">
                        <span className="size-1.5 rounded-full" style={{ background: F[f].color }} />
                        {f}
                      </span>
                      <span className="num text-moon-1">{c ? usd(c.fairValue) : "–"}</span>
                    </p>
                  );
                })}
                {hp.tokenPrice != null && (
                  <p className="flex justify-between gap-2">
                    <span className="text-moon-2">token</span>
                    <span className="num text-moon-1">{usd(hp.tokenPrice)}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
