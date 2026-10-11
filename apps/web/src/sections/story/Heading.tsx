import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useReducedMotion } from "motion/react";
import { type ReactNode, useRef } from "react";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

/** Section heading: a kicker line (sentence case, not caps) + a Newsreader title revealed line by line. */
export function Heading({ kicker, title, children, id, className = "", align = "left" }: { kicker?: string; title: string; children?: ReactNode; id?: string; className?: string; align?: "left" | "center" }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useGSAP(
    () => {
      if (reduce || !ref.current) return;
      const h = ref.current.querySelector("h2");
      if (!h) return;
      document.fonts.ready.then(() => {
        SplitText.create(h, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (s) => gsap.from(s.lines, { yPercent: 105, duration: 1.1, ease: "expo.out", stagger: 0.09, scrollTrigger: { trigger: h, start: "top 82%" } }),
        });
      });
    },
    { scope: ref, dependencies: [reduce] },
  );
  return (
    <div ref={ref} className={`${align === "center" ? "mx-auto text-center" : ""} max-w-[46rem] ${className}`}>
      {kicker && <p className="text-[14px] font-medium text-sodium/90">{kicker}</p>}
      <h2 id={id} className="mt-3 text-[clamp(2.3rem,4.4vw+0.4rem,4.4rem)] font-[300] leading-[1.02]">
        {title}
      </h2>
      {children && <div className={`mt-6 max-w-[58ch] text-[17px] leading-relaxed text-moon-2 ${align === "center" ? "mx-auto" : ""}`}>{children}</div>}
    </div>
  );
}
