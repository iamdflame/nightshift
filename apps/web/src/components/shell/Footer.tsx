import { Link } from "react-router";
import { Mark } from "@/components/brand/Mark";
import { HashChip } from "@/components/ui/HashChip";
import { ADDR } from "@/lib/links";
import { ago } from "@/lib/format";
import { useStatus } from "@/lib/queries";

export function Footer() {
  const { data: s } = useStatus();
  return (
    <footer className="relative border-t border-rule bg-night-0">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <Mark size={30} />
            <span className="wordmark text-[1.7rem] text-moon-0">Nightshift</span>
          </div>
          <p className="mt-4 max-w-[34ch] text-[15px] text-moon-2">The price of a stock when Wall Street is asleep. Built for BNB Hack: Tokenized Stocks Edition.</p>
          {s?.latestRound && (
            <p className="mt-4 text-[13px] text-moon-3">
              Last round <span className="num text-moon-2">{s.latestRound.round}</span>, {ago(s.latestRound.ts)}. Tape lag <span className="num text-moon-2">{s.tapeLagSeconds ?? "–"} s</span>.
            </p>
          )}
        </div>
        <FooterCol
          title="Explore"
          links={[
            ["Radar of 91 stocks", "/radar"],
            ["On-chain proof", "/proof"],
            ["Scoreboard", "/scoreboard"],
            ["Verify a forecast", "/verify"],
          ]}
        />
        <FooterCol
          title="Build on it"
          links={[
            ["API (OpenAPI)", "/openapi.json", true],
            ["MCP server", "/mcp", true],
            ["Agent card (ERC-8004)", "/.well-known/agent-card.json", true],
            ["GitHub", "https://github.com/iamdflame/nightshift", true],
          ]}
        />
        <div>
          <h2 className="font-sans text-[13px] font-medium tracking-normal text-moon-2">Contracts on BNB Chain</h2>
          <div className="mt-3 grid gap-2">
            <HashChip value={ADDR.ForecastBook} kind="address" label="ForecastBook" />
            <HashChip value={ADDR.NightshiftOracle} kind="address" label="Oracle" />
            <HashChip value={ADDR.NightshiftCredit} kind="address" label="Credit" />
          </div>
        </div>
      </div>
      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-[12.5px] text-moon-3 sm:px-6">
          <span>Prices are references, not investment advice. Tokenized securities may be restricted where you live.</span>
          <Link to="/credits" className="hover:text-moon-1">
            Imagery and data credits
          </Link>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string, boolean?][] }) {
  return (
    <div>
      <h2 className="font-sans text-[13px] font-medium tracking-normal text-moon-2">{title}</h2>
      <ul className="mt-3 grid gap-2 text-[15px]">
        {links.map(([label, to, external]) => (
          <li key={to}>
            {external ? (
              <a href={to} className="text-moon-1 hover:text-moon-0" target={to.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                {label}
              </a>
            ) : (
              <Link to={to} viewTransition className="text-moon-1 hover:text-moon-0">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
