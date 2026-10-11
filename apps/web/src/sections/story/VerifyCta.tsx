import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { Link } from "react-router";
import { nextRegularOpen } from "@ns/calendar";
import { Mark } from "@/components/brand/Mark";
import { useNow } from "@/hooks/useNow";
import { useOnchain } from "@/lib/queries";
import { Heading } from "./Heading";

/** Magnetic wrapper (fine pointers only): the element leans toward the cursor and springs back. */
function Magnetic({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const move = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
  };
  const leave = () => ref.current && (ref.current.style.transform = "translate(0,0)");
  return (
    <div onPointerMove={move} onPointerLeave={leave} className="p-3">
      <div ref={ref} className="transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]">
        {children}
      </div>
    </div>
  );
}

export default function VerifyCta() {
  const { data: oc } = useOnchain();
  const now = useNow();
  const bell = nextRegularOpen(now);
  const sealed = oc?.commitments.filter((c) => c.anchorTime === bell).reduce((a, c) => a + c.rounds, 0) ?? 0;
  return (
    <section className="grain relative isolate overflow-hidden border-t border-rule py-[clamp(7rem,14vw,13rem)]" aria-labelledby="cta-title">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_100%,rgb(255_178_63/0.12),transparent_70%)]" />
      <div className="mx-auto max-w-[1320px] px-4 text-center sm:px-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.9 }} className="mx-auto w-fit">
          <Mark size={64} animate />
        </motion.div>
        <Heading id="cta-title" align="center" className="mt-8" title="Verify it yourself. No wallet.">
          Pick any forecast. Your browser rebuilds its hash, walks the Merkle proof and asks the ForecastBook contract on BNB Chain whether it was sealed before the bell.
        </Heading>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          <Magnetic>
            <Link to="/verify" className="pressable ns-shimmer inline-flex items-center gap-2 rounded-md bg-sodium px-6 py-3.5 text-[16px] font-medium text-night-0">
              Verify a forecast <ArrowRight size={17} strokeWidth={1.75} />
            </Link>
          </Magnetic>
          <Link to="/proof" className="pressable rounded-md px-6 py-3.5 text-[16px] text-moon-1 hairline hover:bg-night-2">
            See everything on-chain
          </Link>
        </div>
        {oc && (
          <dl className="mx-auto mt-14 grid max-w-[720px] grid-cols-3 gap-6 border-t border-rule pt-8 text-left">
            <div>
              <dt className="text-[13px] text-moon-3">Forecasts sealed for the next bell</dt>
              <dd className="num mt-1 text-[1.8rem] text-moon-0">{sealed}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-moon-3">Oracle reports on BNB Chain</dt>
              <dd className="num mt-1 text-[1.8rem] text-moon-0">{oc.oracle.reports}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-moon-3">Agents with ERC-8004 identities</dt>
              <dd className="num mt-1 text-[1.8rem] text-moon-0">{oc.agents.length}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
