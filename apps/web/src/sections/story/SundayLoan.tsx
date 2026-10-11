import { useEffect, useState } from "react";
import { HashChip } from "@/components/ui/HashChip";
import { Photo } from "@/components/ui/Photo";
import { SlidingNumber } from "@/components/ui/SlidingNumber";
import { ADDR } from "@/lib/links";
import { num, usd } from "@/lib/format";
import { useOnchain } from "@/lib/queries";
import { Heading } from "./Heading";
import { VenusContrast } from "./VenusContrast";

const BORROWER = "0xd8aCAE17c151Fe640EB83593F69ff44678427Ee7";

type Live = { block: bigint; debt: number; borrowPower: number; health: number; collateral: number; fair: number; lower: number; upper: number; updatedAt: number };

/** Reads the loan and the oracle straight from BNB Chain in the browser (no server in between). */
function useLiveLoan(borrower: string) {
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { client, creditAbi, oracleAbi } = await import("@/lib/chain");
        const [block, acct, coll, rep] = await Promise.all([
          client.getBlockNumber(),
          client.readContract({ address: ADDR.NightshiftCredit, abi: creditAbi, functionName: "getAccountData", args: [borrower as `0x${string}`] }),
          client.readContract({ address: ADDR.NightshiftCredit, abi: creditAbi, functionName: "collateralOf", args: [borrower as `0x${string}`, ADDR.NVDAB] }),
          client.readContract({ address: ADDR.NightshiftOracle, abi: oracleAbi, functionName: "getReport", args: [ADDR.NVDAB] }),
        ]);
        if (!alive) return;
        const a = acct as { debt: bigint; borrowPower: bigint; healthFactor: bigint };
        const r = rep as { fairValue: bigint; lower: bigint; upper: bigint; updatedAt: bigint };
        setLive({
          block,
          debt: Number(a.debt) / 1e18,
          borrowPower: Number(a.borrowPower) / 1e18,
          health: a.healthFactor > 10n ** 30n ? Infinity : Number(a.healthFactor) / 1e18,
          collateral: Number(coll as bigint) / 1e18,
          fair: Number(r.fairValue) / 1e8,
          lower: Number(r.lower) / 1e8,
          upper: Number(r.upper) / 1e8,
          updatedAt: Number(r.updatedAt) * 1000,
        });
      } catch (e) {
        if (alive) setErr((e as Error).message.split("\n")[0] ?? "read failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [borrower]);
  return { live, err };
}

function Figure({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="border-t border-rule pt-4">
      <p className="text-[13px] text-moon-2">{label}</p>
      <div className="mt-1 text-[clamp(1.45rem,2.1vw,2rem)] leading-tight text-moon-0">{value}</div>
      {sub && <p className="mt-1 text-[13px] text-moon-3">{sub}</p>}
    </div>
  );
}

export default function SundayLoan() {
  const { data: oc } = useOnchain();
  const borrower = (oc?.sundayLoan?.summary?.borrower as string | undefined) ?? BORROWER;
  const { live, err } = useLiveLoan(borrower);
  const steps = oc?.sundayLoan?.steps ?? {};
  const labels: [string, string][] = [
    ["buy", "Bought NVDAB through the Binance Trading API"],
    ["lend", "The treasury lent USDT into the vault"],
    ["collateral", "Posted the NVDAB as collateral"],
    ["borrow", "Borrowed USDT against it"],
  ];
  const borrowedOn = steps.borrow?.at ? new Date(String(steps.borrow.at)) : null;
  const weekday = borrowedOn ? borrowedOn.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" }) : "Sunday";
  const hour = borrowedOn ? Number(borrowedOn.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" })) : null;
  const clock = hour == null ? "" : `at ${hour % 12 || 12} ${hour < 12 ? "a.m." : "p.m."} `;

  return (
    <section className="grain relative isolate overflow-hidden py-[clamp(5rem,9vw,8.5rem)]" aria-labelledby="loan-title">
      <div className="absolute inset-0 -z-10">
        <Photo name="sodium-street" alt="" className="h-full w-full object-cover opacity-55" sizes="100vw" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,var(--color-night-0)_8%,rgb(10_15_30/0.88)_45%,rgb(10_15_30/0.55)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-night-0 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night-0 to-transparent" />
      </div>
      <div className="mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)] gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <Heading id="loan-title" kicker="What a lender reads" title={`Borrow against NVIDIA ${clock}on a ${weekday}.`}>
            Lenders already price NVDAB through the weekend, from the token's own trading: one number, with no view of where the stock will open. Our credit vault reads Nightshift instead and
            values collateral at the lower edge of the band for the next open, so a weekend loan is sized for the gap at the bell. This loan is real, on BNB Chain mainnet.
          </Heading>
          <ol className="mt-10 grid gap-3">
            {labels.map(([k, l]) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3 text-[15px]">
                <span className="text-moon-1">{l}</span>
                <HashChip value={(steps[k]?.tx as string | undefined) ?? null} />
              </li>
            ))}
          </ol>
        </div>
        <div className="glass rounded-[16px] bg-night-1/70 p-6 shadow-[var(--elev-2)] backdrop-blur-xl sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-medium text-moon-1">The loan, read live from BNB Chain</p>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-moon-2">
              <span className="ns-live" aria-hidden />
              {live ? (
                <>
                  block <span className="num">{live.block.toString()}</span>
                </>
              ) : err ? (
                "RPC unavailable"
              ) : (
                "reading…"
              )}
            </span>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Figure label="Debt (USDT)" value={<SlidingNumber value={live?.debt} format={(n) => num(n, 4)} />} sub="8% APR, accruing" />
            <Figure label="Collateral (NVDAB)" value={<SlidingNumber value={live?.collateral} format={(n) => num(n, 5)} />} sub="NVIDIA's bStock on BNB Chain" />
            <Figure
              label="Valued at (band's lower edge)"
              value={<SlidingNumber value={live?.lower} format={(n) => usd(n)} />}
              sub={live ? <>fair value {usd(live.fair)}, band to {usd(live.upper)}</> : "from NightshiftOracle"}
            />
            <Figure label="Health factor" value={<SlidingNumber value={live && Number.isFinite(live.health) ? live.health : null} format={(n) => num(n, 2)} />} sub="liquidation below 1.00" />
          </div>
          <p className="mt-6 text-[12.5px] text-moon-3">
            Contract <HashChip value={ADDR.NightshiftCredit} kind="address" className="ml-1" />
          </p>
          {err && (
            <p role="alert" className="mt-3 text-[13px] text-down">
              Couldn't reach a public BNB Chain RPC from your browser ({err}). The transactions above are still on BscScan.
            </p>
          )}
        </div>
        <VenusContrast className="lg:col-span-2" />
      </div>
    </section>
  );
}
