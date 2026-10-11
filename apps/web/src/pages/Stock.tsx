import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { nextRegularOpen, sessionAt } from "@ns/calendar";
import { FanChart } from "@/charts/FanChart";
import { Countdown } from "@/components/ui/Countdown";
import { HashChip } from "@/components/ui/HashChip";
import { SlidingNumber } from "@/components/ui/SlidingNumber";
import { useNow } from "@/hooks/useNow";
import { ADDR, FORECASTERS } from "@/lib/links";
import { bps, et, num, usd } from "@/lib/format";
import { useFairValue, useHistory, useWhich } from "@/lib/queries";

const COLOR = { anchor: "#4A8CF0", echo: "#097C60", nfv: "#D66A98" } as const;

function OracleOnChain({ token }: { token: string }) {
  const [r, setR] = useState<{ fair: number; lower: number; upper: number; updatedAt: number; round: number } | null | "none">(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { client, oracleAbi } = await import("@/lib/chain");
        const [exists, rep] = (await client.readContract({ address: ADDR.NightshiftOracle, abi: oracleAbi, functionName: "tryGetReport", args: [token as `0x${string}`] })) as unknown as [boolean, { fairValue: bigint; lower: bigint; upper: bigint; updatedAt: bigint; round: bigint }];
        if (!alive) return;
        setR(exists ? { fair: Number(rep.fairValue) / 1e8, lower: Number(rep.lower) / 1e8, upper: Number(rep.upper) / 1e8, updatedAt: Number(rep.updatedAt) * 1000, round: Number(rep.round) } : "none");
      } catch {
        if (alive) setR("none");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);
  return (
    <div className="card p-5">
      <p className="text-[14px] font-medium text-moon-1">On BNB Chain right now</p>
      <p className="mt-1 text-[13px] text-moon-3">NightshiftOracle.getReport, read by your browser</p>
      {r === null ? (
        <div className="mt-4 h-16 animate-pulse rounded bg-night-1" />
      ) : r === "none" ? (
        <p className="mt-4 text-[14px] text-moon-2">No report for this token on-chain yet. Tokens no contract reads post when the price moves 25 bps or every 6 hours.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[12.5px] text-moon-3">Fair value</p>
            <p className="num text-[1.4rem] text-moon-0">{usd(r.fair)}</p>
          </div>
          <div>
            <p className="text-[12.5px] text-moon-3">90% band</p>
            <p className="num text-[15px] text-moon-1">
              {usd(r.lower)} – {usd(r.upper)}
            </p>
          </div>
          <p className="col-span-2 text-[12.5px] text-moon-3">
            Round <span className="num">{r.round}</span>, posted {et(r.updatedAt)}
          </p>
        </div>
      )}
      <div className="mt-4">
        <HashChip value={ADDR.NightshiftOracle} kind="address" label="Oracle" />
      </div>
    </div>
  );
}

