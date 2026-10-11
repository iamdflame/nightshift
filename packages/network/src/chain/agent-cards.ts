/**
 * The agent cards of the Night Shift's ERC-8004 identities: what each agent does, in one place, with no
 * side effects (no env loading, no wallets) so the API and the web app can import it.
 */
import type { Role } from "./wallets.ts";

export interface AgentCard {
  name: string;
  description: string;
  capabilities: string[];
}

export const AGENT_CARDS: Record<Role, AgentCard> = {
  treasury: {
    name: "Nightshift Scorer",
    description:
      "Runs the Night Shift: funds ERC-8183 forecasting jobs, scores every committed forecast against the official US market open with CRPS, disputes inaccurate work with a published score report, and posts the consensus fair value to the NightshiftOracle on BNB Chain.",
    capabilities: ["scoring", "oracle-publisher", "erc8183-client"],
  },
  anchor: {
    name: "Nightshift Forecaster: Anchor",
    description: "Baseline forecaster: the oracle that exists today — last official close, with a historical-volatility band for the next open. Kept in the network so every other forecaster is measured against it.",
    capabilities: ["forecast", "tokenized-stocks", "baseline"],
  },
  echo: {
    name: "Nightshift Forecaster: Echo",
    description: "Echoes the live 24/7 on-chain price of each tokenized stock as its forecast of the next US open, with a band scaled to its historical error.",
    capabilities: ["forecast", "tokenized-stocks"],
  },
  nfv: {
    name: "Nightshift Forecaster: NFV",
    description:
      "Nightshift Fair Value v2: prices tokenized stocks while the US market is closed using information-provenance weights (post-market, dark, restart segments) and split-conformal 90% bands. Commits every forecast to ForecastBook before the open.",
    capabilities: ["forecast", "tokenized-stocks", "dark-hours", "conformal-bands"],
  },
  executor: {
    name: "Nightshift Trade",
    description: "Answers 'which NVIDIA?' — routes tokenized-stock orders to the cheapest real share across issuers (bStocks, Ondo, xStocks), venues and sessions, never overpaying the fair value, and returns a verifiable receipt for every fill.",
    capabilities: ["trading", "best-execution", "tokenized-stocks"],
  },
};
