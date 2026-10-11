/** OpenAPI 3.1 contract for the Nightshift API — the frontend builds against this. */
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Nightshift API",
    version: "0.1.0",
    description:
      "The price of a stock when Wall Street is asleep. Fair value and calibrated next-open bands for tokenized US stocks on BNB Chain, 24/7; which issuer's token to buy; commit–reveal proofs of every forecast; and the live, reality-scored record of the forecasters.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/v1/status": { get: { summary: "Session, next open, latest round, tape lag", responses: { "200": { description: "Status" } } } },
    "/v1/fair-value": { get: { summary: "Latest consensus fair value for every covered token", responses: { "200": { description: "Array of Consensus" } } } },
    "/v1/fair-value/{token}": {
      get: {
        summary: "Consensus + each forecaster's view for one token",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" }, description: "Symbol (NVDAB) or BSC address" }],
        responses: { "200": { description: "FairValue" }, "404": { description: "Unknown token" } },
      },
    },
    "/v1/which/{ticker}": {
      get: {
        summary: "Which token to buy for an underlying: every issuer per real share, venues, liquidity, vs fair value",
        parameters: [{ name: "ticker", in: "path", required: true, schema: { type: "string" }, description: "Underlying ticker, e.g. NVDA" }],
        responses: { "200": { description: "Which" }, "404": { description: "Unknown ticker" } },
      },
    },
    "/v1/radar": { get: { summary: "Dark-hours radar: move since close, fair value, premium, gap risk — every stock", responses: { "200": { description: "Radar" } } } },
    "/v1/instruments": { get: { summary: "Instrument registry (bStocks, Ondo, xStocks across chains)", parameters: [{ name: "ticker", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Instruments" } } } },
    "/v1/rounds": { get: { summary: "Recent forecast rounds with each forecaster's committed Merkle root", parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 50 } }], responses: { "200": { description: "Rounds" } } } },
    "/v1/rounds/{round}/proof/{forecaster}/{token}": {
      get: {
        summary: "Merkle proof that a forecast was committed (verify on-chain with ForecastBook.verifyForecast)",
        parameters: [
          { name: "round", in: "path", required: true, schema: { type: "integer" } },
          { name: "forecaster", in: "path", required: true, schema: { type: "string", enum: ["anchor", "echo", "nfv"] } },
          { name: "token", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Proof" }, "404": { description: "Not found" } },
      },
    },
    "/v1/scoreboard": { get: { summary: "Live scoreboard of the forecasters (CRPS, MAE, 90% coverage) by information state", responses: { "200": { description: "Scoreboard" } } } },
    "/v1/results": { get: { summary: "Per-open live results", responses: { "200": { description: "Results" } } } },
    "/v1/study": { get: { summary: "Out-of-sample backtest results and fitted model parameters", responses: { "200": { description: "Study" } } } },
    "/v1/history/{token}": {
      get: {
        summary: "One token's recent history: consensus fair value + band per round, nfv token price and last close, hourly CEX closes, and every forecaster's commit for the next open",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" }, description: "Symbol (NVDAB) or BSC address" },
          { name: "hours", in: "query", schema: { type: "integer", default: 72, minimum: 1, maximum: 336 } },
        ],
        responses: { "200": { description: "History" }, "404": { description: "Unknown token" } },
      },
    },
    "/v1/stack": { get: { summary: "The Binance Web3 API as Nightshift uses it, from the SDK telemetry: calls (24 h and all time) per module and endpoint, p50/p95 latency, doc drift, and every outcome code with its meaning and our handling", responses: { "200": { description: "Stack" } } } },
    "/v1/onchain": { get: { summary: "Everything on BSC mainnet: contracts, oracle feeds, ERC-8004 agents, forecast commitments, oracle posts, the Sunday loan, Agentic Wallet trades, ERC-8183 jobs, scores", responses: { "200": { description: "OnChain" } } } },
    "/v1/opens": {
      get: {
        summary: "Each scored open per token: the forecaster's last pre-open forecast against the realized open",
        parameters: [{ name: "forecaster", in: "query", schema: { type: "string", enum: ["anchor", "echo", "nfv"], default: "nfv" } }],
        responses: { "200": { description: "Opens" }, "400": { description: "Unknown forecaster" } },
      },
    },
    "/v1/receipts/{tx}": {
      get: {
        summary: "Receipt for any BSC tokenized-stock trade: what it cost per real share vs the fair value at that moment",
        parameters: [
          { name: "tx", in: "path", required: true, schema: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } },
          { name: "trader", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Receipt" }, "400": { description: "Bad hash" }, "422": { description: "No receipt could be built for that transaction (e.g. not a tokenized-stock trade)" } },
      },
    },
    "/v1/stream": { get: { summary: "Server-sent events: `round` events with fresh consensus as rounds complete", responses: { "200": { description: "text/event-stream" } } } },
    "/.well-known/agent-card.json": { get: { summary: "ERC-8004 registration file for the Nightshift network: services (MCP, OpenAPI, web), on-chain agent registrations, skills", responses: { "200": { description: "AgentCard" } } } },
    "/mcp": { post: { summary: "Model Context Protocol endpoint (Streamable HTTP) — tools: fair_value, which, radar, scoreboard, verify_forecast, study", responses: { "200": { description: "MCP" } } } },
  },
} as const;
