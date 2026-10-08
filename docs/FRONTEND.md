# Frontend spec (for the human-built UI)

Everything the UI needs is served by the API (`packages/api`, default `http://localhost:8787`, OpenAPI at `/openapi.json`). Live updates: subscribe to `GET /v1/stream` (SSE `round` events every 30 minutes, with the full consensus).

## Pages

| Page | What it shows | Endpoint(s) |
|---|---|---|
| **Radar** (home) | Grid or heatmap of every bStock: move since the last official close (bps), fair value, 90% band for the next open, token premium vs fair value, downside gap risk. A header shows the session state ("US market closed: next open Mon 13:30 UTC, in 25h 30m"). | `/v1/radar`, `/v1/status` |
| **Which?** | Search box for a ticker (NVDA). One row per issuer token (bStocks …B, Ondo …on, xStocks …x) per chain: price per real share, vs fair value (bps), Binance spot book, BSC pools and liquidity. Highlight `answer`. | `/v1/which/{ticker}` |
| **Token** | One token: consensus fair value plus band (big numbers), each forecaster's view, the anchor time, and a band-vs-time chart built from SSE history. | `/v1/fair-value/{symbol}` |
| **Night Shift** | The agents: anchor / echo / nfv with ERC-8004 identities, consensus weights, and the live scoreboard by state (CRPS, MAE, 90% coverage). Per-open results table. Commitments per round with BscScan links. | `/v1/scoreboard`, `/v1/results`, `/v1/rounds` |
| **Proof** | Pick a round, forecaster and token: show the leaf, the Merkle proof, the root, and "committed on BSC at block N, before the open". One-click verify on-chain (`ForecastBook.verifyForecast`). | `/v1/rounds/{round}/proof/{forecaster}/{token}` |
| **Identities** | "The market checks itself": leveraged pairs vs base (implied vs actual move, disagreement in bps). | `/v1/identities` |
| **Receipt** | Paste any BSC tx hash (optionally the trader address): price per real share paid vs fair value at that moment, inside/outside the band, receipt hash. | `/v1/receipts/{tx}?trader=` |
| **Science** | Backtest table and chart (stale vs echo vs NFV by state). Link to the whitepaper. | `/v1/study`, `docs/figures/weekend-crps.svg` |
| **Lend / Pools** | Credit vault stats; hook LVR comparison (from docs/hook.md); Venus weekend risk table. | contract reads + `docs/venus-weekend-risk.md` |

## Design notes

- The core idea is time. Always show the session clock and the countdown to the next open. The UI should *feel different* when the market is closed: darker, with "dark hours" language.
- Numbers to always show with units: USD per **token** vs per **share** (divide by `sharesPerToken` or `basis`), bps vs fair value, band as `[lower, upper]` for the next open.
- Every claim links to its proof: commitment tx, Merkle proof, receipt hash, study JSON.
