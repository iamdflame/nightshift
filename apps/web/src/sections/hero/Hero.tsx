import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Suspense, lazy, useMemo, useRef } from "react";
import { Link } from "react-router";
import { nextRegularOpen, sessionAt } from "@ns/calendar";
import { Countdown } from "@/components/ui/Countdown";
import { HashChip } from "@/components/ui/HashChip";
import { Photo } from "@/components/ui/Photo";
import { SlidingNumber } from "@/components/ui/SlidingNumber";
import { useNow } from "@/hooks/useNow";
import { SESSION_LABEL, et, usd } from "@/lib/format";
import { ease } from "@/lib/motion";
import { useFairValue, useHistory, useOnchain } from "@/lib/queries";

gsap.registerPlugin(SplitText, useGSAP);

const NightSky = lazy(() => import("@/scene/NightSky"));
const MoonPhaseLabel = lazy(() => import("@/scene/NightSky").then((m) => ({ default: m.MoonPhaseLabel })));

/** Mini fan: the token's real hourly price (moonlight) against the consensus band aimed at the next open (amber). */
function MiniFan({ symbol }: { symbol: string }) {
  const { data } = useHistory(symbol, 72);
  const model = useMemo(() => {
    if (!data) return null;
    const pts = data.points.filter((p) => p.anchorTime === data.nextAnchor);
    if (pts.length < 2) return null;
    const t0 = pts[0]!.t, t1 = data.nextAnchor;
    const k = data.klines.filter((x) => x.t >= t0 - 3600_000);
    const vals = [...pts.flatMap((p) => [p.lower, p.upper]), ...k.map((x) => x.close)];
    return { pts, k, t0, t1, lo: Math.min(...vals), hi: Math.max(...vals) };
  }, [data]);
  if (!model) return <div className="h-[84px] rounded-md bg-night-1/60" aria-hidden />;
  const { pts, k, t0, t1, lo, hi } = model;
  const W = 340, H = 84, pad = 6;
  const x = (t: number) => pad + ((Math.max(t, t0) - t0) / (t1 - t0)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const stepPath = (sel: (p: (typeof pts)[number]) => number) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(sel(p)).toFixed(1)}H${(i < pts.length - 1 ? x(pts[i + 1]!.t) : x(t1)).toFixed(1)}`).join("");
  const lowerBack = [...pts].reverse().map((p, i, a) => `L${(i === 0 ? x(t1) : x(a[i - 1]!.t)).toFixed(1)},${y(p.lower).toFixed(1)}L${x(p.t).toFixed(1)},${y(p.lower).toFixed(1)}`).join("");
  const price = k.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.close).toFixed(1)}`).join("");
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[84px] w-full overflow-visible" role="img" aria-label={`NVDAB hourly price against the consensus band for the next open, ${pts.length} rounds`}>
      <path d={`${stepPath((p) => p.upper)}${lowerBack}Z`} fill="rgb(255 178 63 / 0.13)" />
      <path d={stepPath((p) => p.upper)} fill="none" stroke="rgb(255 178 63 / 0.45)" strokeWidth="1" />
      <path d={stepPath((p) => p.lower)} fill="none" stroke="rgb(255 178 63 / 0.45)" strokeWidth="1" />
      <path d={stepPath((p) => p.fairValue)} fill="none" stroke="#FFB23F" strokeWidth="1.6" />
      {price && <path d={price} fill="none" stroke="#E4E1D6" strokeOpacity="0.85" strokeWidth="1.2" strokeLinejoin="round" />}
      <line x1={x(t1)} x2={x(t1)} y1={2} y2={H - 2} stroke="#FFB23F" strokeDasharray="2 3" />
      <path d={`M${x(t1) - 6},${y(last.upper)}H${x(t1)}V${y(last.lower)}H${x(t1) - 6}`} fill="none" stroke="#FFB23F" strokeWidth="1.4" />
    </svg>
  );
}

