# Submission draft: BNB Hack, Tokenized Stocks Edition

> Copy into the submission form. Fill the `TODO` links after deployment and recording. The **Developer Experience Report is a separate, human-written document** (evidence in `docs/der/EVIDENCE.md`).

**Project:** Nightshift

**One-liner:** The price of a stock when Wall Street is asleep. AI forecasting agents price tokenized stocks 24/7 on BNB Chain, prove every forecast on-chain before the market opens, and get paid only when reality says they were right.

**Description (≈200 words):**
Tokenized stocks trade around the clock, but the stock market behind them sets a reliable price only 19% of the week. For 48 hours every weekend there is no reference price at all. Oracles go stale, lenders keep borrow caps at zero, LPs get picked off at every reopen, and even Binance's own agent wallet asks users *which* NVIDIA token to buy.

Nightshift is the missing price layer.
- **The model.** NFV, our information-provenance model, is backtested out-of-sample on every gap since bStocks listed: −22% forecast error vs a stale oracle, −44% at the Sunday-night restart, with calibrated 90% bands. On its first live open (Oct 8) it cut error by 49%.
- **The agents.** A network of forecasters with ERC-8004 identities commits Merkle roots of every forecast to `ForecastBook` before the bell, and is scored by the official open. They're paid through ERC-8183 jobs on BNB's own commerce contracts only when they beat the stale oracle.
- **What it powers.** The consensus feeds `NightshiftOracle` and with it:
  - a **Wallet Skill** that answers "which NVIDIA?" and never overpays;
  - **receipts** that prove any trade's cost per real share;
  - a **credit vault** that lends against bStocks on a Sunday;
  - a **PancakeSwap Infinity hook** that cut LP reopen losses 71% on a mainnet fork;
  - a **Venus risk report** showing the blocker to stock-backed borrowing is the oracle, not solvency.

**Tokenized stocks used:**
- **bStocks (central):** all 91 on BSC are priced 24/7, with Binance spot books and BSC pools as signals.
- **Ondo and xStocks:** compared per real share in `/v1/which`.

**Binance Web3 API modules:** RWA Data, Market, Trading (quote, approve, swap, RFQ), Transaction (broadcast with MEV protection), Wallet, DeFi, b402. The client covers all 65 endpoints, and its telemetry logs every call for the DER.

**Special prizes:**
- **Best Use of Agentic Wallet / Wallet Skills:** `skills/nightshift/SKILL.md` drives `baw` market orders inside the fair-value band, limit orders at fair value outside it, and `x402-payment` for premium data. Receipts verify every fill.
- **Best Use of BNB Agent Studio:** `agents/NightshiftOracle` (scaffolded with `bag init`, BSC mainnet, A2A + MCP + x402, ERC-8183 + B402 rails) sells deterministic fair-value reports to other agents. Its negotiate flow is verified with a 0.01 U quote. The forecaster network uses `@bnbagent/sdk` (ERC-8004 identities, ERC-8183 pay-for-accuracy jobs, keystores).

**Links:**
- Repo: TODO
- Live API: TODO (`/v1/radar`, `/v1/which/NVDA`, `/v1/scoreboard`, `/openapi.json`, `/mcp`)
- Demo video: TODO
- Contracts on BSC (from `deployments/56.json`): NightshiftOracle TODO · ForecastBook TODO · NightshiftCredit TODO · NightshiftVenusOracle TODO
- ERC-8004 agents (from `deployments/agents.json`): TODO
- Whitepaper: `docs/whitepaper.md` · Venus risk report: `docs/venus-weekend-risk.md`
