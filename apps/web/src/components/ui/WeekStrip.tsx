import { useMemo } from "react";
import { type Session, nextRegularOpen, sessionAt } from "@ns/calendar";
import { useNow } from "@/hooks/useNow";

const SHADE: Record<Session, string> = {
  regular: "#F4F1E8",
  pre: "rgb(244 241 232 / 0.32)",
  post: "rgb(244 241 232 / 0.32)",
  overnight: "rgb(244 241 232 / 0.14)",
  closed: "rgb(160 180 220 / 0.05)",
};

/** A 168-hour strip of the real US market week (DST- and holiday-aware), with now and the next bell. */
export function WeekStrip({ className = "", caption = true }: { className?: string; caption?: boolean }) {
  const now = useNow();
  const hour = Math.floor(now / 3600_000);
  const { segs, from, to, bell, openHours } = useMemo(() => {
    const from = (hour - 96) * 3600_000;
    const to = from + 168 * 3600_000;
    const segs: { a: number; b: number; s: Session }[] = [];
    let open = 0;
    for (let t = from; t < to; t += 15 * 60_000) {
      const s = sessionAt(t);
      if (s === "regular") open += 0.25;
      const last = segs[segs.length - 1];
      if (last && last.s === s) last.b = t + 15 * 60_000;
      else segs.push({ a: t, b: t + 15 * 60_000, s });
    }
    return { segs, from, to, bell: nextRegularOpen(hour * 3600_000), openHours: open };
  }, [hour]);
  const x = (t: number) => ((t - from) / (to - from)) * 100;
  return (
    <div className={className}>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 w-full rounded-sm" role="img" aria-label={`The real market is open ${openHours} of these 168 hours`}>
        {segs.map((g) => (
          <rect key={g.a} x={x(g.a)} width={Math.max(0.05, x(g.b) - x(g.a))} y="0" height="10" fill={SHADE[g.s]} />
        ))}
        <rect x={x(now) - 0.08} width="0.16" y="-2" height="14" fill="#F4F1E8" />
        {bell < to && <rect x={x(bell) - 0.12} width="0.24" y="-2" height="14" fill="#FFB23F" />}
      </svg>
      {caption && (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-moon-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-moon-0" aria-hidden />
            Regular session ({openHours} of 168 h)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-[rgb(244_241_232/0.14)]" aria-hidden />
            Thin sessions
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-[rgb(160_180_220/0.12)]" aria-hidden />
            Dark
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-moon-0" aria-hidden />
            Now
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-sodium" aria-hidden />
            Next bell
          </span>
        </div>
      )}
    </div>
  );
}
