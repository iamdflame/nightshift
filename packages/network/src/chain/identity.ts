/**
 * ERC-8004 identities for the Night Shift. Every agent — each forecaster, the treasury/scorer and
 * the trade executor — is registered on BSC mainnet's AgentIdentity registry with an agent card
 * describing what it does and where to reach it (MCP / A2A). Its reputation then accrues to that
 * identity from reality-scored forecasts.
 *
 *   pnpm exec tsx packages/network/src/chain/identity.ts            # register any missing agents
 *   pnpm exec tsx packages/network/src/chain/identity.ts --dry-run  # print the agent cards only
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { AgentEndpoint, ERC8004Agent } from "@bnbagent/sdk";
import { loadEnv } from "../env.ts";
import { ROLES, type Role, walletFor } from "./wallets.ts";

loadEnv();
const PUBLIC_URL = process.env.NIGHTSHIFT_PUBLIC_URL ?? "https://github.com/nightshift-oracle";
const REGISTRY_FILE = "deployments/agents.json";

export const AGENT_CARDS: Record<Role, { name: string; description: string; capabilities: string[] }> = {
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

type Registry = Partial<Record<Role, { agentId: number | null; address: string; tx: string; agentURI: string; registeredAt: string }>>;
const load = (): Registry => (existsSync(REGISTRY_FILE) ? (JSON.parse(readFileSync(REGISTRY_FILE, "utf8")) as Registry) : {});

export async function registerAll(dryRun = false): Promise<Registry> {
  mkdirSync("deployments", { recursive: true });
  const reg = load();
  for (const role of ROLES) {
    const wallet = walletFor(role);
    const card = AGENT_CARDS[role];
    const endpoints = [
      AgentEndpoint.mcp(`${PUBLIC_URL}/mcp`, { capabilities: card.capabilities } as never),
      AgentEndpoint.a2a(PUBLIC_URL),
    ];
    const agent = await ERC8004Agent.create({ walletProvider: wallet, network: "bsc-mainnet" });
    const uri = agent.generateAgentUri({ name: card.name, description: card.description, endpoints, supportedTrust: ["reputation"] });
    if (dryRun) {
      console.log(`${role.padEnd(9)} ${wallet.address}  ${card.name}  (uri ${uri.length} bytes)`);
      continue;
    }
    if (reg[role]?.agentId != null) {
      console.log(`${role.padEnd(9)} already registered: agentId ${reg[role]!.agentId}`);
      continue;
    }
    const r = await agent.registerAgent(uri);
    reg[role] = { agentId: r.agentId, address: wallet.address, tx: r.transactionHash, agentURI: r.agentURI, registeredAt: new Date().toISOString() };
    writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
    console.log(`${role.padEnd(9)} registered agentId ${r.agentId} tx ${r.transactionHash}`);
  }
  return reg;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("identity.ts")) {
  await registerAll(process.argv.includes("--dry-run"));
}
