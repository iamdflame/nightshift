# Developer Experience evidence log

> **For the human author of the DER.** The hackathon rejects AI-generated reports, so this file is *evidence*, not the report. It holds facts, measurements and exact doc locations collected while building Nightshift. Write the DER in your own words from your own experience (sign-up, keys, the Binance app, what confused you), and use these entries as supporting data. Add your own timestamps as you go.

## 1. Onboarding

- **Your own timeline.** Record when you opened the dev portal, created the project, got a key, and made your first successful call. Nightshift logs the first successful authenticated call automatically once the key is in `.env` (`dx_calls` table).
- The docs ship an LLM index (`/en/dev-docs/llms.txt`, `llms-full.txt`). Useful, but the agent-native **MCP server page says "Coming soon"** with no URL, package or tool list: https://web3.binance.com/en/dev-docs/agent-native/mcp-server.md
- **Auth gotcha.** The prehash must include the `/build` prefix of the path. The auth page itself calls omitting it "the #1 cause of `40102 Invalid signature`": https://web3.binance.com/en/dev-docs/authentication.md
- **Clock skew.** Timestamps are ISO-8601 with milliseconds, and the recv window defaults to 5000 ms. Stale timestamps give `40103`, and so do replays within 2× the window.

## 2. Documentation issues (page + what's wrong)

| Where | Issue |
|---|---|
| RWA Data, `platforms` (`/api/v1/dex/market/rwa/platforms`) | The `platformId` enum lists only `ondo` and `bstock`. Binance Wallet's own public RWA list (used by the Agentic Wallet skill) also has **xStocks (`type=2`)**, with 130 BSC tokens. The two sources disagree on coverage. |
| RWA Data, `underlying-market` | `marketStatus` values (premarket/regular/postmarket/overnight/closed/pause) are listed without hours, timezone or holiday semantics. You have to infer what "overnight" means. |
| Trading API, intro | "Ondo tokens unavailable outside US market hours (error 40367)" is a caveat line. It isn't in a market-hours section or exposed as a field on quotes, so routers must learn it by failing. |
| Trading API, RFQ flow | RFQ (equity tokens) needs an EIP-712 signature from the same `userWalletAddress`. That excludes contract wallets and vaults from RFQ liquidity, and the docs don't say so. |
| Transaction API, intro | The simulate endpoint's response (revert reason? gas? state diffs?) is not described on the product intro page. |
| Market API, holders / top traders | Capped at 100 records with no pagination. |
| Market API, candles | `limit` max 100 per call. Backfilling months of hourly history for about 90 tokens takes thousands of calls against a 5 RPS per-endpoint limit. |
| Agentic Wallet, limit orders | The doc lists stablecoin and native constraints but never says whether tokenized stocks are supported as `toToken`. |
| Agentic Wallet skill (Skills Hub `binance-agentic-wallet/SKILL.md`) | For a bare ticker ("buy NVIDIA") the rule is *"ask user which provider first"*. The user is asked to choose between NVDAB, NVDAon and NVDAx with no data. Nightshift measured an **83 bps per-share difference** between them on Oct 8 premarket. |

(The `packages/sdk/README.md` "Doc issues found" section lists more, found while implementing every endpoint.)

## 3. API behavior and pitfalls (measured)

- **Rate limits:** 1200/60 s per key and IP, 6000/60 s per user, 5 RPS per endpoint by default. HTTP 429 comes with `Retry-After`.
- **Latency and error rates per endpoint:** from Nightshift's telemetry (`dx_calls`) once the key is configured. `pnpm exec tsx packages/sdk/scripts/smoke.ts` prints a latency table.
- **First live authenticated run: Sat Oct 10 2026, 18:28 UTC.** 9 of 9 endpoints returned 200 on the first try, with no retries, no signature errors, and a 34 ms clock offset vs the server.
  - Latency: 467–493 ms for most calls; `rwa/platforms` 953 ms; `pre-transaction/gas-price` 1058 ms. Every response carries a `requestId`.
- **Live responses vs the documented schemas** (the SDK validates every response):
  - `market/rwa/tokens`: `statusInfo.marketStatus` came back `null` on every row checked, and `marketCap` was `null` on some rows. The docs type both as strings.
  - `market/rwa/underlying-market` (NVDAB, Saturday): `marketStatus`, `referencePrice`, `avgDailyVolume1Y`, `totalShares` and `turnoverRate` were all `null`. So the reference price is missing exactly when the market is closed, when you'd most want it.
  - `aggregator/quote`: each `dexRouterList[].fromToken`/`toToken` carries 4 undocumented fields: `decimal`, `isHoneyPot`, `taxRate`, `tokenUnitPrice`.
  - The quote vendor for USDT→NVDAB on Saturday was `LiquidMesh`.
- **Public RPC quirks on BSC** (relevant to anyone verifying trades):
  - `bsc-rpc.publicnode.com` returned "Invalid parameters" for `eth_getTransactionReceipt` on fresh transactions that `bsc-dataseed.bnbchain.org` served fine.
  - `eth_getLogs` over 1,500 blocks failed on bnbchain dataseed with `-32005 limit exceeded`; 100–200 block windows worked.

