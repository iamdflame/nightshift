/** Formatting: every value carries its unit; times always say their zone. */

export const usd = (x: number | null | undefined, d = 2) =>
  x == null || !Number.isFinite(x) ? "–" : `$${x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const num = (x: number | null | undefined, d = 2) =>
  x == null || !Number.isFinite(x) ? "–" : x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Signed basis points with a real minus sign, e.g. "+34.7 bps" / "−12.0 bps". */
export const bps = (x: number | null | undefined, d = 1) =>
  x == null || !Number.isFinite(x) ? "–" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)} bps`;

export const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "–" : `${(x * 100).toFixed(d)}%`);

/** 0x1234…abcd (middle-truncated; the full value belongs in title/aria). */
export const short = (h: string | null | undefined, head = 6, tail = 4) => (!h ? "–" : h.length <= head + tail + 1 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`);

const etFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const etDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" });
const utcFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export const et = (ms: number) => `${etFmt.format(ms)} ET`;
export const etDate = (ms: number) => etDay.format(ms);
export const utc = (ms: number) => `${utcFmt.format(ms)} UTC`;

/** "31h 10m 04s" (or "2d 7h" past 48h when compact). */
export function duration(ms: number, compact = false): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (compact && d >= 2) return `${d}d ${h}h`;
  const hh = d * 24 + h;
  return `${hh}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export const ago = (ms: number, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const SESSION_LABEL: Record<string, string> = {
  regular: "US market open",
  pre: "Pre-market",
  post: "After hours",
  overnight: "Overnight session",
  closed: "US market closed",
};

export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");
