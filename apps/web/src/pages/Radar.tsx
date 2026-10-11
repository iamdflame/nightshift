import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { nextRegularOpen } from "@ns/calendar";
import { Countdown } from "@/components/ui/Countdown";
import { HashChip } from "@/components/ui/HashChip";
import { WeekStrip } from "@/components/ui/WeekStrip";
import { useNow } from "@/hooks/useNow";
import type { RadarRow } from "@/lib/api";
import { bps, et, num, usd } from "@/lib/format";
import { useRadar, useRounds } from "@/lib/queries";

type Key = "symbol" | "lastClosePerToken" | "tokenPrice" | "moveBps" | "fairValue" | "bandBps" | "premiumToFairValueBps";
const COLS: { key: Key; label: string; num?: boolean }[] = [
  { key: "symbol", label: "Stock" },
  { key: "lastClosePerToken", label: "Last close", num: true },
  { key: "tokenPrice", label: "Token now", num: true },
  { key: "moveBps", label: "Since close", num: true },
  { key: "fairValue", label: "Fair value for the bell", num: true },
  { key: "bandBps", label: "90% band", num: true },
  { key: "premiumToFairValueBps", label: "Token vs fair value", num: true },
];

const bandBps = (r: RadarRow) => ((r.upper - r.lower) / r.fairValue) * 1e4;

function BandGlyph({ r }: { r: RadarRow }) {
  const lo = Math.min(r.lower, r.tokenPrice, r.lastClosePerToken ?? r.lower);
  const hi = Math.max(r.upper, r.tokenPrice, r.lastClosePerToken ?? r.upper);
  const pad = (hi - lo) * 0.12 || 1;
  const x = (v: number) => ((v - lo + pad) / (hi - lo + 2 * pad)) * 96;
  return (
    <svg viewBox="0 0 96 16" className="h-4 w-24 shrink-0" aria-hidden>
      <line x1="0" x2="96" y1="8" y2="8" stroke="rgb(160 180 220 / 0.18)" />
      <rect x={x(r.lower)} width={Math.max(1, x(r.upper) - x(r.lower))} y="3" height="10" rx="2" fill="rgb(255 178 63 / 0.18)" stroke="rgb(255 178 63 / 0.6)" strokeWidth="0.8" />
      <line x1={x(r.fairValue)} x2={x(r.fairValue)} y1="2" y2="14" stroke="#FFB23F" strokeWidth="1.6" />
      {r.lastClosePerToken != null && <line x1={x(r.lastClosePerToken)} x2={x(r.lastClosePerToken)} y1="4" y2="12" stroke="#7C859D" strokeWidth="1.2" strokeDasharray="1.5 1.5" />}
      <circle cx={x(r.tokenPrice)} cy="8" r="2.6" fill="#F4F1E8" stroke="#0F1628" strokeWidth="1.2" />
    </svg>
  );
}

function Signed({ v }: { v: number | null }) {
  if (v == null) return <span className="text-moon-3">–</span>;
  const up = v > 0;
  return (
    <span className={`inline-flex items-center gap-1 ${v === 0 ? "text-moon-2" : up ? "text-up" : "text-down"}`}>
      {v !== 0 && (up ? <ArrowUp size={12} strokeWidth={2} aria-hidden /> : <ArrowDown size={12} strokeWidth={2} aria-hidden />)}
      {bps(v)}
    </span>
  );
}