- **RWA `price` with many tokens** (Oct 11, 00:33 UTC): `GET /api/v1/dex/market/rwa/price` with 165 `tokenContractAddresses` in the query string returned **HTTP 414 (URI Too Long) with no API envelope**, so our client could only report "HTTP 414 without a recognizable API envelope". The docs state no batch limit; batches of 20 work. Our collector logged this error every 30 s for hours before we noticed.
- **`referencePrice` on a weekend** (Sat Oct 10 – Sun Oct 11 UTC, 330 readings of 165 bStock and Ondo tokens): `referencePrice` was the token's own `tokenPrice` divided by its shares-per-token ratio in **330 of 330** readings (identical to `tokenPrice` in the 204 where the ratio is 1). With the US market closed, the "reference" is derived from the token itself, not from the underlying stock, and the docs do not say so.

## 4. Tokenized-stock specifics (measured by Nightshift)

| Topic | Measurement |
|---|---|
| Issuer coverage on BSC | 91 bStocks, 458 Ondo, 130 xStocks tokens. 74 tickers exist as both a bStock and an Ondo token. |
| Liquidity | NVDAB: $6.4M in the top PancakeSwap pool, 9+ pools, and also a 24/7 Binance spot book (1-cent spread). NVDAon: about $9.7k AMM on BSC. NVDAx: about $24. |
| Same token, different pools | One NVDAB pool priced 55 bps away from the others (DexScreener snapshot, Oct 8). |
| Same stock, different issuer | Oct 8 premarket: NVDAon $237.18 per share vs NVDAB $235.21, **+83 bps** (`/v1/which/NVDA`). |
| Real trade cost vs fair value | A real $2,451 NVDAB sale on Oct 8 premarket sold **11.1 bps below** Nightshift fair value; a $10 sale sold 5.5 bps above it (`/v1/receipts/{tx}`). |
| Market-hours behavior | Only the regular session (19% of the week) has deep price discovery. Weekend gaps over a year: NVDA worst −3.23%, MSTR −6.68%, SOXL −16.66% (`docs/venus-weekend-risk.md`). |
| On-chain vs reference gap | Fully dark hours: the token price barely predicts the next open (CRPS 166.7 vs 169.1 for a stale close). Once overnight/premarket venues are live, it beats the stale close by 44% (`docs/whitepaper.md`). |
| Internal consistency | Leveraged pairs agree with their base within 0.7–4.4 bps (TQQQ/QQQ, INTW/INTC, KORU/EWY). SOXL vs SMH differs by about 35 bps because they track different indexes (`/v1/identities`). |
| Pre-IPO tokens | SPCX (SpaceX), CBRS (Cerebras), QNT (Quantinuum) have no public reference, and their tickers collide with unrelated listed securities on public data sources. Easy to misprice. |

## 5. AI stack (Agentic Wallet, Wallet Skills, Agent Studio)

- `@bnbagent/sdk` 0.6.0: the ERC-8183 facade `createJob` has no `evaluator` parameter. It always routes through BNB's EvaluatorRouter and OptimisticPolicy; a custom evaluator needs the lower-level `CommerceClient`. This is not explained in the README.
- The ERC-8183 payment token on BSC mainnet is **U (United Stables)**, `0xcE24439F2D9C6a2289F741120FE202248B666666`. It is fetched at runtime and not stated in the docs pages.
- The ERC-8004 `AgentIdentity` registry on BSC: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (verified on-chain).
- **Agentic Wallet setup log (Oct 10, UTC):**
  - `npx skills add …/binance-agentic-wallet` installed the skill (v1.12.0). The installer's own security panel flagged it: Gen "Safe", Socket "1 alert", Snyk "Med Risk", with no detail shown in the terminal.
  - The skill auto-installs nothing until first use. `baw` had to be installed separately (`npm install -g @binance/agentic-wallet@1.10.0`), and npm warned that `@github/keytar`'s install script was not allowed.
  - The first sign-in code expired (5-minute TTL, `AUTH_REJECTED 10002004`) before it was scanned. The second attempt (23:53 UTC) succeeded.
  - Defaults after sign-in: `dailyLimit` **$50,000**, `abnormalTxnHandling` AutoReject, `tradeAllTokens` false, Developer Mode off, x402 limit $20/day, session 48 h.
  - One EVM address is shared by BSC, Ethereum, Base, Arbitrum, Polygon and Robinhood Chain.
- **Your own experience:** QR sign-in, limits setup, developer mode, `baw` commands, the skill install. Write what worked and what didn't.

## 6. Redesign suggestions and requested capabilities (seed ideas: rewrite in your words)

- Resolve bare tickers by data, not by asking the user. Expose per-share price across issuers (we built `/v1/which`).
- A first-class market-hours/session field on Trading API quotes, plus an RFQ availability flag.
- A dark-hours fair value plus band in the RWA Data API, so lenders and routers stop using stale closes.
- Pagination for holders and top traders; larger candle pages.
- Ship the MCP server.