function LiveCard() {
  const now = useNow();
  const { data: fv } = useFairValue("NVDAB");
  const { data: oc } = useOnchain();
  const c = fv?.consensus;
  const open = sessionAt(now) === "regular";
  const bell = nextRegularOpen(now);
  const sealed = oc?.commitments.filter((x) => x.anchorTime === bell) ?? [];
  const lastCommit = oc?.recentCommits.find((x) => x.anchorTime === bell);
  return (
    <motion.aside
      initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.9, ease: ease.out, delay: 0.5 }}
      className="glass relative w-full max-w-[420px] overflow-hidden rounded-[14px] bg-night-1/70 p-5 shadow-[var(--elev-2)] backdrop-blur-xl sm:p-6"
      aria-label="Live NVIDIA fair value"
    >
      <span className="ns-beam" aria-hidden />
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-moon-2">NVIDIA, as NVDAB on BNB Chain</p>
          <p className="mt-0.5 text-[13px] text-moon-3">{open ? "Live fair value (market open)" : `Fair value for the open, ${et(bell)}`}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-moon-2">
          <span className="ns-live" aria-hidden />
          Live
        </span>
      </div>
      <div className="mt-4 text-[clamp(2.4rem,4vw,3.25rem)] leading-none text-moon-0">
        <SlidingNumber value={c?.fairValue} format={(n) => usd(n)} />
      </div>
      <p className="mt-2 text-[14px] text-moon-2">
        90% band <span className="num text-moon-1">{c ? `${usd(c.lower)} – ${usd(c.upper)}` : "–"}</span>
      </p>
      <div className="mt-4">
        <MiniFan symbol="NVDAB" />
        <div className="mt-1.5 flex items-center gap-4 text-[11.5px] text-moon-3">
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-3 bg-moon-1" aria-hidden />Token price, hourly</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-sodium" aria-hidden />Consensus and 90% band for the bell</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-rule pt-4 text-[13px]">
        <div>
          <p className="text-moon-3">{open ? "Session" : "Bell in"}</p>
          <p className="mt-0.5 text-[15px] text-sodium">{open ? SESSION_LABEL.regular : <Countdown to={bell} />}</p>
        </div>
        <div>
          <p className="text-moon-3">Sealed on BNB Chain</p>
          <p className="num mt-0.5 text-[15px] text-moon-0">{sealed.reduce((a, s) => a + s.rounds, 0) || "–"} forecasts</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <HashChip value={lastCommit?.tx} label="Latest seal" />
        <Link to={lastCommit ? `/verify?round=${lastCommit.round}&forecaster=${lastCommit.forecaster}&symbol=NVDAB` : "/verify"} className="inline-flex items-center gap-1 text-[13px] text-moon-1 hover:text-moon-0">
          Verify it <ArrowRight size={14} strokeWidth={1.5} />
        </Link>
      </div>
    </motion.aside>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { data: oc } = useOnchain();
  const events = useMemo(() => (oc?.recentCommits ?? []).map((c) => ({ tx: c.tx, forecaster: c.forecaster as "anchor" | "echo" | "nfv", t: c.t })), [oc]);

  useGSAP(
    () => {
      if (reduce) return;
      document.fonts.ready.then(() => {
        SplitText.create(".ns-hero-title", {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (s) => gsap.from(s.lines, { yPercent: 110, opacity: 0, duration: 1.25, ease: "expo.out", stagger: 0.12, delay: 0.15 }),
        });
      });
    },
    { scope: root, dependencies: [reduce] },
  );

  return (
    <section ref={root} className="grain relative isolate min-h-[100svh] overflow-hidden" aria-labelledby="hero-title">
      {/* Poster while the sky loads (LCP stays on the headline). */}
      <div className="absolute inset-0 -z-20">
        <Photo name="milkyway" alt="" priority className="h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_70%_0%,transparent,var(--color-night-0)_75%)]" />
      </div>
      <div className="absolute inset-0 -z-10" aria-hidden>
        <Suspense fallback={null}>
          <NightSky events={events} />
        </Suspense>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[45%] bg-gradient-to-t from-night-0 via-night-0/70 to-transparent" />

      <div className="mx-auto grid min-h-[100svh] max-w-[1320px] items-end gap-12 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:pb-24">
        <div>
          <h1 id="hero-title" className="ns-hero-title max-w-[13ch] text-[clamp(3rem,6.2vw+0.6rem,6.4rem)] font-[300] leading-[0.98] tracking-[-0.028em]">
            The price of a stock when Wall Street is asleep.
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: ease.out, delay: 0.9 }}
            className="mt-7 max-w-[52ch] text-[17px] leading-relaxed text-moon-2 sm:text-[18px]"
          >
            Nightshift is a 24/7 price oracle for tokenized stocks on BNB Chain. AI agents seal their forecast of every stock's next open on-chain before the bell, reality scores them,
            and contracts read their consensus at 3 a.m. on a Sunday.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1.2 }} className="mt-9 flex flex-wrap items-center gap-3">
            <a href="#story" className="pressable ns-shimmer inline-flex items-center gap-2 rounded-md bg-sodium px-5 py-3 font-medium text-night-0">
              Enter the night shift <ArrowRight size={16} strokeWidth={1.75} />
            </a>
            <Link to="/verify" className="pressable inline-flex items-center gap-2 rounded-md px-5 py-3 text-moon-1 hairline hover:bg-night-2/70">
              Verify a forecast
            </Link>
          </motion.div>
          <p className="mt-10 max-w-[48ch] text-[13px] text-moon-3">Each amber streak is a real forecast sealed on BNB Chain. The stars are tonight's real sky over Wall Street, and <Suspense fallback="tonight"><MoonPhaseLabel /></Suspense>.</p>
        </div>
        <div className="flex justify-start lg:justify-end">
          <LiveCard />
        </div>
      </div>
    </section>
  );
}
