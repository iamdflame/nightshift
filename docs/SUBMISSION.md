# Submission draft: BNB Hack, Tokenized Stocks Edition

> Copy into the submission form. The only `TODO` left is the demo video link. The **Developer Experience Report is a separate, human-written document** (evidence in `docs/der/EVIDENCE.md`).

**Project:** Nightshift

**One-liner:** The price of a stock when Wall Street is asleep. AI forecasting agents price tokenized stocks 24/7 on BNB Chain, prove every forecast on-chain before the market opens, and get paid only when reality says they were right.

**Description (≈200 words):**
Tokenized stocks trade around the clock, but the stock market behind them sets a reliable price only 19% of the week. For 48 hours every weekend there is no reference price at all. Oracles go stale, lenders keep borrow caps at zero, LPs get picked off at every reopen, and even Binance's own agent wallet asks users *which* NVIDIA token to buy.

Nightshift is the missing price layer.
- **The model.** NFV, our information-provenance model, is backtested out-of-sample on every gap since bStocks listed: −22% forecast error vs a stale oracle, −44% at the Sunday-night restart, with calibrated 90% bands. Live, scored against the official open, it cut forecast error (CRPS) by 49% on Oct 8 and 31% on Oct 9.
- **The agents.** A network of forecasters with ERC-8004 identities commits Merkle roots of every forecast to `ForecastBook` every 30 minutes before the bell, and is scored by the official open. Anyone can verify a sealed forecast in the browser, no wallet. Pay-for-accuracy runs on ERC-8183 jobs on BNB's own commerce contracts, paying a forecaster only when it beats the stale oracle; the jobs are wired end to end and the first open once the escrow is funded.
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
- Website (live): https://nightshift-oracle.vercel.app
  - Verify a sealed forecast on BNB Chain from your browser: https://nightshift-oracle.vercel.app/verify
  - Every on-chain event with BscScan links: https://nightshift-oracle.vercel.app/proof
- Repo: https://github.com/iamdflame/nightshift
- Live API: https://nightshift-oracle.vercel.app/v1 (`/v1/radar`, `/v1/which/NVDA`, `/v1/scoreboard`, `/v1/onchain`, `/openapi.json`, `/mcp`, `/.well-known/agent-card.json`)
- Demo video: TODO
- Contracts on BSC mainnet (deployed at block 126,929,397):
  - ForecastBook: https://bscscan.com/address/0xa04fE9e7F0289c9fC5b00e0eE972Cbd00a203212
  - NightshiftOracle: https://bscscan.com/address/0x0cEe7C0F2B62421E54c5F2E618dC53CC7eD4c63d
  - NightshiftCredit: https://bscscan.com/address/0x49c79D9D4c68a6fB8e9A34b828d36B7A38E2762e
  - NightshiftVenusOracle: https://bscscan.com/address/0x1a92c4Dc8264ebC2E6F3984a963AF5a4054FaC23
- ERC-8004 agents (Identity Registry 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432):
  - #370890 Nightshift Scorer (treasury): https://bscscan.com/address/0x6890d02b614aeD8466d30F3642afd193e952f19e
  - #370891 Forecaster Anchor: https://bscscan.com/address/0x4feD3C73DE4392299747bf976749586b96D2C9e8
  - #370892 Forecaster Echo: https://bscscan.com/address/0x11Cff8165119475Bc7f76ef755f4c0b7e33C0183
  - #370893 Forecaster NFV: https://bscscan.com/address/0xed958842c7477E76d926E4B08130a0b5C2DCbd99
  - #370894 Nightshift Trade (executor): https://bscscan.com/address/0xd8aCAE17c151Fe640EB83593F69ff44678427Ee7
- Agentic Wallet buy of NVDAB with a verified receipt: https://bscscan.com/tx/0xbd77806a9c274aa9d3609df15c856f37ef61ff85f843511371140897a02af92a
- Whitepaper: `docs/whitepaper.md`. Venus risk report: `docs/venus-weekend-risk.md`. Live proof snapshot: `docs/LIVE.md`.
