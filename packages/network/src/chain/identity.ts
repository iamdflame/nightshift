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
import { AGENT_CARDS } from "./agent-cards.ts";
import { ROLES, type Role, walletFor } from "./wallets.ts";

loadEnv();
/** Where the agents are reachable (MCP + A2A). Unset → cards carry no endpoints until one exists. */
const PUBLIC_URL = process.env.NIGHTSHIFT_PUBLIC_URL?.replace(/\/+$/, "") || null;
const REGISTRY_FILE = "deployments/agents.json";

export { AGENT_CARDS };

type Registry = Partial<Record<Role, { agentId: number | null; address: string; tx: string; agentURI: string; registeredAt: string; updateTx?: string }>>;
const load = (): Registry => (existsSync(REGISTRY_FILE) ? (JSON.parse(readFileSync(REGISTRY_FILE, "utf8")) as Registry) : {});

export async function registerAll(dryRun = false): Promise<Registry> {
  mkdirSync("deployments", { recursive: true });
  const reg = load();
  for (const role of ROLES) {
    const wallet = walletFor(role);
    const card = AGENT_CARDS[role];
    const endpoints = PUBLIC_URL
      ? [AgentEndpoint.mcp(`${PUBLIC_URL}/mcp`, { capabilities: card.capabilities } as never), AgentEndpoint.a2a(PUBLIC_URL)]
      : [];
    const agent = await ERC8004Agent.create({ walletProvider: wallet, network: "bsc-mainnet" });
    const uri = agent.generateAgentUri({ name: card.name, description: card.description, endpoints, supportedTrust: ["reputation"] });
    if (dryRun) {
      console.log(`${role.padEnd(9)} ${wallet.address}  ${card.name}  (uri ${uri.length} bytes)`);
      continue;
    }
    const known = reg[role];
    // A registration tx on record means the identity exists, even if its agentId wasn't decoded: never mint twice.
    if (known?.tx) {
      if (known.agentURI === uri) {
        console.log(`${role.padEnd(9)} already registered: agentId ${known.agentId}`);
        continue;
      }
      if (known.agentId == null) {
        console.log(`${role.padEnd(9)} registered in ${known.tx} but its agentId wasn't decoded; set it in ${REGISTRY_FILE} to update the card`);
        continue;
      }
      // Card or endpoints changed (e.g. the public URL now exists): update the URI in place.
      const u = await agent.setAgentUri(known.agentId, uri);
      reg[role] = { ...known, agentURI: uri, updateTx: u.transactionHash };
      writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
      console.log(`${role.padEnd(9)} updated agentId ${known.agentId} card → ${u.transactionHash}`);
      continue;
    }
    const r = await agent.registerAgent(uri);
    reg[role] = { agentId: r.agentId, address: wallet.address, tx: r.transactionHash, agentURI: uri, registeredAt: new Date().toISOString() };
    writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
    console.log(`${role.padEnd(9)} registered agentId ${r.agentId} tx ${r.transactionHash}`);
  }
  return reg;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("identity.ts")) {
  await registerAll(process.argv.includes("--dry-run"));
}