export default function Stock() {
  const { symbol = "NVDAB" } = useParams();
  const sym = symbol.toUpperCase();
  const now = useNow();
  const { data: fv, isError } = useFairValue(sym);
  const { data: h } = useHistory(sym, 96);
  const ticker = fv?.consensus.ticker;
  const { data: which } = useWhich(ticker ?? "");
  const c = fv?.consensus;
  const open = sessionAt(now) === "regular";
  const bell = nextRegularOpen(now);
  const ledger = useMemo(() => {
    if (!h) return [];
    const byRound = new Map<number, { t: number; anchor?: number; echo?: number; nfv?: number; tx?: string | null; chain?: string }>();
    for (const x of h.commits) {
      const r = byRound.get(x.round) ?? { t: x.t };
      r[x.forecaster] = x.fairValue;
      if (x.forecaster === "nfv") {
        r.tx = x.tx;
        r.chain = x.chain;
      }
      byRound.set(x.round, r);
    }
    const cons = new Map(h.points.map((p) => [p.round, p]));
    return [...byRound.entries()].sort((a, b) => b[0] - a[0]).map(([round, r]) => ({ round, ...r, cons: cons.get(round) }));
  }, [h]);
  const [showAll, setShowAll] = useState(false);

  if (isError)
    return (
      <div className="mx-auto max-w-[900px] px-4 pb-24 pt-32 text-center sm:px-6">
        <title>Not found · Nightshift</title>
        <h1 className="text-[clamp(2.2rem,4vw,3.4rem)] font-[300]">No stock called {sym} here.</h1>
        <p className="mt-3 text-moon-2">Nightshift prices the 91 bStocks on BNB Chain.</p>
        <Link to="/radar" className="pressable mt-8 inline-flex rounded-md bg-sodium px-5 py-2.5 font-medium text-night-0">
          Open the radar
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-24 sm:px-6">
      <title>{`${sym} · Nightshift`}</title>
      <Link to="/radar" viewTransition className="inline-flex items-center gap-1.5 text-[13.5px] text-moon-2 hover:text-moon-0">
        <ArrowLeft size={14} strokeWidth={1.5} /> Radar
      </Link>
      <header className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-[14px] text-moon-2">
            <span className="num text-moon-0">{sym}</span>
            {ticker && <>, the bStock for {ticker} on BNB Chain</>}
          </p>
          <p className="mt-3 text-[13px] text-moon-3">{open ? "Live fair value (market open)" : `Fair value for the open, ${et(bell)}`}</p>
          <div className="mt-1 text-[clamp(3rem,7vw,5.6rem)] font-[300] leading-none text-moon-0">
            <SlidingNumber value={c?.fairValue} format={(n) => usd(n)} />
          </div>
          <p className="mt-3 text-[15px] text-moon-2">
            90% band <span className="num text-moon-1">{c ? `${usd(c.lower)} – ${usd(c.upper)}` : "–"}</span>
            {c && <span className="ml-2 text-moon-3">({num(c.bandBps, 0)} bps wide)</span>}
          </p>
        </div>
        <div className="grid gap-3">
          {!open && (
            <p className="text-[14px] text-moon-2 lg:text-right">
              Bell in <Countdown to={bell} className="text-sodium" />
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(fv?.forecasters ?? []).map((f) => (
              <div key={f.forecaster} className="card px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12.5px] text-moon-2">
                  <span className="size-2 rounded-full" style={{ background: COLOR[f.forecaster] }} />
                  {FORECASTERS[f.forecaster].name}
                </p>
                <p className="num mt-0.5 text-[15px] text-moon-0">{usd(f.fair_value)}</p>
                <p className="num text-[11px] text-moon-3">weight {c ? num(c.weights[f.forecaster], 2) : "–"}</p>
              </div>
            ))}
          </div>
          <p className="max-w-[46ch] text-[11.5px] text-moon-3 lg:justify-self-end lg:text-right">
            Weights ∝ exp(−(CRPS − best CRPS) / 3 bps), from each forecaster's backtest CRPS in this information state until it has 200 live scores there.
          </p>
        </div>
      </header>

      <div className="mt-10">{h ? <FanChart h={h} /> : <div className="card h-[420px] animate-pulse" />}</div>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="ledger-title" className="card p-5">
          <h2 id="ledger-title" className="font-sans text-[18px] font-medium tracking-normal">
            Forecast ledger
          </h2>
          <p className="mt-1 text-[13.5px] text-moon-3">Every round sealed for this bell, newest first, like an ephemeris.</p>
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Forecast ledger, scrolls sideways">
            <table className="w-full whitespace-nowrap text-[13px]">
              <thead className="text-moon-2">
                <tr className="border-b border-rule">
                  <th className="py-2 pr-3 text-left font-medium">Sealed (ET)</th>
                  <th className="py-2 pr-3 text-right font-medium">To the bell</th>
                  <th className="py-2 pr-3 text-right font-medium">Consensus</th>
                  <th className="py-2 pr-3 text-right font-medium">NFV</th>
                  <th className="py-2 pr-3 text-right font-medium">Echo</th>
                  <th className="py-2 pr-3 text-right font-medium">Anchor</th>
                  <th className="py-2 text-left font-medium">On BNB Chain</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? ledger : ledger.slice(0, 14)).map((r) => (
                  <tr key={r.round} className="border-b border-rule">
                    <td className="py-2 pr-3 text-moon-1">{et(r.t)}</td>
                    <td className="num py-2 pr-3 text-right text-moon-3">{h ? `${((h.nextAnchor - r.t) / 3600_000).toFixed(1)} h` : ""}</td>
                    <td className="num py-2 pr-3 text-right text-moon-0">{r.cons ? usd(r.cons.fairValue) : "–"}</td>
                    <td className="num py-2 pr-3 text-right text-moon-1">{usd(r.nfv)}</td>
                    <td className="num py-2 pr-3 text-right text-moon-2">{usd(r.echo)}</td>
                    <td className="num py-2 pr-3 text-right text-moon-2">{usd(r.anchor)}</td>
                    <td className="py-1.5">{r.chain === "committed" ? <HashChip value={r.tx} /> : <span className="text-[12px] text-moon-3">{r.chain === "missed" ? "not published" : "pending"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ledger.length > 14 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-[13px] text-moon-2 hover:text-moon-0">
              {showAll ? "Show fewer" : `Show all ${ledger.length} rounds`}
            </button>
          )}
        </section>
        <div className="grid h-fit gap-8">
          <OracleOnChain token={c?.token ?? ADDR.NVDAB} />
          {which && which.tokens.length > 1 && (
            <section aria-labelledby="which-title" className="card p-5">
              <h2 id="which-title" className="font-sans text-[18px] font-medium tracking-normal">
                Which {which.ticker}?
              </h2>
              <p className="mt-1 text-[13.5px] text-moon-3">
                The same company from different issuers, per real share
                {which.fairValuePerShare != null && (
                  <>
                    , against Nightshift's fair value per real share (<span className="num">{usd(which.fairValuePerShare)}</span>: the fair value above divided by the token's share ratio)
                  </>
                )}
                .
              </p>
              <ul className="mt-4 grid gap-2">
                {which.tokens
                  .filter((t) => t.pricePerShare != null)
                  .map((t) => (
                    <li key={`${t.symbol}-${t.chainId}`} className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 ${which.answer?.symbol === t.symbol ? "bg-night-1 ring-1 ring-sodium/40" : "bg-night-1/60"}`}>
                      <span>
                        <span className="num text-[14px] text-moon-0">{t.symbol}</span>
                        <span className="ml-2 text-[12px] text-moon-3">{t.issuer}</span>
                      </span>
                      <span className="text-right">
                        <span className="num block text-[14px] text-moon-1">{usd(t.pricePerShare)}</span>
                        <span className="num block text-[11.5px] text-moon-3">{bps(t.vsFairValueBps)} vs fair</span>
                      </span>
                    </li>
                  ))}
              </ul>
              {which.answer && <p className="mt-3 text-[13px] text-moon-2">Cheapest real share with liquidity: {which.answer.symbol}.</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
