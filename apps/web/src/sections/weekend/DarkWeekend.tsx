import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { lastRegularClose, nextRegularOpen, sessionAt } from "@ns/calendar";
import { useNow } from "@/hooks/useNow";
import { usd } from "@/lib/format";
import { useHistory } from "@/lib/queries";
import { ringBell, tick } from "@/lib/sound";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const Earth = lazy(() => import("./Earth"));
const LANE = { anchor: "#4A8CF0", echo: "#097C60", nfv: "#D66A98" } as const;
const etClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const utcClock = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** Regular-session hours in the 168 h before the bell, from the real market calendar (holiday-aware). */
function openHoursThisWeek(bell: number) {
  let q = 0;
  for (let t = bell - 168 * 3600_000; t < bell; t += 15 * 60_000) if (sessionAt(t) === "regular") q++;
  return q / 4;
}

function Captions({ index, openHours, sealed, darkHours }: { index: number; openHours: number; sealed: number; darkHours: number }) {
  const items = [
    {
      h: `The real market sets a price ${openHours} hours a week.`,
      p: `Tokenized stocks trade all 168. From Friday's close to Monday's bell is ${darkHours} hours with no reference price at all.`,
    },
    {
      h: "And that's when people trade.",
      p: (
        <>
          62% of bStocks' July volume happened while US markets were dark (
          <a className="underline underline-offset-4 hover:text-moon-0" href="https://cryptobriefing.com/binance-bstocks-volume-us-market-closures/" target="_blank" rel="noreferrer">
            Crypto Briefing, Aug 26 2026
          </a>
          ).
        </>
      ),
    },
    {
      h: "The oracles go quiet.",
      p: (
        <>
          “These feeds do not publish updates, including heartbeat updates, while markets are closed.” (
          <a className="underline underline-offset-4 hover:text-moon-0" href="https://docs.chain.link/data-feeds/tokenized-equity-feeds" target="_blank" rel="noreferrer">
            Chainlink docs
          </a>
          ). Lenders see Friday's close all weekend.
        </>
      ),
    },
    {
      h: "The night shift doesn't.",
      p: `Every 30 minutes, three agents seal their forecast of Monday's open on BNB Chain. ${sealed ? `${sealed} forecasts are sealed for this bell so far.` : ""}`,
    },
  ];
  const it = items[Math.min(index, items.length - 1)]!;
  return (
    <div className="relative min-h-[7.5rem] md:min-h-[11rem]" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div key={index} initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.45 }}>
          <h3 className="text-[clamp(1.6rem,3.2vw,2.9rem)] font-[300] leading-[1.06]">{it.h}</h3>
          <p className="mt-2 max-w-[46ch] text-[14.5px] leading-relaxed text-moon-2 md:mt-3 md:text-[16px] [@media(max-height:700px)]:hidden">{it.p}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function DarkWeekend() {
  const root = useRef<HTMLElement>(null);
  const reduce = Boolean(useReducedMotion());
  const now = useNow();
  const bell = useMemo(() => nextRegularOpen(now), [Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useMemo(() => lastRegularClose(bell - 60_000), [bell]);
  const darkHours = Math.round(((bell - close) / 3600_000) * 10) / 10;
  const openHours = useMemo(() => openHoursThisWeek(bell), [bell]);
  const { data } = useHistory("NVDAB", Math.ceil((Date.now() - close) / 3600_000) + 2);
  const pts = useMemo(() => (data ? data.points.filter((p) => p.anchorTime === data.nextAnchor) : []), [data]);
  const commits = useMemo(() => (data ? data.commits.filter((c) => c.chain === "committed") : []), [data]);

  const timeRef = useRef<number>(reduce ? Date.now() : close);
  const clip = useRef<SVGRectElement>(null);
  const [p, setP] = useState(reduce ? (Date.now() - close) / (bell - close) : 0);
  const [mobile, setMobile] = useState(false);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  const caption = Math.min(3, Math.floor(p * 4.4));
  const lastCaption = useRef(-1);
  useEffect(() => {
    if (lastCaption.current !== -1 && caption !== lastCaption.current) tick();
    lastCaption.current = caption;
  }, [caption]);
  const rang = useRef(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        ScrollTrigger.create({
          trigger: root.current,
          start: "top top",
          end: () => `+=${window.innerHeight * (window.innerWidth < 768 ? 2.6 : 3.6)}`,
          pin: true,
          scrub: 0.6,
          onToggle: (s) => setInView(s.isActive),
          onUpdate: (s) => {
            const v = s.progress;
            timeRef.current = close + v * (bell - close);
            if (clip.current) clip.current.setAttribute("width", String(Math.max(0, v) * 1000));
            setP(Math.round(v * 200) / 200);
            if (v > 0.985 && !rang.current) {
              rang.current = true;
              ringBell();
            }
            if (v < 0.9) rang.current = false;
          },
        });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [close, bell] },
  );

  const simT = reduce ? Date.now() : close + p * (bell - close);
  const elapsed = (simT - close) / 3600_000;
  const atBell = p > 0.985;

  // Strip geometry (viewBox 1000 × 150): x = time from Friday's close to the bell.
  const X = (t: number) => ((t - close) / (bell - close)) * 1000;
  const vals = pts.flatMap((q) => [q.lower, q.upper]);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * 84;
  const step = (sel: (q: (typeof pts)[number]) => number) => pts.map((q, i) => `${i ? "L" : "M"}${X(q.t).toFixed(1)},${Y(sel(q)).toFixed(1)}H${(i < pts.length - 1 ? X(pts[i + 1]!.t) : 1000).toFixed(1)}`).join("");
  const band = pts.length ? `${step((q) => q.upper)}${[...pts].reverse().map((q, i, a) => `L${(i === 0 ? 1000 : X(a[i - 1]!.t)).toFixed(1)},${Y(q.lower).toFixed(1)}L${X(q.t).toFixed(1)},${Y(q.lower).toFixed(1)}`).join("")}Z` : "";
  const cur = [...pts].reverse().find((q) => q.t <= simT) ?? pts[0];
  // Real data stops at "now": the band beyond it is the latest forecast held forward, drawn faint and labelled.
  const nowX = Math.min(1000, Math.max(0, X(Date.now())));

  return (
    <section ref={root} className="relative h-[100svh] overflow-hidden bg-night-0" aria-labelledby="weekend-title">
      <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_70%_45%,rgb(29_40_67/0.6),transparent_70%)]" aria-hidden />
      <div className={`absolute ${mobile ? "inset-x-0 top-14 h-[33svh]" : "inset-y-0 right-0 w-[64%]"}`} aria-hidden>
        <Suspense fallback={null}>
          <Earth timeRef={timeRef} active={reduce ? false : inView} mobile={mobile} />
        </Suspense>
      </div>
      <div className="relative mx-auto flex h-full max-w-[1320px] flex-col justify-between px-4 pb-5 pt-20 sm:px-6 md:pb-8 md:pt-28">
        <div className={mobile ? "mt-[29svh]" : "max-w-[34rem]"}>
          <p id="weekend-title" className="text-[14px] font-medium text-sodium/90">
            The dark weekend
          </p>
          <div className="mt-3 flex items-baseline gap-4">
            <time className="whitespace-nowrap font-display text-[clamp(2.4rem,5vw,4.4rem)] font-[300] leading-none text-moon-0">{etClock.format(simT)} ET</time>
          </div>
          <p className="num mt-2 text-[12.5px] text-moon-3 md:text-[13px]">
            <span className="max-sm:hidden">{utcClock.format(simT)} UTC, </span>
            {elapsed.toFixed(1)} h of {darkHours} h without a reference price
          </p>
          <div className="mt-4 md:mt-8">
            <Captions index={reduce ? 3 : caption} openHours={openHours} sealed={commits.length} darkHours={darkHours} />
          </div>
        </div>

        <div className="relative mt-4 md:-mx-4 md:mt-6 md:rounded-[12px] md:bg-night-0/70 md:px-4 md:pb-3 md:pt-3">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 text-[12.5px] text-moon-3">
            <span>
              NVDAB<span className="max-sm:hidden">, consensus for Monday's open and each agent's sealed forecasts</span>
            </span>
            {cur && (
              <span className="num text-moon-1">
                {usd(cur.fairValue)} <span className="text-moon-3">band</span> {usd(cur.lower)} – {usd(cur.upper)}
              </span>
            )}
          </div>
          <div className="relative">
          <svg viewBox="0 0 1000 150" preserveAspectRatio="none" className="h-[92px] w-full overflow-visible md:h-[132px]" role="img" aria-label={`NVDAB consensus for the bell over ${pts.length} rounds, ${commits.length} forecasts sealed on BNB Chain`}>
            <defs>
              <clipPath id="ns-week-clip">
                <rect ref={clip} x="0" y="-10" width={reduce ? 1000 : 0} height="170" />
              </clipPath>
            </defs>
            <rect x="0" y="0" width="1000" height="96" fill="rgb(160 180 220 / 0.04)" />
            <g clipPath="url(#ns-week-clip)">
              <clipPath id="ns-week-real">
                <rect x="0" y="-10" width={nowX} height="170" />
              </clipPath>
              {band && <path d={band} fill="rgb(255 178 63 / 0.06)" />}
              {band && <path d={band} fill="rgb(255 178 63 / 0.16)" clipPath="url(#ns-week-real)" />}
              {pts.length > 0 && <path d={step((q) => q.fairValue)} fill="none" stroke="#FFB23F" strokeOpacity="0.35" strokeDasharray="3 4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
              {pts.length > 0 && <path d={step((q) => q.fairValue)} fill="none" stroke="#FFB23F" strokeWidth="2" vectorEffect="non-scaling-stroke" clipPath="url(#ns-week-real)" />}
              <line x1={nowX} x2={nowX} y1="0" y2="100" stroke="#F4F1E8" strokeOpacity="0.7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {(["anchor", "echo", "nfv"] as const).map((f, li) =>
                commits
                  .filter((c) => c.forecaster === f)
                  .map((c) => <rect key={`${f}-${c.round}`} x={X(c.t) - 1} y={108 + li * 13} width="2.2" height="9" fill={LANE[f]} />),
              )}
            </g>
            <line x1="1000" x2="1000" y1="0" y2="150" stroke="#FFB23F" strokeWidth="1.5" strokeDasharray={atBell ? undefined : "4 4"} vectorEffect="non-scaling-stroke" />
          </svg>
            {(reduce || p * 1000 >= nowX) && (
              <span className="absolute top-0 ml-1.5 text-[11px] leading-none text-moon-1" style={{ left: `${nowX / 10}%` }}>
                now
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] text-moon-3">
            <span>
              <span className="max-sm:hidden">Friday close, </span>
              {etClock.format(close)} ET
            </span>
            <span className="flex items-center gap-3" aria-label="Sealed forecasts by agent">
              {(["anchor", "echo", "nfv"] as const).map((f) => (
                <span key={f} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-[3px] rounded-[1px]" style={{ background: LANE[f] }} aria-hidden />
                  {f}
                </span>
              ))}
            </span>
            <span className={atBell ? "text-sodium" : ""}>
              <span className="max-sm:hidden">The bell, </span>
              {etClock.format(bell)} ET
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
