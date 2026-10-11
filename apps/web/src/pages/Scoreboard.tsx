import { useMemo, useRef } from "react";
import { HashChip } from "@/components/ui/HashChip";
import { BACKTEST } from "@/data/backtest";
import { FORECASTERS, type Forecaster } from "@/lib/links";
import { num, pct } from "@/lib/format";
import { useOnchain, useOpens, useResults, useScoreboard } from "@/lib/queries";

const COLOR: Record<Forecaster, string> = { anchor: "#4A8CF0", echo: "#097C60", nfv: "#D66A98" };

/** A forecaster "instrument": its real live scores, its identity and a spotlight that follows the pointer. */
function Instrument({ f, crps, mae, cov, n, opens, best }: { f: Forecaster; crps?: number; mae?: number; cov?: number; n?: number; opens?: number; best: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  const info = FORECASTERS[f];
  return (
    <div ref={ref} onPointerMove={move} className="ns-spot card relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-medium text-moon-0">
            <span className="size-2.5 rounded-full" style={{ background: COLOR[f] }} />
            {info.name}
          </p>
          <p className="mt-1 text-[13px] text-moon-3">{info.blurb}</p>
        </div>
        {best && <span className="whitespace-nowrap rounded-md bg-sodium px-2 py-0.5 text-[12px] font-medium text-night-0">Lowest error</span>}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-[12.5px] text-moon-3">CRPS (live)</dt>
          <dd className="num text-[1.7rem] leading-tight text-moon-0">{crps != null ? num(crps, 1) : "–"}</dd>
          <dd className="text-[11.5px] text-moon-3">bps, lower is better</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-moon-3">Average miss</dt>
          <dd className="num text-[1.7rem] leading-tight text-moon-1">{mae != null ? num(mae, 1) : "–"}</dd>
          <dd className="text-[11.5px] text-moon-3">bps from the official open</dd>
        </div>
      </dl>
      <div className="mt-5">
        <div className="flex justify-between text-[12.5px] text-moon-2">
          <span>90% band coverage</span>
          <span className="num text-moon-1">{cov != null ? pct(cov) : "–"}</span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-night-1">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (cov ?? 0) * 100)}%`, background: COLOR[f] }} />
          <span className="absolute -top-1 bottom-[-4px] w-0.5 bg-moon-0" style={{ left: "90%" }} title="90% target" />
        </div>
        <p className="mt-1.5 text-[11.5px] text-moon-3">The white tick is the 90% target: a calibrated band covers it.</p>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4 text-[12.5px] text-moon-3">
        <span>
          ERC-8004 agent <span className="num text-moon-1">#{info.agentId}</span>, {n?.toLocaleString("en-US") ?? "–"} forecasts over {opens ?? "–"} opens
        </span>
        <HashChip value={info.address} kind="address" />
      </div>
    </div>
  );
}

export default function Scoreboard() {
  const { data: sb } = useScoreboard();
  const { data: res } = useResults();
  const { data: opens } = useOpens("nfv");
  const { data: oc } = useOnchain();
  const rows = useMemo(() => {
    const all = sb?.scoreboard.filter((r) => r.state === "all") ?? [];
    const pick = all.length ? all : (sb?.scoreboard.filter((r) => r.state === "live") ?? []);
    return Object.fromEntries(pick.map((r) => [r.forecaster, r]));
  }, [sb]);
  const best = useMemo(() => Object.values(rows).sort((a, b) => a.crps_bps - b.crps_bps)[0]?.forecaster, [rows]);
  const byOpen = useMemo(() => {
    const m = new Map<string, Record<string, { crps: number; cov: number; n: number }>>();
    for (const r of res?.results ?? []) m.set(r.open, { ...(m.get(r.open) ?? {}), [r.forecaster]: { crps: r.crpsBps, cov: r.coverage, n: r.n } });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [res]);
  const lastOpen = useMemo(() => {
    const os = opens?.opens ?? [];
    const latest = Math.max(...os.map((o) => o.anchorTime));
    return os.filter((o) => o.anchorTime === latest).sort((a, b) => a.errBps - b.errBps);
  }, [opens]);

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-28 sm:px-6">
      <title>Scoreboard · Nightshift</title>
      <header className="max-w-[52rem]">
        <p className="text-[14px] font-medium text-sodium/90">Scoreboard</p>
        <h1 className="mt-3 text-[clamp(2.6rem,5vw,4.4rem)] font-[300]">The open grades every forecaster.</h1>
        <p className="mt-4 max-w-[62ch] text-[17px] text-moon-2">
          Each forecast is scored against the official US open with CRPS, a standard score for probabilistic forecasts: it rewards being right and being honest about uncertainty. Anchor is today's oracle, the last close,
          kept in so everyone can see what beating it means.
        </p>
      </header>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {(["nfv", "echo", "anchor"] as Forecaster[]).map((f) => (
          <Instrument key={f} f={f} crps={rows[f]?.crps_bps} mae={rows[f]?.mae_bps} cov={rows[f]?.coverage} n={rows[f]?.n} opens={rows[f]?.anchors} best={best === f} />
        ))}
      </div>
      <p className="mt-4 text-[13px] text-moon-3">
        {oc && oc.jobs.length === 0
          ? "Payment: ERC-8183 jobs pay a forecaster only when it beats the anchor on an open. The first jobs open once the escrow is funded; nothing has been paid yet."
          : `${oc?.jobs.length ?? 0} ERC-8183 jobs on-chain.`}
      </p>

      <section className="mt-16" aria-labelledby="opens-title">
        <h2 id="opens-title" className="text-[clamp(1.8rem,3vw,2.6rem)] font-[300]">
          Open by open
        </h2>
        <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Scores by open, scrolls sideways">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead className="text-[12.5px] text-moon-2">
              <tr className="border-b border-rule">
                <th scope="col" className="py-2.5 text-left font-medium">
                  Official open
                </th>
                {(["nfv", "echo", "anchor"] as Forecaster[]).map((f) => (
                  <th key={f} scope="col" className="py-2.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: COLOR[f] }} />
                      {FORECASTERS[f].name} CRPS
                    </span>
                  </th>
                ))}
                <th scope="col" className="py-2.5 text-right font-medium">
                  NFV vs anchor
                </th>
              </tr>
            </thead>
            <tbody>
              {byOpen.map(([open, r]) => (
                <tr key={open} className="border-b border-rule">
                  <td className="py-3 text-moon-1">{new Date(open).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}, 09:30 ET</td>
                  {(["nfv", "echo", "anchor"] as Forecaster[]).map((f) => (
                    <td key={f} className="num py-3 text-right text-moon-1">
                      {r[f] ? num(r[f]!.crps, 1) : "–"}
                    </td>
                  ))}
                  <td className="num py-3 text-right text-sodium">{r.nfv && r.anchor ? `${((r.nfv.crps / r.anchor.crps - 1) * 100).toFixed(0)}%` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {lastOpen.length > 0 && (
        <section className="mt-16" aria-labelledby="bell-title">
          <h2 id="bell-title" className="text-[clamp(1.8rem,3vw,2.6rem)] font-[300]">
            At the last bell, stock by stock
          </h2>
          <p className="mt-2 max-w-[62ch] text-moon-2">
            NFV's last forecast before the {new Date(lastOpen[0]!.anchorTime).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" })} open against where each stock actually opened.{" "}
            {lastOpen.filter((o) => o.covered).length} of {lastOpen.length} opened inside the 90% band.
          </p>
          <div className="mt-6 flex flex-wrap gap-1.5" role="list">
            {lastOpen.map((o) => (
              <span
                key={o.symbol}
                role="listitem"
                title={`${o.symbol}: forecast ${o.fairValue}, opened ${o.realized} (${num(o.errBps, 1)} bps)`}
                className={`num rounded px-2 py-1 text-[11.5px] ${o.covered ? "bg-night-2 text-moon-1" : "bg-down/15 text-down"}`}
              >
                {o.symbol} {num(o.errBps, 0)}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-moon-3">Each chip: absolute miss in bps. Red chips opened outside the band.</p>
        </section>
      )}

      <section className="mt-16" aria-labelledby="bt-title">
        <h2 id="bt-title" className="text-[clamp(1.8rem,3vw,2.6rem)] font-[300]">
          The backtest behind it
        </h2>
        <p className="mt-2 max-w-[62ch] text-moon-2">Strict leave-one-gap-out over every gap since bStocks listed: {BACKTEST.all.n.toLocaleString("en-US")} forecasts. CRPS in bps, lower is better.</p>
        <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Backtest by horizon, scrolls sideways">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead className="text-[12.5px] text-moon-2">
              <tr className="border-b border-rule">
                <th scope="col" className="py-2.5 text-left font-medium">
                  When the forecast is made
                </th>
                <th scope="col" className="py-2.5 text-right font-medium">
                  Stale oracle
                </th>
                <th scope="col" className="py-2.5 text-right font-medium">
                  On-chain echo
                </th>
                <th scope="col" className="py-2.5 text-right font-medium">
                  Nightshift NFV
                </th>
                <th scope="col" className="py-2.5 text-right font-medium">
                  Band coverage
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["All gaps", BACKTEST.all],
                  ["Weekend, fully dark", BACKTEST.weekendDark],
                  ["Holiday, fully dark", BACKTEST.holidayDark],
                  ["Sunday-night restart", BACKTEST.weekendRestart],
                  ["Weekday overnight", BACKTEST.overnight],
                ] as const
              ).map(([label, r]) => (
                <tr key={label} className="border-b border-rule">
                  <td className="py-3 text-moon-1">{label}</td>
                  <td className="num py-3 text-right text-moon-2">{num(r.crps_stale_bps, 1)}</td>
                  <td className="num py-3 text-right text-moon-2">{num(r.crps_echo_bps, 1)}</td>
                  <td className="num py-3 text-right text-moon-0">{num(r.crps_v2_bps, 1)}</td>
                  <td className="num py-3 text-right text-moon-2">{pct(r.cov90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
