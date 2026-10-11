import { useNow } from "@/hooks/useNow";
import { duration } from "@/lib/format";

/** Text-only countdown (no per-second motion). Announces only at T−5 min and at the bell. */
export function Countdown({ to, className = "", openLabel = "Market open" }: { to: number; className?: string; openLabel?: string }) {
  const now = useNow();
  const left = to - now;
  const label = left <= 0 ? openLabel : left <= 60_000 ? "Opening" : duration(left);
  const announce = left <= 0 ? openLabel : Math.abs(left - 300_000) < 1000 ? "Five minutes to the opening bell" : "";
  return (
    <>
      <time dateTime={new Date(to).toISOString()} className={`num ${className}`}>
        {label}
      </time>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
