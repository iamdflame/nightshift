# Submission: BNB Hack, Tokenized Stocks Edition

> The form, field by field. Paste each answer as plain text. The **Developer Experience Report is a separate, human-written document** (evidence in `docs/der/EVIDENCE.md`).

## Team or project name

Nightshift

## Contact email

The address you registered with (the same one as on your Developer Experience Report).

## Wallet address (ERC-20)

A BNB Smart Chain wallet you control, or your Binance UID. Not one of the project's server keys.

## Telegram handle

Yours, with the @.

## What did you build?

```
Nightshift is a 24/7 next-open oracle for tokenized stocks on BNB Chain. For every bStock it publishes where the stock will open at the next US bell, with a 90% range, sealed on-chain before the bell and graded by the official open.

Who it's for: lenders and protocols that hold bStocks as collateral while Wall Street is closed, and the traders and agents who need to know whether a weekend price is fair. The US market sets a real price for 32.5 of the week's 168 hours. Venus values about 1,490 NVDAB of collateral from the token's own price around the clock; across every fully dark weekend since bStocks launched, that price called Monday's open barely better than Friday's close (166.7 vs 169.1 bps CRPS), with no error bar.

What it does, live on BSC mainnet:
- Every 30 minutes, three forecaster agents, each with an ERC-8004 identity, seal a Merkle root of their forecasts for all 91 bStocks into our ForecastBook contract: more than 230 seals since Oct 9.
- The official open scores every forecast. Their weighted consensus is posted to NightshiftOracle (330+ reports), six Chainlink-compatible feeds and a Venus OracleInterface adapter. Our credit vault lent against NVDAB at 10 p.m. on a Saturday, valuing it at the band's lower edge.
- Anyone can check it from a browser, no wallet: /verify rebuilds a forecast's Merkle proof and asks the contract (change it by one cent and it fails), then recomputes the oracle's posted price from the three sealed forecasts. It matches exactly.
- Honest numbers: in a 70-gap out-of-sample backtest (60,794 forecasts) the error is 22% lower than holding the last close and about 1% lower than the token's own price (3% and 2% on fully dark weekends). The point price is mostly the market's; what we add is the band, with 89% coverage against a 90% target. Monday Oct 12 is the first open scored entirely from sealed forecasts, live on /scoreboard.

Binance Web3 API, through our own typed SDK (all 65 endpoints of the 7 modules), about 13,000 calls a day, each logged with its outcome code at /stack:
- RWA Data: token prices for all 91 bStocks and each stock's market status.
- Trading: a $100 / $1k / $10k quote ladder on every token around the clock, probing the price you can actually execute at 3 a.m.; approvals, swaps and RFQ.
- Transaction: MEV-protected broadcasts; every trade becomes a receipt priced per real share against fair value.
- b402: x402 pay-per-query ($0.01 per report), settled by Binance's B402 facilitator into the treasury that pays the oracle's gas.

Agentic Wallet and Wallet Skills: our skill answers "which NVIDIA?" per real share (NVDAB, NVDAon, NVDAx), checks the price against the band, then trades with baw. A real Agentic Wallet NVDAB buy is on-chain with its receipt: 34.7 bps above fair value, inside the band.

BNB Agent Studio: five ERC-8004 identities (#370890-370894: the Scorer, three forecasters, the trade agent), an autonomous runtime that has sealed every 30-minute round since Fri Oct 9, 10:30 p.m. ET, a bag-init seller agent (A2A, MCP, x402), and ERC-8183 jobs that pay a forecaster only if it beat the no-skill baseline (deployed, not yet funded).

Tokenized stocks: bStocks are central (all 91 on BSC, e.g. NVDAB, TSLAB, AAPLB). Ondo tokens are priced per real share and quoted (e.g. NVDAon); xStocks are mapped per real share.

Known limits: one key posts the reports and owns the oracle; the consensus weights come from our API, not the chain; no x402 payment or ERC-8183 job has settled yet.
```

## Which tracks are you applying for?

- [x] Main track: Tokenized Stocks Products & Agents
- [x] Best Use of Agentic Wallet / Wallet Skills ($2,000)
- [x] Best Use of BNB Agent Studio ($2,000)

## Public repository URL

https://github.com/iamdflame/nightshift

## Demo video URL

https://youtu.be/7ee6TOFZqi4

## Deployed link, or instructions a judge can run

```
Live: https://nightshift-oracle.vercel.app (no wallet, no signup)

A 3-minute path:
1. Home: NVDAB's fair value and 90% band for the next open. Scroll to "Same call, two answers": Venus's getPrice(NVDAB) next to ours, read live from BSC in your browser.
2. /verify: press "Verify on BNB Chain". Your browser rebuilds a sealed forecast's Merkle proof and calls ForecastBook.verifyForecast on BSC. Tick "Tamper with it" and run it again: it fails. Then press "Recompute NVDAB's oracle price".
3. /scoreboard: every forecaster graded by the official open. Monday Oct 12, 13:30 UTC is the first open scored entirely from sealed forecasts; the page updates by itself.
4. /stack: every Binance Web3 API call and outcome code, live.
5. /proof: every contract, seal, oracle report and trade, with BscScan links.

API, no key: curl https://nightshift-oracle.vercel.app/v1/fair-value/NVDAB
MCP (Claude Code or any MCP client): claude mcp add --transport http nightshift https://nightshift-oracle.vercel.app/mcp
Agentic Wallet skill: skills/nightshift in the repo (install steps on /stack under "Use it").

Contracts on BSC mainnet:
ForecastBook 0xa04fE9e7F0289c9fC5b00e0eE972Cbd00a203212
NightshiftOracle 0x0cEe7C0F2B62421E54c5F2E618dC53CC7eD4c63d
NightshiftCredit 0x49c79D9D4c68a6fB8e9A34b828d36B7A38E2762e
NightshiftVenusOracle 0x1a92c4Dc8264ebC2E6F3984a963AF5a4054FaC23
NVDAB feed (AggregatorV3) 0x0098192690f14749Ec81f636dc0a01f4893463E2
Agentic Wallet buy with receipt: https://bscscan.com/tx/0xbd77806a9c274aa9d3609df15c856f37ef61ff85f843511371140897a02af92a
Every transaction: docs/LIVE.md in the repo.
```

## Reference

- Whitepaper: `docs/whitepaper.md`. Venus risk report: `docs/venus-weekend-risk.md`. Live proof snapshot: `docs/LIVE.md`.
- ERC-8004 agents (Identity Registry 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432): #370890 Scorer `0x6890d02b614aeD8466d30F3642afd193e952f19e`, #370891 Anchor `0x4feD3C73DE4392299747bf976749586b96D2C9e8`, #370892 Echo `0x11Cff8165119475Bc7f76ef755f4c0b7e33C0183`, #370893 NFV `0xed958842c7477E76d926E4B08130a0b5C2DCbd99`, #370894 Trade `0xd8aCAE17c151Fe640EB83593F69ff44678427Ee7`.