export default function Radar() {
  const { data, isLoading, isError, refetch } = useRadar();
  const { data: rounds } = useRounds(1);
  const now = useNow();
  const bell = nextRegularOpen(now);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "moveBps", dir: -1 });
  const [focus, setFocus] = useState(0);
  const filter = useRef<HTMLInputElement>(null);
  const tbody = useRef<HTMLTableSectionElement>(null);
  const nav = useNavigate();
  const prev = useRef(new Map<string, number>());
  const [flash, setFlash] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const r = (data?.rows ?? []).filter((x) => !q || x.symbol.toLowerCase().includes(q.toLowerCase()) || x.ticker.toLowerCase().includes(q.toLowerCase()));
    const val = (x: RadarRow) => (sort.key === "bandBps" ? bandBps(x) : sort.key === "moveBps" ? Math.abs(x.moveBps ?? 0) : (x[sort.key] as number | string | null));
    return [...r].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * sort.dir;
      return (((va as number) ?? -Infinity) - ((vb as number) ?? -Infinity)) * sort.dir;
    });
  }, [data, q, sort]);

  // Amber wash on rows whose fair value changed since the last refetch (colour only).
  useEffect(() => {
    if (!data) return;
    const changed = new Set<string>();
    for (const r of data.rows) {
      const p = prev.current.get(r.symbol);
      if (p != null && p !== r.fairValue) changed.add(r.symbol);
      prev.current.set(r.symbol, r.fairValue);
    }
    if (changed.size) {
      setFlash(changed);
      const t = setTimeout(() => setFlash(new Set()), 700);
      return () => clearTimeout(t);
    }
  }, [data]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        filter.current?.focus();
        return;
      }
      if (e.key === "Escape" && typing) {
        setQ("");
        filter.current?.blur();
        return;
      }
      if (typing) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setFocus((f) => {
          const n = Math.max(0, Math.min(rows.length - 1, f + (e.key === "j" ? 1 : -1)));
          tbody.current?.querySelectorAll<HTMLAnchorElement>("a[data-row]")[n]?.focus();
          return n;
        });
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [rows.length]);

  const head = (c: (typeof COLS)[number]) => {
    const active = sort.key === c.key;
    return (
      <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`z-10 bg-night-0/95 px-3 py-3 font-medium backdrop-blur lg:sticky lg:top-16 ${c.num ? "text-right" : "text-left"}`}>
        <button type="button" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : -1 }))} className={`inline-flex items-center gap-1 text-[12.5px] ${active ? "text-moon-0" : "text-moon-2 hover:text-moon-0"}`}>
          {c.label}
          {active && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </button>
      </th>
    );
  };
  const r0 = rounds?.[0];

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-28 sm:px-6">
      <title>Radar · Nightshift</title>
      <header className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <p className="text-[14px] font-medium text-sodium/90">Radar</p>
          <h1 className="mt-3 text-[clamp(2.6rem,5vw,4.4rem)] font-[300]">Every stock, priced through the night.</h1>
          <p className="mt-4 max-w-[60ch] text-[17px] text-moon-2">
            All {data?.rows.length ?? 91} bStocks on BNB Chain: where each token trades now, Nightshift's fair value for the next official open and the 90% band around it. A stock trading outside its band is
            paying a premium (or offering a discount) the market may not keep at the bell.
          </p>
        </div>
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-moon-2">
              Round <span className="num text-moon-0">{r0?.round ?? "–"}</span> sealed {r0 ? et(new Date(r0.ts).getTime()) : ""}
            </span>
            <span className="text-moon-2">
              Bell in <Countdown to={bell} className="text-sodium" />
            </span>
          </div>
          <div className="mt-3 grid gap-1.5">
            {r0 &&
              (["anchor", "echo", "nfv"] as const).map((f) =>
                r0.commitments[f] ? (
                  <div key={f} className="flex items-center justify-between gap-2 text-[12.5px] text-moon-3">
                    <span className="w-14">{f}</span>
                    <HashChip value={r0.commitments[f]!.tx ?? r0.commitments[f]!.root} kind={r0.commitments[f]!.tx ? "tx" : "root"} />
                  </div>
                ) : null,
              )}
          </div>
          <WeekStrip className="mt-4" caption={false} />
        </div>
      </header>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-[22rem]">
          <span className="sr-only">Filter stocks</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-moon-3" />
          <input ref={filter} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter, e.g. NVDA" className="w-full rounded-md bg-night-1 py-2.5 pl-9 pr-10 text-[14.5px] text-moon-0 hairline outline-none placeholder:text-moon-3" />
          <kbd className="num absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-night-3 px-1.5 text-[11px] text-moon-2">/</kbd>
        </label>
        <p className="text-[12.5px] text-moon-3">
          <kbd className="num rounded bg-night-2 px-1">j</kbd> <kbd className="num rounded bg-night-2 px-1">k</kbd> to move, Enter to open. Prices are USD per token.
        </p>
      </div>

      {isError ? (
        <div role="alert" className="card mt-6 p-6 text-moon-1">
          The radar couldn't load. <button className="underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : (
        <div className="mt-4 max-lg:overflow-x-auto max-sm:overflow-visible">
          <table className="w-full border-separate border-spacing-0 text-[14px] max-sm:block">
            <thead className="max-sm:hidden">
              <tr>
                {COLS.map(head)}
                <th scope="col" className="z-10 bg-night-0/95 px-3 py-3 text-left text-[12.5px] font-medium text-moon-2 backdrop-blur lg:sticky lg:top-16">
                  State
                </th>
              </tr>
            </thead>
            <tbody ref={tbody} className="max-sm:grid max-sm:gap-3">
              {isLoading &&
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="border-b border-rule px-3 py-4">
                      <div className="h-4 w-full animate-pulse rounded bg-night-2" />
                    </td>
                  </tr>
                ))}
              {rows.map((r, i) => (
                <tr key={r.symbol} className={`group transition-colors duration-700 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-4 max-sm:gap-y-3 max-sm:rounded-[10px] max-sm:bg-night-2 max-sm:p-4 max-sm:shadow-[var(--elev-1)] ${flash.has(r.symbol) ? "bg-[rgb(255_178_63/0.12)]" : "hover:bg-night-1"}`}>
                  <td className="border-b border-rule px-3 py-3 max-sm:col-span-2 max-sm:border-0 max-sm:p-0">
                    <Link data-row to={`/s/${r.symbol}`} viewTransition onFocus={() => setFocus(i)} className={`inline-flex items-baseline gap-2 rounded ${focus === i ? "" : ""}`} onKeyDown={(e) => e.key === "Enter" && nav(`/s/${r.symbol}`)}>
                      <span className="num text-[14.5px] font-medium text-moon-0 group-hover:text-sodium">{r.symbol}</span>
                      <span className="text-[12.5px] text-moon-3">{r.ticker}</span>
                    </Link>
                  </td>
                  <td data-label="Last close" className="num border-b border-rule px-3 py-3 text-right text-moon-2 max-sm:border-0 max-sm:p-0 max-sm:text-left">
                    {usd(r.lastClosePerToken)}
                  </td>
                  <td data-label="Token now" className="num border-b border-rule px-3 py-3 text-right text-moon-1 max-sm:border-0 max-sm:p-0 max-sm:text-left">
                    {usd(r.tokenPrice)}
                  </td>
                  <td data-label="Since close" className="num border-b border-rule px-3 py-3 text-right max-sm:border-0 max-sm:p-0 max-sm:text-left">
                    <Signed v={r.moveBps} />
                  </td>
                  <td data-label="Fair value" className="num border-b border-rule px-3 py-3 text-right text-[15px] text-moon-0 max-sm:border-0 max-sm:p-0 max-sm:text-left">
                    {usd(r.fairValue)}
                  </td>
                  <td data-label="90% band" className="border-b border-rule px-3 py-3 max-sm:col-span-2 max-sm:border-0 max-sm:p-0">
                    <span className="flex items-center justify-end gap-3 max-sm:justify-start">
                      <BandGlyph r={r} />
                      <span className="num text-[12.5px] text-moon-2">
                        {num(r.lower)}–{num(r.upper)}
                      </span>
                    </span>
                  </td>
                  <td data-label="Token vs fair" className="num border-b border-rule px-3 py-3 text-right max-sm:border-0 max-sm:p-0 max-sm:text-left">
                    <Signed v={r.premiumToFairValueBps} />
                  </td>
                  <td className="border-b border-rule px-3 py-3 text-[12.5px] text-moon-2 max-sm:border-0 max-sm:p-0">{r.state === "regular" ? "Live, market open" : "Sealed for the bell"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-5 text-[12px] text-moon-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-sodium/60 bg-sodium/20" aria-hidden /> 90% band for the next open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-sodium" aria-hidden /> Fair value
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-moon-0" aria-hidden /> Token now
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 border-l border-dashed border-moon-3" aria-hidden /> Last official close
        </span>
      </div>
    </div>
  );
}
