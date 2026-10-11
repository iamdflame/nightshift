import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { HashChip } from "@/components/ui/HashChip";
import type { Stack as StackData } from "@/lib/api";
import { ago, et, num } from "@/lib/format";
import { ADDR } from "@/lib/links";
import { useOnchain, useStack } from "@/lib/queries";

const SITE = "https://nightshift-oracle.vercel.app";
const NVDAB_FEED = "0x0098192690f14749Ec81f636dc0a01f4893463E2";

/** What each Binance Web3 API module does for Nightshift, and the use nobody would expect. Telemetry decides "live". */
const MODULES: { key: string; name: string; use: string; unexpected: string; refused?: string }[] = [
  {
    key: "rwa",
    name: "RWA Data",
    use: "Token prices for every bStock, and each stock's underlying market: session status, reference price, share ratio.",
    unexpected: "Sizes the sell side of the quote ladder. The oracle itself prices from Binance spot books and BSC pools.",
    refused:
      "Binance doesn't serve these endpoints to our production server (Railway, EU West): it answers 40304, compliance restriction. The same keys work from our development machine, which made the successful calls counted here. We don't route around it: the poller asks again every 30 minutes, and the oracle prices from Binance spot books and BSC pools.",
  },
  {
    key: "trading",
    name: "Trading",
    use: "Quotes, approvals and swaps through the aggregator (and RFQ for Ondo).",
    unexpected: "A $100 / $1k / $10k quote ladder on every token around the clock: a probe of the price you can actually execute at 3 a.m., and how deep the book is. RFQ refusals tell us when an issuer's market is closed.",
    refused:
      "A $100 / $1k / $10k quote ladder on every token, every 10 minutes: a probe of the price you can actually execute at 3 a.m. Binance refuses tokenized-stock quotes to our production server too (40304); the successful quotes and our real swaps counted here ran from our development machine.",
  },
  {
    key: "transaction",
    name: "Transaction",
    use: "Broadcasts our signed swaps with MEV protection.",
    unexpected: "Every broadcast becomes a receipt: price per real share paid versus Nightshift's fair value at that block.",
  },
  {
    key: "b402",
    name: "b402 payments",
    use: "Pay-per-query fair value for other agents, settled by the B402 facilitator.",
    unexpected: "An Agentic Wallet pays an oracle a cent per answer, which pays for the oracle's own gas.",
  },
  { key: "market", name: "Market", use: "Candles, pools and trades: typed and tested in our SDK.", unexpected: "Not called by the running engine: it reads candles and books from Binance spot and pools from DexScreener." },
  { key: "wallet", name: "Wallet", use: "Balances and token holdings: typed and tested in our SDK.", unexpected: "Not called by the running engine; receipts read balances from the chain instead." },
  { key: "defi", name: "DeFi", use: "Protocol positions: typed and tested in our SDK.", unexpected: "Not called by the running engine." },
];

