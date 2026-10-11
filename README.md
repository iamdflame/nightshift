# Nightshift: the price of a stock when Wall Street is asleep

Nightshift is a 24/7 next-open oracle for tokenized stocks on BNB Chain. For every bStock it publishes where the stock will open at the next US bell, with a 90% range, sealed on-chain before the bell and graded by the official open. Every other price on BNB Chain tells you what a tokenized stock trades at right now; Nightshift tells a lender where it will open, and how far it can gap.

- Three forecasters (the last close held to the bell, the token's live price, and our NFV model) seal a Merkle root of every forecast on BNB Chain every 30 minutes, before the bell.
- The official open scores them. ERC-8183 jobs on BNB's commerce contracts are built to pay a forecaster only if it beat the no-skill baseline on that open (deployed; none funded yet, so nothing has been paid).
- Their weighted consensus is published on-chain, where contracts read it: our credit vault lends against NVDAB at the band's lower edge, through six Chainlink-compatible feeds and a Venus `OracleInterface` adapter.

**Live site: [nightshift-oracle.vercel.app](https://nightshift-oracle.vercel.app)** · **Demo video (3 min): [youtu.be/7ee6TOFZqi4](https://youtu.be/7ee6TOFZqi4)**. It shows the night sky over Wall Street right now, the 91 bStocks priced for the next open, and every forecast sealed on BNB Chain. You can check any of them from your browser at [/verify](https://nightshift-oracle.vercel.app/verify).

> Built for **BNB Hack: Tokenized Stocks Edition**. **bStocks** are central (all 91 on BSC). **Ondo** and **xStocks** are priced per real share. BSC mainnet.

### Three facts, if you read nothing else

1. **It's live on BSC mainnet.** Forecast commitments, oracle reports and a loan against NVIDIA taken at 10 p.m. on a Saturday (New York time) are on-chain. Every contract and transaction is linked from **[docs/LIVE.md](docs/LIVE.md)**, which is generated from the chain records.
2. **It's measured, not claimed, against both baselines.** In a leave-one-gap-out backtest (70 gaps, 60,794 forecasts) the error is **22% lower than the last close** held to the open (across all gaps, mostly weekday overnights), and **1% lower than the token's own price**: most of the point gain is reading the 24/7 market at all. On fully dark weekends the gains shrink to 3% and 2%. What the model adds is the **band** (89% coverage overall, 87% on fully dark weekends, against a 90% target). On the live opens of Oct 8 and Oct 9, scored automatically, the error was 49% and 31% below the previous close (those two were scored off-chain; on-chain sealing started the evening of Oct 9, so Monday Oct 12 is the first fully sealed open).
3. **It's built on the sponsor stack end to end:**
   - the Binance Web3 API through our own SDK (all 65 endpoints typed; RWA Data, Trading, Transaction and b402 in production, with live telemetry at [/stack](https://nightshift-oracle.vercel.app/stack));
   - a Wallet Skill for the Agentic Wallet (`baw` orders, x402);
   - an Agent Studio seller agent;
   - ERC-8004 identities and ERC-8183 jobs on BNB's own contracts.

### Verify it yourself in 3 minutes (no wallet, no signup)

0. Fastest: open **[/verify](https://nightshift-oracle.vercel.app/verify)** on the live site. Your browser fetches a forecast's Merkle proof, recomputes the leaf and root, and calls `ForecastBook.verifyForecast` on BSC itself.
1. Open **[docs/LIVE.md](docs/LIVE.md)** and click any **ForecastBook** commit. Its block time is before the 13:30 UTC open it forecasts.
2. Ask the API for one forecast and its Merkle proof: `GET /v1/rounds/{round}/proof/nfv/{token}`. Hash the leaf and check it against the root committed in step 1:
   ```
   keccak256(bytes.concat(keccak256(abi.encode(round, token, medianE8, lowerE8, upperE8, anchorTime))))
   ```
3. After the open, `GET /v1/scoreboard` shows the same forecasts scored against the official open.

---

## The problem

- **The regular US session is 19% of the week.**
  - Tokenized stocks trade 24/7, but deep price discovery happens in the US regular session: 32.5 of 168 hours (extended and overnight sessions add some, thinly).
  - From Friday 20:00 to Sunday 20:00 New York time (48 hours, plus holidays and halts) there is no reference price at all.
  - That is when people trade: bStocks launched on BNB Chain on June 11, 2026, and **62% of their July volume happened while US markets were dark** ([Crypto Briefing, Aug 26, 2026](https://cryptobriefing.com/binance-bstocks-volume-us-market-closures/)).
- **The reference stops; the token's own price is all that's left.** Chainlink's tokenized-equity docs: *"These feeds do not publish updates, including heartbeat updates, while markets are closed"* ([docs](https://docs.chain.link/data-feeds/tokenized-equity-feeds)). Lenders still price bStocks on weekends from the token's own trading: Venus values NVDAB (collateral factor 60%, about 1,490 NVDAB posted against a 1,500 cap, read on-chain Oct 11) from two NVDAB/USD feeds of the token's price.
- **That price says nothing about the gap.** Across every fully dark weekend since bStocks launched, the token's own price called Monday's open barely better than Friday's close (CRPS 166.7 vs 169.1 bps in our backtest), and it comes with no error bar. A lender can't size a weekend loan for Monday's gap from one number. Nightshift's site shows both answers side by side, read live from the two contracts.

## How it works

```mermaid
flowchart LR
  subgraph Sources["24/7 sources"]
    BS[Binance spot books: 91 bStocks]
    DEX[BSC pools: bStocks / Ondo / xStocks]
    W3[Binance Web3 API: RWA, Market, Trading quotes]
    REF[Official open/close]
  end
  Sources --> TAPE[(Tape: every observation)]
  TAPE --> F1[Forecaster: anchor] & F2[Forecaster: echo] & F3[Forecaster: NFV]
  F1 & F2 & F3 -->|Merkle root, before the open| FB[ForecastBook]
  F1 & F2 & F3 --> AGG[Reputation-weighted consensus]
  AGG -->|fair value + 90% band| OR[NightshiftOracle]
  OPEN[Official open] --> SC[Scorer: CRPS]
  SC -->|pay only if it beat the no-skill baseline| J[ERC-8183 jobs on BNB's commerce contracts]
  OR --> CR[NightshiftCredit: weekend loans] & VA[Venus adapter + AggregatorV3 feeds] & HK[PancakeSwap Infinity hook]
  AGG --> API[API + MCP + x402] --> SK[Agentic Wallet skill]
```

1. **Forecast.** Every 30 minutes, three forecasters (each with an ERC-8004 identity) predict every bStock's next official open as a distribution, not a point:
   - `anchor`: the last close held to the open, what an equity feed that stops at the close reports;
   - `echo`: the token's live price (what Venus reads for bStocks today);
   - `nfv`: our model.
2. **Commit.** Each forecaster commits a Merkle root of its forecasts to `ForecastBook` before the open. Nobody, including us, can change a forecast after the fact.
3. **Score and pay.** At the open, the Scorer grades every forecast with CRPS, a standard score for probabilistic forecasts. ERC-8183 jobs on BNB's commerce, router and policy contracts escrow the forecasters' pay in U:
   - a forecaster is paid only if it beat the no-skill baseline (the last close held to the bell) on that open;
   - otherwise the Scorer disputes, with the score report's hash as evidence.
4. **Publish.** The reputation-weighted consensus goes to `NightshiftOracle` as a fair value plus a 90% band for the next open.
   - Tokens that contracts consume are posted every round.
   - The rest are posted on a 25 bps move or a 6-hour heartbeat, so gas lasts through judging.
5. **Use.** Contracts read the band, not just the price.

## What we built

| Piece | What it is |
|---|---|
| **NFV model** | Dark-hours fair value ([whitepaper](docs/whitepaper.md)). **Information provenance**: a token's move since the close is split into post-market, dark and restart segments, and each segment's trust is learned. Split-conformal 90% bands. Backtested strictly out-of-sample on every gap since bStocks listed. |
| **Pay-for-accuracy network** | `ForecastBook` commit-reveal, CRPS Scorer, ERC-8183 job lifecycle (open → submit the last on-chain root → judge → settle) run by the runner with no human in the loop. |
| **NightshiftOracle** | Signed fair value + band + session + flags per token; staleness and corporate-action flags; Chainlink `AggregatorV3` feeds per token. |
| **NightshiftCredit** | Borrow USDT against bStocks 24/7. Collateral counts at the **lower edge of the band** for the next open, so a weekend loan is sized for Monday's gap. Ships a Venus `OracleInterface` adapter. |
| **Infinity hook** | PancakeSwap Infinity dynamic-fee hook driven by the oracle. Informed reopen flow pays for the gap it captures. On a BSC mainnet fork (pool $230, fair value $236, ~$302k position), LPs lose **$70.63** with Nightshift vs **$244.92** at a flat 0.05% fee and **$207.81** at a flat 0.25%: **71% and 66% lower** ([hook.md](docs/hook.md)). |
| **Wallet Skill** | `skills/nightshift` for the Binance Agentic Wallet: per-real-share prices across bStocks, Ondo and xStocks, fair-value checks, `baw` market orders inside the band and limit orders at fair value outside it, and x402 for paid data. |
| **Receipts** | `/v1/receipts/{tx}` turns any BSC tokenized-stock trade into its cost per real share against the fair value at that moment, rebuilt from on-chain logs and hashed. A real $2,451 NVDAB sale "sold 11.1 bps below fair value". |
| **Agent Studio seller** | `agents/NightshiftOracle` (`bag init`, BSC mainnet, A2A + MCP + x402, ERC-8183 + B402 rails) sells deterministic fair-value reports to other agents. |
| **Binance Web3 SDK** | `packages/sdk` covers all **65 REST endpoints**, with:<br>• HMAC signing and clock-skew correction<br>• per-endpoint rate limits and circuit breakers<br>• never-retry-writes, record/replay, and a b402 merchant kit<br>• telemetry on every call<br>It found **40 documentation issues** ([README](packages/sdk/README.md)). |
| **API** | REST + SSE + OpenAPI + MCP: fair value, rounds with Merkle proofs, scoreboard, receipts, radar, identities, health. |

## Results

Leave-one-gap-out backtest over **70 gaps / 60,794 forecasts** (Jun 11 – Oct 7, 2026; each gap is scored with parameters fitted on the others). CRPS in bps of price; lower is better. The token's own price (echo) is the honest benchmark: NFV beats it by 1–2% on point error except at the Sunday-night restart, where it loses by 0.4%. The band is what echo doesn't have.

| When the forecast is made | Stale oracle (last close) | On-chain echo | **Nightshift NFV** | 90% band coverage |
|---|---|---|---|---|
| All gaps | 165.2 | 129.9 | **128.6** (−22.1% vs stale, −1.0% vs echo) | 88.7% |
| Weekend, fully dark | 169.1 | 166.7 | **163.3** (−3.4%, −2.0%) | 86.6% |
| Holiday, fully dark | 160.9 | 151.4 | **148.1** (−8.0%, −2.2%) | 89.6% |
| Sunday-night restart | 169.1 | **94.2** | 94.6 (−44.0%, +0.4%) | 89.0% |
| Weekday overnight | 162.6 | 112.3 | **112.0** (−31.2%, −0.3%) | 90.4% |

**Live**, every official open scored automatically (forecasts committed in the pre-open rounds):

| Open | Forecasts | Stale oracle | On-chain echo | **NFV** | NFV 90% band coverage |
|---|---|---|---|---|---|
| Oct 8, 2026 | 261 | 120.8 | 61.9 | **61.7** (−49%) | 96.6% |
| Oct 9, 2026 | 3,045 | 148.6 | 103.6 | **102.9** (−31%) | 85.2% |

Two findings we didn't expect:
- **Weekend token prices are only weakly informative.** Echoing them mid-weekend can be worse than the stale close.
- **Company-specific after-hours moves carry into Monday in full** (learned weight 1.19). Market-wide weekend drift is about 55% noise (weight 0.46).

## What's real

| Live on BSC mainnet | Built and tested, not live | Designed |
|---|---|---|
| ForecastBook commits, oracle reports, AggregatorV3 feeds, ERC-8004 identities, the weekend loan, an Agentic Wallet buy with its receipt, x402 pay-per-query (B402), 24/7 collector and scoring, Binance Web3 API feeds and their live telemetry, the website ([LIVE.md](docs/LIVE.md)) | ERC-8183 pay-for-accuracy jobs (create, fund, submit, judge, reclaim; the first open once the escrow holds U), Infinity hook (71 Foundry tests, 7 on a mainnet fork), Venus adapter (deployed; Venus itself doesn't read it) | Third-party forecasters joining the network; licensed reference data |

## Known limits

- **The point gain over the market is small.** Against the last close NFV is far better (22% overall, 3% on fully dark weekends); against the token's own price it is about 1% better (−2% on dark weekends, +0.4% worse at the Sunday-night restart). The value in the dark is the calibrated band, which is what a lender needs.
- **Server region matters.** Our first production host was in Railway's EU West region (the Netherlands, one of the event's restricted regions), and Binance answered RWA Data and tokenized-stock quotes there with 40304 (compliance restriction) from Oct 11 01:42 UTC. We moved it to Singapore at 08:33 UTC; both answer since. The oracle never depended on them: it prices from Binance spot books and BSC pools.
- **One gap in the seal record.** Five rounds were missed on Fri Oct 9, 7:30 to 10:30 p.m. ET. Every 30-minute round since then is sealed. Each restart also seals one extra round at startup, so a few rounds sit off the half-hour.
- **One reporter key.** The consensus is computed off-chain from the sealed forecasts and posted by the Scorer's key, which also owns the oracle. Each forecast is verifiable against its root, and [/verify](https://nightshift-oracle.vercel.app/verify) recomputes NVDAB's posted price in the browser from the three sealed forecasts and the published weights (a weighted geometric mean; it matches to 1e-11). The contract doesn't enforce that yet, and the weights are published by our API, not on-chain.
- **The bands undercover slightly.** That's 86.6% in the weekend-dark backtest and 85.2% on the Oct 9 open, against a 90% target. They are refit as live opens are scored.
- **No forecaster has been paid yet.** Scores are published every open; ERC-8183 jobs start once the escrow is funded with U.
- **About 17 weekends of history** exist so far.
- **Reference opens and closes come from a public source** in this build. Production would use a licensed feed.
- **Pre-IPO tokens are excluded automatically** (SpaceX, Cerebras, Quantinuum): they have no public reference, and their tickers collide with unrelated listed securities.

## Binance Web3 + BNB stack, and how we use it

Live call counts, latency and every outcome code for each module: **[/stack](https://nightshift-oracle.vercel.app/stack)** (from the SDK's own telemetry, `GET /v1/stack`).

| Module | In production? | Use | Unexpected use |
|---|---|---|---|
| RWA Data | yes (`/rwa/price` every 30 s, `/rwa/underlying-market` every 5 min; refused with 40304 while the server sat in the Netherlands, Oct 11 01:42–08:33 UTC) | token prices; session status, reference price, `tokenToShareRatio` | sizes the quote ladder's sell side (BSC pool prices as the fallback) |
| Trading | yes (`/aggregator/quote` every 10 min; `approve-transaction`, `swap` for our trades; RFQ) | quotes and our swaps | a $100 / $1k / $10k quote ladder on every token around the clock: a 24/7 probe of executable price and depth; RFQ refusals as a session signal |
| Transaction | yes, for our trades (`broadcast-transaction`) | broadcast with MEV protection | every broadcast becomes a receipt priced per real share against fair value |
| b402 | in production: `GET /x402/fair-value/{symbol}` answers 402 with $0.01 in U, USD1 or USDT, settled by the B402 facilitator; no payment settled yet | pay-per-query fair value | an Agentic Wallet pays an oracle (`scripts/x402-buy.mjs`) |
| Market, Wallet, DeFi | SDK only (typed, tested) | not called by the running engine, which reads candles and books from Binance spot and pools from DexScreener | – |
| Agentic Wallet + Skills | yes (a real `baw` buy with its receipt) | `baw` orders, x402 payment | a skill that turns "buy NVIDIA" into the cheapest real share, checked against the band |
| Agent Studio / `@bnbagent/sdk` | yes (5 ERC-8004 identities; ERC-8183 jobs once funded) | ERC-8004 identities, ERC-8183 jobs | a pay-for-accuracy forecasting market with an independent scorer |

## Quick start

```bash
pnpm install
pnpm exec tsx packages/tape/src/backfill.ts && pnpm collect     # tape: history + 24/7 collector
pnpm exec tsx packages/network/src/runner.ts                   # the Night Shift: rounds, scoring, publishing
pnpm exec tsx packages/api/src/server.ts                       # API on :8787
```

- Reproduce the science: `pnpm exec tsx packages/nfv/src/study-v2.ts`.
- Regenerate the live proof page: `pnpm exec tsx scripts/live-proof.ts`.
- Hosting: the website is static on Vercel's edge (`apps/web/scripts/vercel-output.mjs`, `pnpm --filter @nightshift/web vercel`), and one Railway service runs the engine, the database and the API (`railway.json`, `deploy/railway/`). Vercel proxies `/v1`, `/x402`, `/mcp` and `/.well-known` to it, so everything answers on one domain.

Tests:
- `pnpm test`: TypeScript tests (calendar, CRPS closed forms vs numerical integration, provenance segment bounds incl. DST and holidays, Merkle commitments, receipts, oracle posting policy, plus the SDK's 110).
- `forge test` in `contracts-hooks/`: 71 tests, 7 of them on a BSC mainnet fork against PancakeSwap's live Infinity contracts.
- `forge test` in `contracts/`: oracle, ForecastBook, credit, with fuzz, invariant and fork tests.

## Repo

| Path | What's in it |
|---|---|
| `packages/core` | market calendar |
| `packages/feeds` | public sources |
| `packages/tape` | 24/7 collector |
| `packages/nfv` | model, study and live engine |
| `packages/network` | rounds, Merkle, scorer, chain (ERC-8004/8183) |
| `packages/api` | REST, SSE and MCP |
| `packages/sdk` | Binance Web3 client |
| `packages/trade` | executor and receipts |
| `contracts/` | oracle, ForecastBook, credit |
| `contracts-hooks/` | Infinity hook |
| `agents/NightshiftOracle` | Agent Studio seller |
| `skills/nightshift` | Wallet Skill |
| `docs/` | whitepaper, specs, live proof |
