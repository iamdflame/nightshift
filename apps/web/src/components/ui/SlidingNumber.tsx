import { useEffect, useRef, useState } from "react";

/**
 * Per-digit rolling number. Only digits that change move (CSS translateY, 450 ms ease-out) and flash
 * up/down for 400 ms. No animation on first mount: a price never "counts up" from a value it never had.
 * Reduced motion: CSS media query makes it an instant swap.
 */
export function SlidingNumber({ value, format, className = "" }: { value: number | null | undefined; format: (n: number) => string; className?: string }) {
  const text = value == null || !Number.isFinite(value) ? "–" : format(value);
  const prev = useRef<{ text: string; value: number | null }>({ text, value: value ?? null });
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const before = prev.current.value;
    if (value != null && before != null && value !== before) {
      setDir(value > before ? "up" : "down");
      const t = setTimeout(() => setDir(null), 420);
      prev.current = { text, value };
      return () => clearTimeout(t);
    }
    prev.current = { text, value: value ?? null };
  }, [value, text]);

  // Right-align digits so 99.99 → 100.01 rolls correctly.
  const chars = text.split("");
  return (
    <span className={`num ns-slide inline-flex ${dir === "up" ? "ns-flash-up" : dir === "down" ? "ns-flash-down" : ""} ${className}`} aria-label={text}>
      {chars.map((c, i) => {
        const key = chars.length - i;
        if (!/\d/.test(c)) return (
          <span key={`s${key}`} aria-hidden>
            {c}
          </span>
        );
        const d = Number(c);
        return (
          <span key={`d${key}`} aria-hidden className="ns-digit">
            <span className="ns-digit-col" style={{ transform: `translateY(${-d * 10}%)` }}>
              {"0123456789".split("").map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
