import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { bscscan } from "@/lib/links";
import { short } from "@/lib/format";
import { spring } from "@/lib/motion";

type Kind = "tx" | "address" | "block" | "root";

/** A hash you can read, copy and open: middle-truncated, copy morphs to a check, BscScan link. */
export function HashChip({ value, kind = "tx", label, className = "" }: { value: string | null | undefined; kind?: Kind; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const live = useRef<HTMLSpanElement>(null);
  if (!value) return <span className="text-moon-3">–</span>;
  const href = kind === "tx" ? bscscan.tx(value) : kind === "address" ? bscscan.address(value) : kind === "block" ? bscscan.block(BigInt(value)) : null;
  const copy = async () => {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(true);
    if (live.current) live.current.textContent = "Copied";
    setTimeout(() => {
      setCopied(false);
      if (live.current) live.current.textContent = "";
    }, 1600);
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-night-1/80 py-0.5 pl-2 pr-0.5 hairline ${className}`}>
      {label && <span className="mr-1 text-[12px] text-moon-3">{label}</span>}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" title={value} aria-label={`${kind} ${value} on BscScan`} className="num text-[12.5px] text-moon-1 underline-offset-4 hover:text-moon-0 hover:underline">
          {short(value)}
        </a>
      ) : (
        <span className="num text-[12.5px] text-moon-1" title={value}>
          {short(value)}
        </span>
      )}
      <button type="button" onClick={copy} aria-label={`Copy ${kind}`} className="pressable relative grid size-7 place-items-center rounded-md text-moon-2 hover:text-moon-0 [@media(pointer:coarse)]:size-9">
        <AnimatePresence mode="popLayout" initial={false}>
          {copied ? (
            <motion.span key="ok" initial={{ scale: 0.25, filter: "blur(4px)", opacity: 0 }} animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }} exit={{ scale: 0.25, opacity: 0 }} transition={spring.icon}>
              <Check size={14} strokeWidth={1.75} className="text-up" />
            </motion.span>
          ) : (
            <motion.span key="cp" initial={{ scale: 0.25, filter: "blur(4px)", opacity: 0 }} animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }} exit={{ scale: 0.25, opacity: 0 }} transition={spring.icon}>
              <Copy size={14} strokeWidth={1.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" aria-hidden tabIndex={-1} className="grid size-7 place-items-center text-moon-3 hover:text-moon-1">
          <ExternalLink size={13} strokeWidth={1.5} />
        </a>
      )}
      <span ref={live} aria-live="polite" className="sr-only" />
    </span>
  );
}
