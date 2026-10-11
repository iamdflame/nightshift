# Nightshift, live on BSC mainnet

Generated 2026-10-11T04:17:40Z from `https://nightshift-production-f4e3.up.railway.app/v1/onchain` (`pnpm exec tsx scripts/live-proof.ts https://nightshift-production-f4e3.up.railway.app`), which lists only transaction hashes the system recorded. Every link opens on BscScan; no wallet needed. The always-current version is the site's [On-chain proof](https://nightshift-production-f4e3.up.railway.app/proof) page, and any sealed forecast can be checked from your browser at [/verify](https://nightshift-production-f4e3.up.railway.app/verify).

## Contracts

Deployed at block 126,929,397.

| Contract | Address | What it does |
|---|---|---|
| ForecastBook | [`0xa04fE9e7F0289c9fC5b00e0eE972Cbd00a203212`](https://bscscan.com/address/0xa04fE9e7F0289c9fC5b00e0eE972Cbd00a203212) | Forecasters commit a Merkle root of every forecast before the open |
| NightshiftOracle | [`0x0cEe7C0F2B62421E54c5F2E618dC53CC7eD4c63d`](https://bscscan.com/address/0x0cEe7C0F2B62421E54c5F2E618dC53CC7eD4c63d) | Consensus fair value + 90% next-open band per token |
| NightshiftCredit | [`0x49c79D9D4c68a6fB8e9A34b828d36B7A38E2762e`](https://bscscan.com/address/0x49c79D9D4c68a6fB8e9A34b828d36B7A38E2762e) | Borrow USDT against bStocks 24/7, valued at the band's lower edge |
| NightshiftVenusOracle | [`0x1a92c4Dc8264ebC2E6F3984a963AF5a4054FaC23`](https://bscscan.com/address/0x1a92c4Dc8264ebC2E6F3984a963AF5a4054FaC23) | Venus OracleInterface adapter over the same reports |
| AggregatorV3 feed: NVDAB | [`0x0098192690f14749Ec81f636dc0a01f4893463E2`](https://bscscan.com/address/0x0098192690f14749Ec81f636dc0a01f4893463E2) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: QQQB | [`0xbc13Ed36C0B5Df70240B2DD9B9DdEF42A02000Bd`](https://bscscan.com/address/0xbc13Ed36C0B5Df70240B2DD9B9DdEF42A02000Bd) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: AAPLB | [`0xAc79cc76aFD2951341cAB1Bb2434531F191EfaE1`](https://bscscan.com/address/0xAc79cc76aFD2951341cAB1Bb2434531F191EfaE1) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: COINB | [`0x3C47D44AE59aFc31Ba987307Bb0eB1c6d61050E1`](https://bscscan.com/address/0x3C47D44AE59aFc31Ba987307Bb0eB1c6d61050E1) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: TSLAB | [`0x1fe58aFF5d62F4Eb64F288bB1874f8B5637d7184`](https://bscscan.com/address/0x1fe58aFF5d62F4Eb64F288bB1874f8B5637d7184) | Chainlink-compatible `latestRoundData()` |
| AggregatorV3 feed: SPYB | [`0xc802E950C41a0aCded5987D5062f006f47ED1E0a`](https://bscscan.com/address/0xc802E950C41a0aCded5987D5062f006f47ED1E0a) | Chainlink-compatible `latestRoundData()` |

## Agents (ERC-8004 identities)

| Agent | Agent ID | Wallet | Registration |
|---|---|---|---|
| Nightshift Scorer | 370890 | [`0x6890d02b614aeD8466d30F3642afd193e952f19e`](https://bscscan.com/address/0x6890d02b614aeD8466d30F3642afd193e952f19e) | [tx](https://bscscan.com/tx/0x99e5a9d2c2dd1af645ac54febab2e59b21f22cfe02c5df21fb3677389ccd8840) |
| Forecaster: Anchor | 370891 | [`0x4feD3C73DE4392299747bf976749586b96D2C9e8`](https://bscscan.com/address/0x4feD3C73DE4392299747bf976749586b96D2C9e8) | [tx](https://bscscan.com/tx/0x83193f23f5653058c35e34d5c9f85502f05933b1774e54a062c32374070c4d8d) |
| Forecaster: Echo | 370892 | [`0x11Cff8165119475Bc7f76ef755f4c0b7e33C0183`](https://bscscan.com/address/0x11Cff8165119475Bc7f76ef755f4c0b7e33C0183) | [tx](https://bscscan.com/tx/0x775c4d8ab30431a0554641857b7d6ba1733b4882347cd1b4b996a096396dccf0) |
| Forecaster: NFV | 370893 | [`0xed958842c7477E76d926E4B08130a0b5C2DCbd99`](https://bscscan.com/address/0xed958842c7477E76d926E4B08130a0b5C2DCbd99) | [tx](https://bscscan.com/tx/0x54514477ed6bbc9ef090330ecd67d28d9a59aca9fde9dd91dbb230234426f9db) |
| Nightshift Trade | 370894 | [`0xd8aCAE17c151Fe640EB83593F69ff44678427Ee7`](https://bscscan.com/address/0xd8aCAE17c151Fe640EB83593F69ff44678427Ee7) | [tx](https://bscscan.com/tx/0xd197f389e8734a2acade99f8d7712b6ce6b12e499626139ca6895ea00c3bf15e) |

## Proof of foresight (ForecastBook)

Each row: a forecaster's Merkle roots, each covering its forecasts for every bStock, committed **before** that open. Any single forecast can be checked against its root with `/v1/rounds/{round}/proof/{forecaster}/{token}`, or on the site's verify page.

| Open (UTC) | Forecaster | Roots committed | Latest commit |
|---|---|---|---|
| 2026-10-12T13:30:00Z | anchor | 64 (rounds 29859690–29861532) | [tx](https://bscscan.com/tx/0x4cdac4191a55d3f4389396d8177338afa898ef9331ad9cabda132317e41593d0) |
| 2026-10-12T13:30:00Z | echo | 64 (rounds 29859690–29861532) | [tx](https://bscscan.com/tx/0x642914edecea2c901524e2b0d6f9ba58faf5f2c43f5be72b604bcaf5b38749a1) |
| 2026-10-12T13:30:00Z | nfv | 64 (rounds 29859690–29861532) | [tx](https://bscscan.com/tx/0x52951d5814f72deeee2267457be1d34bf53da113d4222fe6924dba6e068a3bea) |

## Oracle reports (NightshiftOracle)

153 reports in 12 transactions so far. The most recent:

| Token | Round | Fair value | 90% next-open band | Posted | Tx |
|---|---|---|---|---|---|
| AAPLB | 29861532 | $336.13 | $333.63 – $338.24 | 2026-10-11T04:12:53Z | [tx](https://bscscan.com/tx/0x67205f6f7a38859f31a80d4b8dc4a1e7fb33b089328c37d6073046ae54424781) |
| COINB | 29861532 | $180.24 | $171.82 – $187.62 | 2026-10-11T04:12:53Z | [tx](https://bscscan.com/tx/0x67205f6f7a38859f31a80d4b8dc4a1e7fb33b089328c37d6073046ae54424781) |
| NVDAB | 29861532 | $229.90 | $225.09 – $234.01 | 2026-10-11T04:12:53Z | [tx](https://bscscan.com/tx/0x67205f6f7a38859f31a80d4b8dc4a1e7fb33b089328c37d6073046ae54424781) |
| QQQB | 29861532 | $751.01 | $741.78 – $758.84 | 2026-10-11T04:12:53Z | [tx](https://bscscan.com/tx/0x67205f6f7a38859f31a80d4b8dc4a1e7fb33b089328c37d6073046ae54424781) |
| SPYB | 29861532 | $778.66 | $773.45 – $783.07 | 2026-10-11T04:12:53Z | [tx](https://bscscan.com/tx/0x67205f6f7a38859f31a80d4b8dc4a1e7fb33b089328c37d6073046ae54424781) |
| TSLAB | 29861532 | $382.51 | $375.95 – $388.10 | 2026-10-11T04:12:53Z | [tx](https://bscscan.com/tx/0x67205f6f7a38859f31a80d4b8dc4a1e7fb33b089328c37d6073046ae54424781) |
| ALABB | 29861520 | $341.49 | $324.19 – $356.71 | 2026-10-11T04:00:03Z | [tx](https://bscscan.com/tx/0x3448f317151f03dc314afbc66d6553bda235bab4c4514db732fcb160ff274b6f) |
| ASTSB | 29861520 | $50.76 | $49.16 – $52.14 | 2026-10-11T04:00:03Z | [tx](https://bscscan.com/tx/0x3448f317151f03dc314afbc66d6553bda235bab4c4514db732fcb160ff274b6f) |
| CYPHB | 29861499 | $2.96 | $2.77 – $3.14 | 2026-10-11T03:39:29Z | [tx](https://bscscan.com/tx/0xaeeef02630c43b6d485d699cdaf901f9aa522355fb90488b1837e8e58d2c285f) |
| MVLLB | 29861499 | $38.48 | $33.99 – $42.70 | 2026-10-11T03:39:29Z | [tx](https://bscscan.com/tx/0xaeeef02630c43b6d485d699cdaf901f9aa522355fb90488b1837e8e58d2c285f) |
| SOXLB | 29861499 | $139.36 | $126.05 – $151.60 | 2026-10-11T03:39:29Z | [tx](https://bscscan.com/tx/0xaeeef02630c43b6d485d699cdaf901f9aa522355fb90488b1837e8e58d2c285f) |
| SOXSB | 29861499 | $34.42 | $30.88 – $37.71 | 2026-10-11T03:39:29Z | [tx](https://bscscan.com/tx/0xaeeef02630c43b6d485d699cdaf901f9aa522355fb90488b1837e8e58d2c285f) |

## The weekend loan (NightshiftCredit)

- Bought NVDAB through the Binance Trading API: bought 30.6 bps above fair value (inside the 90% band) (2026-10-11T01:59:52.958Z): [tx](https://bscscan.com/tx/0xdcdbfbf38d670a309470f425a5577007fe2d394cadfd928e6cd1870567ff7899)
- Treasury lent 1.5 USDT into the vault (2026-10-11T01:59:56.945Z): [tx](https://bscscan.com/tx/0x9cbd79dc356c6fd1d69a0207e25f8ce1270fbf566faeb34380b4ad55d811b552)
- Posted 0.021688495019914266 NVDAB as collateral (2026-10-11T02:00:00.498Z): [tx](https://bscscan.com/tx/0x598810e2d6a615097156dad39cdaedba79f9bbfaf6dc86991ee2c56f77186c8f)
- Borrowed 0.976123655474072564 USDT against it (2026-10-11T02:00:02.782Z): [tx](https://bscscan.com/tx/0xffabd4d1f2f6768850c175c19b3aa7a89b7c16efb3c71bc21f38521194f91982)

Collateral is valued at **$225.03** (the lower edge of the 90% band for Monday's open), not the $229.84 fair value. Health factor 3.25.

## Binance Agentic Wallet trades (Wallet Skill + receipts)

| Trade | Price paid | Fair value at that moment (90% band) | Receipt verdict | Tx |
|---|---|---|---|---|
| $5 → 0.021679 NVDAB from [`0x43Cf3295a41Fc70B215763a47ec36874604EbaD1`](https://bscscan.com/address/0x43Cf3295a41Fc70B215763a47ec36874604EbaD1) | $230.64 | $229.84 ($225.03 – $233.95), round 29861375 | bought 34.7 bps above fair value (inside the 90% band) | [tx](https://bscscan.com/tx/0xbd77806a9c274aa9d3609df15c856f37ef61ff85f843511371140897a02af92a) |

Receipts are rebuilt from the chain's Transfer logs: `GET /v1/receipts/{tx}?trader={wallet}`; the `receiptHash` pins every number.

## Pay-for-accuracy (ERC-8183 jobs on BNB's commerce contracts)

_No jobs on-chain yet: they open once the escrow holds U. Until then the scores below are published, not paid._

## Scored by reality (every official open since Oct 8)

CRPS and MAE in basis points of price, lower is better; coverage = share of opens inside the 90% band.

| Open (UTC) | Forecaster | Forecasts | CRPS | MAE | 90% band coverage |
|---|---|---|---|---|---|
| 2026-10-09T13:30:00Z | anchor | 3045 | 148.6 | 212.5 | 77.0% |
| 2026-10-09T13:30:00Z | echo | 3045 | 103.6 | 138.2 | 79.1% |
| 2026-10-09T13:30:00Z | nfv | 3045 | 102.9 | 137.2 | 85.2% |
| 2026-10-08T13:30:00Z | anchor | 261 | 120.8 | 177.5 | 92.0% |
| 2026-10-08T13:30:00Z | echo | 261 | 61.9 | 77.8 | 92.0% |
| 2026-10-08T13:30:00Z | nfv | 261 | 61.7 | 78.3 | 96.5% |

