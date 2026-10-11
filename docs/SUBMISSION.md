# Submission draft: BNB Hack, Tokenized Stocks Edition

> Copy into the submission form. The **Developer Experience Report is a separate, human-written document** (evidence in `docs/der/EVIDENCE.md`).

**Project:** Nightshift

**One-liner:** Every price on BNB Chain tells you what a tokenized stock trades at right now. Nightshift tells a lender where it will open and how far it can gap: three forecasters seal a fair value and a 90% band for every bStock's next US open on BNB Chain before the bell, the official open scores them, and contracts read their consensus.

**Description (≈200 words):**
Tokenized stocks trade 24/7; the US regular session is 32.5 of the week's 168 hours. When it closes, the reference goes quiet (Chainlink's equity feeds "do not publish updates … while markets are closed"), and lenders price bStocks from the token's own weekend trading. Venus values about 1,490 NVDAB of collateral that way right now. Across every fully dark weekend since June, that price called Monday's open barely better than Friday's close (166.7 vs 169.1 bps CRPS), with no error bar.

Nightshift publishes what a lender needs instead: a fair value and a calibrated 90% band for the next open, around the clock, for all 91 bStocks.
- **Sealed before the bell, scored by the open.** Three ERC-8004 agents (the last close held to the bell, the token's live price, and our NFV model) seal Merkle roots of every forecast in `ForecastBook` every 30 minutes: 222 seals of 91 forecasts each since Oct 9. The open scores them with CRPS. ERC-8183 jobs on BNB's commerce contracts are built to pay a forecaster only if it beat the no-skill baseline; none is funded yet. Anyone can verify a sealed forecast from the browser, no wallet, and recompute the oracle's posted price from the three sealed forecasts.
- **Honest numbers.** Backtest over 70 gaps: −22% error vs the last close held to the open and −1% vs the token's own price; on fully dark weekends −3% and −2%. The model's edge is the band (89% coverage overall, 87% on fully dark weekends, against 90%).
- **Readable by contracts.** `NightshiftOracle`, six Chainlink-compatible feeds and a Venus `OracleInterface` adapter, live on mainnet. Our own credit vault lent against NVDAB at 10 p.m. on a Saturday, valuing it at the band's lower edge. The site asks Venus and Nightshift the same `getPrice(NVDAB)` and shows both answers.
- **For agents.** A Wallet Skill (which NVIDIA, checked against the band), receipts per real share, an MCP server, and x402 pay-per-query: `/x402/fair-value/{symbol}` answers 402 for $0.01 per report, settled by Binance's B402 facilitator (no payment settled yet).

**Tokenized stocks used:**
- **bStocks (central):** all 91 on BSC, priced 24/7 from Binance spot books and BSC pools, with Binance Web3 RWA Data and Trading quotes where Binance serves them to us.
- **Ondo:** compared per real share in `/v1/which` (xStocks are mapped where the registry lists them).

**Binance Web3 API:** we call RWA Data (prices, underlying market, share ratios), Trading (a $100/$1k/$10k quote ladder on every token, approvals, swaps, RFQ), Transaction (MEV-protected broadcast) and b402; live call counts, latencies and every outcome code are on [/stack](https://nightshift-oracle.vercel.app/stack). Binance refuses RWA Data and tokenized-stock quotes to our production server in EU West (40304, compliance restriction), so those successful calls and our real swaps ran from our development machine; b402 runs in production. Our SDK types all 65 endpoints across the 7 modules.

**Special prizes:**
- **Best Use of Agentic Wallet / Wallet Skills:** `skills/nightshift/SKILL.md` drives `baw` market orders inside the fair-value band and limit orders at fair value outside it, and can pay for premium data over x402. A real Agentic Wallet buy of NVDAB is on-chain with its receipt (34.7 bps above fair value, inside the band).
- **Best Use of BNB Agent Studio:** five ERC-8004 identities (#370890–370894) for the Scorer, three forecasters and the trade agent, an autonomous runtime that has sealed every 30-minute round since Fri Oct 9, 10:30 p.m. ET (five rounds were missed before that), ERC-8183 pay-for-accuracy jobs (deployed, not yet funded), and `agents/NightshiftOracle` (scaffolded with `bag init`; A2A + MCP + x402) offering fair-value reports to other agents.

**Links:**
- Website (live): https://nightshift-oracle.vercel.app
  - Verify a sealed forecast on BNB Chain from your browser: https://nightshift-oracle.vercel.app/verify
  - Every on-chain event with BscScan links: https://nightshift-oracle.vercel.app/proof
  - Binance Web3 API telemetry (every call and outcome code): https://nightshift-oracle.vercel.app/stack
- Repo: https://github.com/iamdflame/nightshift
- Live API: https://nightshift-oracle.vercel.app/v1 (`/v1/radar`, `/v1/which/NVDA`, `/v1/scoreboard`, `/v1/onchain`, `/openapi.json`, `/mcp`, `/.well-known/agent-card.json`)
- Demo video: https://youtu.be/7ee6TOFZqi4
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
