import { useEffect, useState } from "react";
import { HashChip } from "@/components/ui/HashChip";
import { BACKTEST } from "@/data/backtest";
import { ADDR, VENUS } from "@/lib/links";
import { ago, et, num, pct, usd } from "@/lib/format";

interface Answers {
  block: bigint;
  venus: { price: number; feed: `0x${string}`; feedName: string; feedUpdatedAt: number | null; supplied: number; cap: number; cf: number };
  ours: { price: number; lower: number; upper: number; updatedAt: number; anchorTime: number };
}

/**
 * Same call, two answers: `getPrice(NVDAB)` on Venus's ResilientOracle and on Nightshift's Venus adapter (the same
 * OracleInterface), plus where Venus's number comes from and how much collateral rides on it. All read from BNB
 * Chain in the browser at one block.
 */
function useAnswers() {
  const [a, setA] = useState<Answers | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { client, directClient, feedAbi, oracleAbi, venusAbi } = await import("@/lib/chain");
        const block = await client.getBlockNumber();
        const at = { blockNumber: block };
        const [vPrice, cfg, ourPrice, rep, supply, rate, cap, market] = await Promise.all([
          client.readContract({ ...at, address: VENUS.ResilientOracle, abi: venusAbi, functionName: "getPrice", args: [ADDR.NVDAB] }),
          client.readContract({ ...at, address: VENUS.ResilientOracle, abi: venusAbi, functionName: "getTokenConfig", args: [ADDR.NVDAB] }),
          client.readContract({ ...at, address: ADDR.NightshiftVenusOracle, abi: venusAbi, functionName: "getPrice", args: [ADDR.NVDAB] }),
          client.readContract({ ...at, address: ADDR.NightshiftOracle, abi: oracleAbi, functionName: "getReport", args: [ADDR.NVDAB] }),
          client.readContract({ ...at, address: VENUS.vNVDAB, abi: venusAbi, functionName: "totalSupply" }),
          client.readContract({ ...at, address: VENUS.vNVDAB, abi: venusAbi, functionName: "exchangeRateStored" }),
          client.readContract({ ...at, address: VENUS.Comptroller, abi: venusAbi, functionName: "supplyCaps", args: [VENUS.vNVDAB] }),
          client.readContract({ ...at, address: VENUS.Comptroller, abi: venusAbi, functionName: "markets", args: [VENUS.vNVDAB] }),
        ]);
        // Venus's main source for NVDAB and the feed behind it. That feed only answers callers it allows, so it is
        // read directly (not through Multicall3), and its age is a nice-to-have: the prices above stand without it.
        let feed: `0x${string}` = "0x0000000000000000000000000000000000000000";
        let feedName = "NVDAB/USD";
        let feedUpdatedAt: number | null = null;
        try {
          [, feed] = await client.readContract({ ...at, address: cfg.oracles[0], abi: venusAbi, functionName: "tokenConfigs", args: [ADDR.NVDAB] });
          const [round, name] = await Promise.all([
            directClient.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" }),
            directClient.readContract({ address: feed, abi: feedAbi, functionName: "description" }),
          ]);
          feedName = name;
          feedUpdatedAt = Number(round[3]) * 1000;
        } catch {
          // keep the prices; the feed's age is left out
        }
        if (!alive) return;
        setA({
          block,
          venus: {
            price: Number(vPrice) / 1e18,
            feed,
            feedName,
            feedUpdatedAt,
            supplied: Number((supply * rate) / 10n ** 18n) / 1e18,
            cap: Number(cap) / 1e18,
            cf: Number(market[1]) / 1e18,
          },
          ours: {
            price: Number(ourPrice) / 1e18,
            lower: Number(rep.lower) / 1e8,
            upper: Number(rep.upper) / 1e8,
            updatedAt: Number(rep.updatedAt) * 1000,
            anchorTime: Number(rep.anchorTime) * 1000,
          },
        });
      } catch (e) {
        if (alive) setErr((e as Error).message.split("\n")[0] ?? "read failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { a, err };
}

function Answer({ who, chip, price, lines }: { who: string; chip: React.ReactNode; price: number | undefined; lines: React.ReactNode[] }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-medium text-moon-1">{who}</p>
        {chip}
      </div>
      <p className="num mt-3 text-[clamp(1.8rem,3vw,2.4rem)] leading-none text-moon-0">{price != null ? usd(price) : "–"}</p>
      <ul className="mt-3 grid gap-1.5 text-[13.5px] text-moon-2">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

export function VenusContrast({ className = "" }: { className?: string }) {
  const { a, err } = useAnswers();
  const w = BACKTEST.weekendDark;
  const atLow = a ? a.venus.supplied * a.ours.lower : null;
  const atVenus = a ? a.venus.supplied * a.venus.price : null;
  return (
    <section aria-labelledby="two-answers-title" className={className}>
      <h3 id="two-answers-title" className="font-sans text-[18px] font-medium tracking-normal text-moon-0">
        Same call, two answers
      </h3>
      <p className="mt-1 text-[13.5px] text-moon-2">
        <span className="num text-moon-1">getPrice(NVDAB)</span>, asked of Venus and of Nightshift's adapter (the same Venus <span className="num">OracleInterface</span>), from your browser
        {a ? (
          <>
            {" "}
            at block <span className="num">{a.block.toString()}</span>.
          </>
        ) : (
          "."
        )}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Answer
          who="Venus Core Pool"
          chip={<HashChip value={VENUS.ResilientOracle} kind="address" label="ResilientOracle" />}
          price={a?.venus.price}
          lines={
            a
              ? [
                  <>
                    From the <span className="num">{a.venus.feedName}</span> feed of the token itself{a.venus.feedUpdatedAt ? `, updated ${ago(a.venus.feedUpdatedAt)}` : ""}.
                  </>,
                  <>
                    <span className="num text-moon-1">{num(a.venus.supplied, 0)}</span> NVDAB posted as collateral (cap <span className="num">{num(a.venus.cap, 0)}</span>), counted at{" "}
                    {pct(a.venus.cf, 0)} of this price.
                  </>,
                  "One number: what the token trades at now.",
                ]
              : [err ? `Couldn't read Venus from your browser (${err}).` : "Reading BNB Chain…"]
          }
        />
        <Answer
          who="Nightshift"
          chip={<HashChip value={ADDR.NightshiftVenusOracle} kind="address" label="Venus adapter" />}
          price={a?.ours.price}
          lines={
            a
              ? [
                  <>
                    Fair value for the open, {et(a.ours.anchorTime)}; posted {ago(a.ours.updatedAt)}.
                  </>,
                  <>
                    90% band <span className="num text-moon-1">{usd(a.ours.lower)} – {usd(a.ours.upper)}</span>.
                  </>,
                  <>
                    At the band's low edge, the NVDAB on Venus would count as <span className="num text-moon-1">{usd(atLow, 0)}</span> instead of{" "}
                    <span className="num">{usd(atVenus, 0)}</span>.
                  </>,
                ]
              : ["Reading BNB Chain…"]
          }
        />
      </div>
      <p className="mt-4 max-w-[78ch] text-[13.5px] text-moon-2">
        Why the range matters: across every fully dark weekend since bStocks launched, the token's own price called Monday's open with{" "}
        <span className="num text-moon-1">{num(w.crps_echo_bps, 1)}</span> bps of error, barely better than Friday's close at <span className="num">{num(w.crps_stale_bps, 1)}</span>. Nightshift's
        is <span className="num text-moon-1">{num(w.crps_v2_bps, 1)}</span>, and its 90% band held the open {pct(w.cov90, 1)} of the time (our out-of-sample backtest).
      </p>
    </section>
  );
}
