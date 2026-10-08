/**
 * Nightshift as an MCP server: any AI agent (Claude Code, an Agentic Wallet agent, another
 * forecaster) can ask what a tokenized stock is worth right now — including while Wall Street is
 * closed — which issuer's token to buy, and verify any committed forecast.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Queries } from "./queries.ts";

const json = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x, null, 2) }] });

export function buildMcpServer(q: Queries): McpServer {
  const server = new McpServer({ name: "nightshift", version: "0.1.0" });

  server.registerTool(
    "fair_value",
    {
      title: "Fair value of a tokenized stock, 24/7",
      description:
        "Nightshift consensus fair value (USD per token) for a tokenized stock on BNB Chain, plus a calibrated 90% band for its value at the next US market open. Works while the US market is closed. Accepts a symbol like NVDAB/TSLAB or a BSC token address.",
      inputSchema: { token: z.string().describe("bStock symbol (e.g. NVDAB) or BSC token address") },
    },
    async ({ token }) => json(q.fairValue(token) ?? { error: `no fair value for ${token} yet` }),
  );

  server.registerTool(
    "which",
    {
      title: "Which token should I buy for this stock?",
      description:
        "For an underlying ticker (e.g. NVDA), compares every issuer's token (bStocks …B, Ondo …on, xStocks …x) per real share across the Binance spot book and BSC DEX pools, against Nightshift fair value, and names the cheapest real share with enough liquidity.",
      inputSchema: { ticker: z.string().describe("Underlying US ticker, e.g. NVDA") },
    },
    async ({ ticker }) => json(q.which(ticker) ?? { error: `unknown ticker ${ticker}` }),
  );

  server.registerTool(
    "radar",
    {
      title: "Dark-hours radar",
      description: "Every covered stock's on-chain move since the last official close, Nightshift fair value, premium of the token over fair value, and downside gap risk to the next open. Sorted by the size of the move.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(20) },
    },
    async ({ limit }) => {
      const r = q.radar();
      return json({ ...r, rows: r.rows.slice(0, limit) });
    },
  );

  server.registerTool(
    "scoreboard",
    {
      title: "Forecaster scoreboard",
      description: "Live, reality-scored record of every forecaster in the Night Shift (CRPS, absolute error, 90% band coverage), by information state.",
      inputSchema: {},
    },
    async () => json({ scoreboard: q.scoreboard(), recent: q.results(10) }),
  );

  server.registerTool(
    "verify_forecast",
    {
      title: "Prove a forecast was committed before the open",
      description: "Returns the Merkle proof that a forecaster committed a given forecast in a round. The root is committed on BNB Chain in ForecastBook; verify with ForecastBook.verifyForecast.",
      inputSchema: { round: z.number().int(), forecaster: z.enum(["anchor", "echo", "nfv"]), token: z.string() },
    },
    async ({ round, forecaster, token }) => json(q.proof(round, forecaster, token) ?? { error: "not found" }),
  );

  server.registerTool(
    "study",
    {
      title: "Backtest results",
      description: "Out-of-sample results of the Nightshift Fair Value model vs a stale oracle and an on-chain echo, over every gap since bStocks listed.",
      inputSchema: {},
    },
    async () => json(q.study()),
  );

  return server;
}
