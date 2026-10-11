# Nightshift, live on BSC mainnet

Generated 2026-10-11T01:39:11.726Z from `deployments/*.json` and the transaction hashes the system recorded (`pnpm exec tsx scripts/live-proof.ts`). Every link opens on BscScan; no wallet needed.

## Contracts

| Contract | Address | What it does |
|---|---|---|
| ForecastBook | [`0xa04fE9e7F0289c9fC5b00e0eE972Cbd00a203212`](https://bscscan.com/address/0xa04fE9e7F0289c9fC5b00e0eE972Cbd00a203212) | Forecasters commit a Merkle root of every forecast before the open (proof of foresight), then reveal |
| NightshiftOracle | [`0x0cEe7C0F2B62421E54c5F2E618dC53CC7eD4c63d`](https://bscscan.com/address/0x0cEe7C0F2B62421E54c5F2E618dC53CC7eD4c63d) | Consensus fair value + 90% next-open band per token, posted by the Scorer |
| NightshiftCredit | [`0x49c79D9D4c68a6fB8e9A34b828d36B7A38E2762e`](https://bscscan.com/address/0x49c79D9D4c68a6fB8e9A34b828d36B7A38E2762e) | Borrow USDT against bStocks 24/7; collateral counts at the band's lower edge |
| NightshiftVenusOracle | [`0x1a92c4Dc8264ebC2E6F3984a963AF5a4054FaC23`](https://bscscan.com/address/0x1a92c4Dc8264ebC2E6F3984a963AF5a4054FaC23) | Venus `OracleInterface` adapter over the same reports |
| AggregatorV3 feed: NVDAB | [`0x0098192690f14749Ec81f636dc0a01f4893463E2`](https://bscscan.com/address/0x0098192690f14749Ec81f636dc0a01f4893463E2) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: QQQB | [`0xbc13Ed36C0B5Df70240B2DD9B9DdEF42A02000Bd`](https://bscscan.com/address/0xbc13Ed36C0B5Df70240B2DD9B9DdEF42A02000Bd) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: AAPLB | [`0xAc79cc76aFD2951341cAB1Bb2434531F191EfaE1`](https://bscscan.com/address/0xAc79cc76aFD2951341cAB1Bb2434531F191EfaE1) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: COINB | [`0x3C47D44AE59aFc31Ba987307Bb0eB1c6d61050E1`](https://bscscan.com/address/0x3C47D44AE59aFc31Ba987307Bb0eB1c6d61050E1) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: TSLAB | [`0x1fe58aFF5d62F4Eb64F288bB1874f8B5637d7184`](https://bscscan.com/address/0x1fe58aFF5d62F4Eb64F288bB1874f8B5637d7184) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: SPYB | [`0xc802E950C41a0aCded5987D5062f006f47ED1E0a`](https://bscscan.com/address/0xc802E950C41a0aCded5987D5062f006f47ED1E0a) | Chainlink-compatible `latestRoundData()` |

## Proof of foresight (ForecastBook)

Each row: a forecaster's Merkle roots committed **before** that open. Any single forecast can be checked against its root with `/v1/rounds/{round}/proof/{forecaster}/{token}`.

| Open (UTC) | Forecaster | Rounds committed | Latest commit |
|---|---|---|---|
| 2026-10-12T13:30:00Z | anchor | 22 (rounds 29859690–29860470) | [tx](https://bscscan.com/tx/0xfc5fe46d40a1ed74d0dffea606f70f48f779b92e05b7b63037b4d8bb29ecaff2) |
| 2026-10-12T13:30:00Z | echo | 21 (rounds 29859690–29860440) | [tx](https://bscscan.com/tx/0xff2debf8ec52f3c2d9a8100e558e8c39191cd26b33aeef360822fd484ca21cbd) |
| 2026-10-12T13:30:00Z | nfv | 21 (rounds 29859690–29860440) | [tx](https://bscscan.com/tx/0xec65903b4c6da5efccf428994e5db721da6eb25f4ed29cb631b8150a6fe16c42) |

## Oracle reports (NightshiftOracle)

91 reports in 3 transactions so far. Latest per token (first 12):

| Token | Round | Fair value | 90% next-open band | Posted | Tx |
|---|---|---|---|---|---|
| AAOIB | 29861340 | $110.48 | $103.61 – $116.59 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xf3eccf59bb9a12db99530f374e8081baeab3ff58c9f4278a3d89f22dd28a2a37) |
| AAPLB | 29861340 | $336.15 | $333.65 – $338.26 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xf3eccf59bb9a12db99530f374e8081baeab3ff58c9f4278a3d89f22dd28a2a37) |
| ADBEB | 29861340 | $241.06 | $234.50 – $246.70 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xf3eccf59bb9a12db99530f374e8081baeab3ff58c9f4278a3d89f22dd28a2a37) |
| AGPUB | 29861340 | $11.97 | $11.71 – $12.20 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xfb60c2c4b9bd23d2e4caa00ae2fd7944c693ffad61ece1b66ceefaf6b37d9e6a) |
| ALABB | 29861340 | $342.45 | $325.11 – $357.71 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xf3eccf59bb9a12db99530f374e8081baeab3ff58c9f4278a3d89f22dd28a2a37) |
| AMATB | 29861340 | $507.84 | $486.23 – $526.69 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xfb60c2c4b9bd23d2e4caa00ae2fd7944c693ffad61ece1b66ceefaf6b37d9e6a) |
| AMCB | 29861340 | $2.96 | $2.90 – $3.02 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xfb60c2c4b9bd23d2e4caa00ae2fd7944c693ffad61ece1b66ceefaf6b37d9e6a) |
| AMDB | 29861340 | $608.81 | $587.24 – $627.52 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xfb60c2c4b9bd23d2e4caa00ae2fd7944c693ffad61ece1b66ceefaf6b37d9e6a) |
| AMZNB | 29861340 | $262.38 | $257.71 – $266.36 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xf3eccf59bb9a12db99530f374e8081baeab3ff58c9f4278a3d89f22dd28a2a37) |
| ARMB | 29861340 | $266.59 | $253.81 – $277.80 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xfb60c2c4b9bd23d2e4caa00ae2fd7944c693ffad61ece1b66ceefaf6b37d9e6a) |
| ASMLB | 29861340 | $1784.27 | $1727.11 – $1833.67 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xfb60c2c4b9bd23d2e4caa00ae2fd7944c693ffad61ece1b66ceefaf6b37d9e6a) |
| ASTSB | 29861340 | $50.92 | $49.32 – $52.30 | 2026-10-11T01:00:01.440Z | [tx](https://bscscan.com/tx/0xf3eccf59bb9a12db99530f374e8081baeab3ff58c9f4278a3d89f22dd28a2a37) |

## Binance Agentic Wallet trades (Wallet Skill + receipts)

| Trade | Price paid | Fair value at that moment (90% band) | Receipt verdict | Tx |
|---|---|---|---|---|
| $5 → 0.021679 NVDAB from [`0x43Cf3295a41Fc70B215763a47ec36874604EbaD1`](https://bscscan.com/address/0x43Cf3295a41Fc70B215763a47ec36874604EbaD1) | $230.64 | $229.84 ($225.03 – $233.95), round 29861375 | bought 34.7 bps above fair value (inside the 90% band) | [tx](https://bscscan.com/tx/0xbd77806a9c274aa9d3609df15c856f37ef61ff85f843511371140897a02af92a) |

Receipts are rebuilt from the chain's Transfer logs: `GET /v1/receipts/{tx}?trader={wallet}`; the `receiptHash` pins every number.

## Scored by reality (every official open since Oct 8)

CRPS and MAE in basis points of price, lower is better; coverage = share of opens inside the 90% band.

| Open (UTC) | Forecaster | Forecasts | CRPS | MAE | 90% band coverage |
|---|---|---|---|---|---|
| 2026-10-09T13:30:00Z | anchor | 3045 | 148.6 | 212.5 | 77.0% |
| 2026-10-09T13:30:00Z | echo | 3045 | 103.6 | 138.2 | 79.1% |
| 2026-10-09T13:30:00Z | nfv | 3045 | 102.9 | 137.2 | 85.2% |
| 2026-10-08T13:30:00Z | anchor | 261 | 120.8 | 177.5 | 92.0% |
| 2026-10-08T13:30:00Z | echo | 261 | 61.9 | 77.8 | 92.0% |
| 2026-10-08T13:30:00Z | nfv | 261 | 61.7 | 78.3 | 96.6% |

