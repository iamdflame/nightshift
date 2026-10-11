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

/** Mini fan: the consensus band for the next open, round by round (real points only). */
function MiniFan({ symbol }: { symbol: string }) {
  const { data } = useHistory(symbol, 72);
  const pts = useMemo(() => (data ? data.points.filter((p) => p.anchorTime === data.nextAnchor) : []), [data]);
  if (pts.length < 2) return <div className="h-[72px] rounded-md bg-night-1/60" aria-hidden />;
  const W = 320, H = 72, pad = 4;
  const t0 = pts[0]!.t, t1 = data!.nextAnchor;
  const lo = Math.min(...pts.map((p) => p.lower)), hi = Math.max(...pts.map((p) => p.upper));
  const x = (t: number) => pad + ((t - t0) / (t1 - t0)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const step = (sel: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(sel(p)).toFixed(1)}${i < pts.length - 1 ? `H${x(pts[i + 1]!.t).toFixed(1)}` : ""}`).join("");
  const upper = step((p) => p.upper);
  const lowerRev = [...pts].reverse().map((p, i, a) => `L${(i === 0 ? x(t1) : x(a[i - 1]!.t)).toFixed(1)},${y(p.lower).toFixed(1)}L${x(p.t).toFixed(1)},${y(p.lower).toFixed(1)}`).join("");
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full" role="img" aria-label={`Consensus band for the next open over ${pts.length} rounds`}>
      <path d={`${upper}H${x(t1)}${lowerRev}Z`} fill="rgb(255 178 63 / 0.14)" />
      <path d={`${step((p) => p.fairValue)}H${x(t1)}`} fill="none" stroke="#FFB23F" strokeWidth="1.6" />
      <line x1={x(t1)} x2={x(t1)} y1={0} y2={H} stroke="#FFB23F" strokeDasharray="3 3" strokeOpacity="0.8" />
      <line x1={x(t1) - 5} x2={x(t1)} y1={y(last.upper)} y2={y(last.upper)} stroke="#FFB23F" />
      <line x1={x(t1) - 5} x2={x(t1)} y1={y(last.lower)} y2={y(last.lower)} stroke="#FFB23F" />
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
          <p className="mt-10 max-w-[46ch] text-[13px] text-moon-3">Each amber streak in the sky is a real forecast sealed on BNB Chain. The moon and the stars are the real ones above Wall Street right now.</p>
        </div>
        <div className="flex justify-start lg:justify-end">
          <LiveCard />
        </div>
      </div>
    </section>
  );
}
