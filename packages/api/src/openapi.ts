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
    "/v1/stream": { get: { summary: "Server-sent events: `round` events with fresh consensus as rounds complete", responses: { "200": { description: "text/event-stream" } } } },
    "/mcp": { post: { summary: "Model Context Protocol endpoint (Streamable HTTP) — tools: fair_value, which, radar, scoreboard, verify_forecast, study", responses: { "200": { description: "MCP" } } } },
  },
} as const;
