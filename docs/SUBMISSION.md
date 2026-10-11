# Submission draft: BNB Hack, Tokenized Stocks Edition

> Copy into the submission form. The only `TODO` left is the demo video link. The **Developer Experience Report is a separate, human-written document** (evidence in `docs/der/EVIDENCE.md`).

**Project:** Nightshift

**One-liner:** Every price on BNB Chain tells you what a tokenized stock trades at right now. Nightshift tells a lender where it will open and how far it can gap: three forecasters seal a fair value and a 90% band for every bStock's next US open on BNB Chain before the bell, the official open scores them, and contracts read their consensus.

**Description (≈200 words):**
Tokenized stocks trade 24/7; the US regular session is 32.5 of the week's 168 hours. When it closes, the reference goes quiet (Chainlink's equity feeds "do not publish updates … while markets are closed"), and lenders price bStocks from the token's own thin weekend trading. Venus values about 1,490 NVDAB of collateral that way right now. Across every fully dark weekend since June, that price called Monday's open barely better than Friday's close (166.7 vs 169.1 bps CRPS), with no error bar.

Nightshift publishes what a lender needs instead: a fair value and a calibrated 90% band for the next open, around the clock, for all 91 bStocks.
- **Forecasters with skin in the game.** Three ERC-8004 agents (Friday's close held to the bell, the token's live price, and our NFV model) seal Merkle roots of every forecast in `ForecastBook` every 30 minutes before the bell. The open scores them; ERC-8183 jobs on BNB's commerce contracts pay a forecaster only if it beat the no-skill baseline. Anyone can verify a sealed forecast from the browser, no wallet.
- **Honest numbers.** Backtest: −22% error vs Friday's close, −1% vs the token's price; the model's edge is the band (87–90% coverage).
- **Read by contracts.** `NightshiftOracle`, six Chainlink-compatible feeds and a Venus `OracleInterface` adapter, live on mainnet. Our credit vault lent against NVDAB at 10 p.m. on a Saturday, valuing it at the band's lower edge. The site asks Venus and Nightshift the same `getPrice(NVDAB)` and shows both answers.
- **For agents.** A Wallet Skill (which NVIDIA, inside the band), receipts per real share, an MCP server and x402 pay-per-query.

**Tokenized stocks used:**
- **bStocks (central):** all 91 on BSC, priced 24/7 from Binance Web3 RWA Data and Trading quotes, Binance spot books and BSC pools.
- **Ondo:** compared per real share in `/v1/which` (xStocks are mapped where the registry lists them).

**Binance Web3 API:** RWA Data (prices, underlying market, share ratios, corporate actions), Trading (a $100/$1k/$10k quote ladder on every token, approvals, swaps, RFQ), Transaction (MEV-protected broadcast) and b402 run in production; their live call counts, latencies and every outcome code are on [/stack](https://nightshift-oracle.vercel.app/stack). Our SDK types all 65 endpoints across the 7 modules.

**Special prizes:**
- **Best Use of Agentic Wallet / Wallet Skills:** `skills/nightshift/SKILL.md` drives `baw` market orders inside the fair-value band and limit orders at fair value outside it, and pays for premium data over x402. A real Agentic Wallet buy of NVDAB is on-chain with its receipt (34.7 bps above fair value, inside the band).
- **Best Use of BNB Agent Studio:** five ERC-8004 identities (#370890–370894) for the Scorer, three forecasters and the trade agent, an autonomous runtime that has sealed every round since Oct 9, ERC-8183 pay-for-accuracy jobs, and `agents/NightshiftOracle` (scaffolded with `bag init`; A2A + MCP + x402) selling fair-value reports to other agents.

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