function Status({ calls24h, callsAll, refusedWith }: { calls24h: number; callsAll: number; refusedWith: string | null }) {
  const [label, cls] = refusedWith
    ? [`Refused to our server (${refusedWith})`, "bg-down/15 text-down"]
    : calls24h > 0
      ? ["Called in the last 24 h", "bg-up/15 text-up"]
      : callsAll > 0
        ? ["Called before", "bg-night-3 text-moon-1"]
        : ["Covered by our SDK", "bg-night-3 text-moon-2"];
  return <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium ${cls}`}>{label}</span>;
}

function CopyBlock({ code, label }: { code: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative min-w-0">
      <pre className="overflow-x-auto rounded-[10px] bg-night-0 p-4 pr-12 text-[12.5px] leading-relaxed text-moon-1 hairline" tabIndex={0} aria-label={label}>
        <code className="mono">{code}</code>
      </pre>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => navigator.clipboard?.writeText(code).then(() => (setDone(true), setTimeout(() => setDone(false), 1400)))}
        className="pressable absolute right-2 top-2 rounded-md p-2 text-moon-2 hover:bg-night-2 hover:text-moon-0"
      >
        {done ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.75} />}
      </button>
    </div>
  );
}

/** latestRoundData() on Nightshift's NVDAB feed, read from your browser. */
function LiveFeed() {
  const [r, setR] = useState<{ answer: number; updatedAt: number; description: string } | "error" | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { client, feedAbi } = await import("@/lib/chain");
        const [round, description] = await Promise.all([
          client.readContract({ address: NVDAB_FEED, abi: feedAbi, functionName: "latestRoundData" }),
          client.readContract({ address: NVDAB_FEED, abi: feedAbi, functionName: "description" }),
        ]);
        if (alive) setR({ answer: Number(round[1]) / 1e8, updatedAt: Number(round[3]) * 1000, description });
      } catch {
        if (alive) setR("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <p className="mt-2 text-[13px] text-moon-2">
      {r === null ? "Reading BNB Chain…" : r === "error" ? "Couldn't reach a public BNB Chain RPC from your browser." : (
        <>
          Live from your browser: <span className="num text-moon-0">{r.description}</span> answer <span className="num text-moon-0">{num(r.answer, 2)}</span> (8 decimals), updated {ago(r.updatedAt)}.
        </>
      )}
    </p>
  );
}

function FairValueSample() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    fetch("/v1/fair-value/NVDAB", { headers: { accept: "application/json" } })
      .then((res) => res.json())
      .then((j: { consensus: { fairValue: number; lower: number; upper: number; anchorTime: string; state: string } }) =>
        setText(JSON.stringify({ fairValue: j.consensus.fairValue, lower: j.consensus.lower, upper: j.consensus.upper, anchorTime: j.consensus.anchorTime, state: j.consensus.state }, null, 2)),
      )
      .catch(() => setText(null));
  }, []);
  return text ? <CopyBlock code={text} label="Live response excerpt" /> : null;
}

function ModuleCard({ m, data }: { m: (typeof MODULES)[number]; data: StackData["modules"][number] | undefined }) {
  const calls24h = data?.calls24h ?? 0;
  const callsAll = data?.callsAll ?? 0;
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-sans text-[17px] font-medium tracking-normal text-moon-0">{m.name}</h3>
        <Status calls24h={calls24h} callsAll={callsAll} refusedWith={data?.refusedWith ?? null} />
      </div>
      <p className="mt-2 text-[14px] text-moon-1">{m.use}</p>
      <p className="mt-2 text-[13.5px] text-moon-2">{data?.refusedWith && m.refused ? m.refused : m.unexpected}</p>
      {data && data.endpoints.length > 0 ? (
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={`${m.name} endpoints, scrolls sideways`}>
          <table className="w-full min-w-[520px] whitespace-nowrap text-[12.5px]">
            <thead className="text-moon-3">
              <tr className="border-b border-rule">
                <th className="py-1.5 pr-3 text-left font-medium">Endpoint</th>
                <th className="py-1.5 pr-3 text-right font-medium">24 h</th>
                <th className="py-1.5 pr-3 text-right font-medium">All</th>
                <th className="py-1.5 pr-3 text-right font-medium">p50 / p95</th>
                <th className="py-1.5 text-left font-medium">Outcomes</th>
              </tr>
            </thead>
            <tbody>
              {data.endpoints.map((e) => (
                <tr key={`${e.method} ${e.endpoint}`} className="border-b border-rule">
                  <td className="num py-1.5 pr-3 text-moon-1">
                    {e.method} {e.endpoint.replace("/api/v1/dex/", "…/").replace("/api/v2/", "…/")}
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-moon-0">{e.calls24h.toLocaleString("en-US")}</td>
                  <td className="num py-1.5 pr-3 text-right text-moon-2">{e.callsAll.toLocaleString("en-US")}</td>
                  <td className="num py-1.5 pr-3 text-right text-moon-2">{e.p50Ms != null ? `${e.p50Ms} / ${e.p95Ms} ms` : "–"}</td>
                  <td className="num py-1.5 text-moon-2">
                    {Object.entries(e.codes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([c, n]) => `${c} ×${n.toLocaleString("en-US")}`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        data && <p className="mt-4 text-[12.5px] text-moon-3">{data.sdkEndpoints.length} endpoints typed in our SDK; no calls from the running engine.</p>
      )}
    </article>
  );
}

export default function Stack() {
  const { data: s, isError } = useStack();
  const { data: oc } = useOnchain();
  const trade = oc?.agenticWalletTrades[0];
  const byKey = new Map(s?.modules.map((m) => [m.module, m]));
  const live = MODULES.filter((m) => (byKey.get(m.key)?.callsAll ?? 0) > 0).length;
  const calledEndpoints = s?.modules.reduce((n, m) => n + m.endpoints.filter((e) => e.callsAll > 0).length, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-28 sm:px-6">
      <title>Built on Binance Web3 · Nightshift</title>
      <header className="max-w-[56rem]">
        <p className="text-[14px] font-medium text-sodium/90">Built on Binance Web3</p>
        <h1 className="mt-3 text-[clamp(2.4rem,5vw,4.2rem)] font-[300]">Every Binance Web3 API call we make, and every answer.</h1>
        <p className="mt-4 max-w-[64ch] text-[17px] text-moon-2">
          {s ? (
            <>
              <span className="num text-moon-0">{s.calls24h.toLocaleString("en-US")}</span> calls in the last 24 hours,{" "}
              <span className="num text-moon-0">{s.totalCalls.toLocaleString("en-US")}</span> since {s.since ? et(s.since) : "–"} (our development machine first, then production), logged by our own SDK as they
              happen. It types all {s.sdk.endpoints} endpoints of the {s.sdk.modules} modules; the running oracle calls {calledEndpoints} endpoints in {live} modules, marked below with their real traffic. Its prices
              come from Binance spot books and BSC pools; the API gives it executable quotes, broadcasts and payments.
            </>
          ) : isError ? (
            "The live telemetry couldn't load."
          ) : (
            "Loading the live telemetry…"
          )}
        </p>
      </header>

      <section className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Binance Web3 API modules">
        {MODULES.map((m) => (
          <ModuleCard key={m.key} m={m} data={byKey.get(m.key)} />
        ))}
        <article className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-sans text-[17px] font-medium tracking-normal text-moon-0">Agentic Wallet and Wallet Skills</h3>
            <span className="rounded-md bg-up/15 px-2 py-0.5 text-[12px] font-medium text-up">On mainnet</span>
          </div>
          <p className="mt-2 text-[14px] text-moon-1">Our Wallet Skill answers "which NVIDIA?" per real share, checks the price against Nightshift's band, then trades with baw.</p>
          {trade && (
            <p className="mt-2 text-[13.5px] text-moon-2">
              Real buy: {trade.receipt.amountUsd} {trade.receipt.payToken.symbol} of {trade.receipt.token.symbol}, {trade.receipt.tca.verdict}. <HashChip value={trade.txHash} className="ml-1" />
            </p>
          )}
        </article>
        <article className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-sans text-[17px] font-medium tracking-normal text-moon-0">BNB Agent Studio</h3>
            <span className="rounded-md bg-up/15 px-2 py-0.5 text-[12px] font-medium text-up">On mainnet</span>
          </div>
          <p className="mt-2 text-[14px] text-moon-1">
            Five ERC-8004 identities ({oc ? oc.agents.map((a) => `#${a.agentId}`).join(", ") : "…"}), one registration card at{" "}
            <a className="underline underline-offset-4 hover:text-moon-0" href="/.well-known/agent-card.json">
              /.well-known/agent-card.json
            </a>
            , and ERC-8183 jobs on BNB's commerce contracts that pay a forecaster only when the open proves it right.
          </p>
          <p className="mt-2 text-[13.5px] text-moon-2">{oc && oc.jobs.length > 0 ? `${oc.jobs.length} jobs on-chain; see the proof log.` : "Jobs open once the escrow holds U; until then scores are published, not paid."}</p>
        </article>
      </section>

      {s && s.codes.length > 0 && (
        <section className="mt-16" aria-labelledby="codes-title">
          <h2 id="codes-title" className="text-[clamp(1.8rem,3vw,2.6rem)] font-[300]">
            Every answer the API gave us, and what we do with it
          </h2>
          <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Outcome codes, scrolls sideways">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead className="text-[12.5px] text-moon-2">
                <tr className="border-b border-rule">
                  <th className="py-2.5 pr-4 text-left font-medium">Code</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Times</th>
                  <th className="py-2.5 pr-4 text-left font-medium">What it meant</th>
                  <th className="py-2.5 text-left font-medium">What we do</th>
                </tr>
              </thead>
              <tbody>
                {s.codes.map((c) => (
                  <tr key={c.code} className="border-b border-rule align-top">
                    <td className="num py-3 pr-4 text-moon-0">{c.code}</td>
                    <td className="num py-3 pr-4 text-right text-moon-1">{c.count.toLocaleString("en-US")}</td>
                    <td className="py-3 pr-4 text-moon-1">{c.meaning}</td>
                    <td className="py-3 text-moon-2">{c.ourHandling}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-16" aria-labelledby="use-title">
        <h2 id="use-title" className="text-[clamp(1.8rem,3vw,2.6rem)] font-[300]">
          Use it
        </h2>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h3 className="font-sans text-[16px] font-medium tracking-normal text-moon-0">In a contract (Chainlink-compatible)</h3>
            <p className="mt-1 text-[13.5px] text-moon-2">
              NVDAB's feed returns Nightshift's fair value for the next open, 8 decimals. Feeds for all six live tokens are on the <Link className="underline underline-offset-4 hover:text-moon-0" to="/proof">proof page</Link>.
            </p>
            <div className="mt-3">
              <CopyBlock
                label="Solidity"
                code={`AggregatorV3Interface feed = AggregatorV3Interface(${NVDAB_FEED});
(, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
// answer = fair value (USD, 8 decimals); band: NightshiftOracle.getReport(${ADDR.NVDAB.slice(0, 10)}…)`}
              />
            </div>
            <LiveFeed />
            <dl className="mt-4 grid gap-2 text-[13px]">
              {[
                ["answer", "Fair value for the next open, USD, 8 decimals. updatedAt is when the report was posted."],
                ["band()", "lower and upper (5th and 95th percentile at the open), anchorTime, session, and flags: corporate action, reference stale, thin liquidity, degraded."],
                ["Updates", "Tokens a contract reads post every 30 minutes; the rest on a 25 bps move, a 20% band change or a 6-hour heartbeat."],
                ["Staleness", "The feed returns the last report and never reverts on age, so check updatedAt. The Venus adapter reverts past 1 hour or on a corporate-action flag, so Venus falls back to its pivot. Our credit vault refuses stale, flagged or wider-than-15% reports for new borrows."],
                ["Who signs", "One allowlisted reporter, the Scorer's key (0x6890…f19e), which is also the owner. The consensus is computed off-chain from the sealed forecasts; anyone can check a forecast against its root, not yet the consensus itself."],
                ["Suggested use", "A weekend haircut, pivot or bound next to a lender's main feed, not the only source."],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-x-3 sm:grid-cols-[7.5rem_1fr]">
                  <dt className="num text-moon-1">{k}</dt>
                  <dd className="text-moon-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="font-sans text-[16px] font-medium tracking-normal text-moon-0">Over HTTP, no key</h3>
            <p className="mt-1 text-[13.5px] text-moon-2">Fair value and 90% band for the next open, for any of the 91 bStocks.</p>
            <div className="mt-3 grid gap-2">
              <CopyBlock label="curl" code={`curl ${SITE}/v1/fair-value/NVDAB`} />
              <FairValueSample />
            </div>
          </div>
          <div>
            <h3 className="font-sans text-[16px] font-medium tracking-normal text-moon-0">From Claude Code or any MCP client</h3>
            <p className="mt-1 text-[13.5px] text-moon-2">Tools: fair_value, which, radar, scoreboard, verify_forecast.</p>
            <div className="mt-3">
              <CopyBlock label="MCP" code={`claude mcp add --transport http nightshift ${SITE}/mcp`} />
            </div>
          </div>
          <div>
            <h3 className="font-sans text-[16px] font-medium tracking-normal text-moon-0">With the Binance Agentic Wallet</h3>
            <p className="mt-1 text-[13.5px] text-moon-2">Add our skill next to the Agentic Wallet skill, then ask in plain words.</p>
            <div className="mt-3 grid gap-2">
              <CopyBlock label="Skill" code={`git clone https://github.com/iamdflame/nightshift
cp -r nightshift/skills/nightshift ~/.claude/skills/
export NIGHTSHIFT_URL=${SITE}`} />
              <CopyBlock label="Prompt" code={`Buy $5 of NVIDIA with my Agentic Wallet, only inside Nightshift's band.`} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
