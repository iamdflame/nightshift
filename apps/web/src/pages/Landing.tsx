import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, type LenisRef, useLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";
import { Suspense, lazy, useEffect, useRef } from "react";
import { useScrollIntent } from "@/hooks/useScrollIntent";
import { Hero } from "@/sections/hero/Hero";

gsap.registerPlugin(ScrollTrigger);

const DarkWeekend = lazy(() => import("@/sections/weekend/DarkWeekend"));
const HowItWorks = lazy(() => import("@/sections/story/HowItWorks"));
const SundayLoan = lazy(() => import("@/sections/story/SundayLoan"));
const RealityScores = lazy(() => import("@/sections/story/RealityScores"));
const AnyAgent = lazy(() => import("@/sections/story/AnyAgent"));
const VerifyCta = lazy(() => import("@/sections/story/VerifyCta"));

/** Keep ScrollTrigger in step with Lenis (one rAF loop: GSAP's ticker drives Lenis). */
function LenisSync() {
  useLenis(ScrollTrigger.update);
  return null;
}

export default function Landing() {
  const reduce = useReducedMotion();
  const lenis = useRef<LenisRef>(null);
  // The story (its WebGL Earth and textures included) mounts as soon as the reader heads down the page.
  const story = useScrollIntent() || Boolean(reduce);
  useEffect(() => {
    if (reduce) return;
    const update = (t: number) => lenis.current?.lenis?.raf(t * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(update);
  }, [reduce]);

  const body = (
    <>
      <title>Nightshift: the price of a stock when Wall Street is asleep</title>
      <Hero />
      <div id="story">
        {story ? (
          <Suspense fallback={<div className="h-[100svh]" />}>
            <DarkWeekend />
            <HowItWorks />
            <SundayLoan />
            <RealityScores />
            <AnyAgent />
            <VerifyCta />
          </Suspense>
        ) : (
          <div className="h-[100svh]" />
        )}
      </div>
    </>
  );
  if (reduce) return body;
  return (
    <ReactLenis root ref={lenis} options={{ autoRaf: false, anchors: true, lerp: 0.11 }}>
      <LenisSync />
      {body}
    </ReactLenis>
  );
}
