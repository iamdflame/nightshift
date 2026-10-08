# Nightshift contracts

The on-chain layer of Nightshift for BNB Smart Chain. AI aggregator agents post a **fair value plus a calibrated
5–95% band for the next US regular-session open** for each tokenized stock (bStocks such as NVDAB). Everything else
reads that report: a Chainlink-compatible feed per token, a Venus oracle adapter, a forecast commit registry, and a
lending market that values collateral at the band's lower edge so a weekend loan survives Monday's gap.

The report format and adapter semantics are defined in [`specs/fair-value-feed-v1.md`](specs/fair-value-feed-v1.md).
This document covers the implementation in [`contracts/`](../contracts).

## Contents

1. [Architecture](#architecture)
2. [Contracts](#contracts)
3. [Units and conventions](#units-and-conventions)
4. [Parameters and rationale](#parameters-and-rationale)
5. [Credit market mechanics](#credit-market-mechanics)
6. [ForecastBook leaf encoding and test vector](#forecastbook-leaf-encoding-and-test-vector)
7. [Threat model](#threat-model)
8. [Build, test, deploy](#build-test-deploy)
9. [Test suite](#test-suite)
10. [Gas and sizes](#gas-and-sizes)
11. [Known limitations](#known-limitations)

## Architecture

```
            aggregator agents (reporters)                         forecaster agents
                       |  postReports(tokens[], reports[])               |  commit / reveal
                       v                                                  v
               +------------------+                              +----------------+
               | NightshiftOracle |  createFeed(token) --CREATE2-->| ForecastBook   |
               |  latest Report   |-----------------------+      | Merkle roots,  |
               |  per token       |                       |      | ERC-8004 links |
               +------------------+                       v      +----------------+
                 |        |        \             +-----------------+
   tryGetReport  |        | getReport \          | NightshiftFeed  |  Chainlink AggregatorV3
                 v        v            \         | (one per token) |  answer = fairValue, band()
   +------------------+  +----------------------+ +-----------------+
   | NightshiftCredit |  | NightshiftVenusOracle|
   | ERC-4626 USDT    |  | getPrice(asset)      |  Venus OracleInterface, 1e(36 - decimals)
   | vault + bStock   |  +----------------------+
   | collateral       |
   +------------------+
```

| File | Role |
|---|---|
| `src/interfaces/INightshiftOracle.sol` | The spec interface, verbatim, plus `INightshiftOracleExtended` (`tryGetReport`, `isFresh`). |
| `src/NightshiftOracle.sol` | Report store, reporter allowlist, CREATE2 feed factory. |
| `src/NightshiftFeed.sol` | Chainlink `AggregatorV3Interface` adapter for one token, plus `band()`. |
| `src/NightshiftVenusOracle.sol` | Venus `OracleInterface.getPrice` adapter with staleness and flag gates. |
| `src/ForecastBook.sol` | Commit/reveal registry: proof that a forecast existed before the open it predicts. |
| `src/NightshiftCredit.sol` | Isolated lending market (ERC-4626 lenders, multi-collateral borrowers). |
| `src/libraries/ReportLib.sol` | Flag and session constants, freshness and band helpers shared by consumers. |
| `script/Deploy.s.sol` | Env-driven deployment of everything, writes `deployments/<chainid>.json`. |

Toolchain: Solidity 0.8.33 (sources `^0.8.26`), optimizer 200 runs, no `via_ir`, `evm_version = cancun`. BSC
mainnet runs the Cancun opcodes this bytecode relies on: `eth_call` probes of TSTORE/TLOAD (the transient
reentrancy guard) and MCOPY (emitted by solc) both execute, while a control `INVALID` opcode errors. OpenZeppelin
Contracts 5.7.0 and forge-std 1.17.0 are pinned through Soldeer (`soldeer.lock`).

## Contracts

### NightshiftOracle

- **Reporters.** `setReporter(address, bool)` (owner). It reverts on no-ops (`ReporterUnchanged`) so mistakes are
  visible. `reporters()` and `isReporter()` enumerate and query the allowlist.
- **`postReports(address[] tokens, Report[] reports)`** (reporters only). The batch is atomic: one invalid report
  reverts the whole batch with an error that names the token. Each report must satisfy the spec:
  `0 < lower <= fairValue <= upper` (`InvalidPrices`), `updatedAt <= block.timestamp` (`FutureReport`),
  `anchorTime >= updatedAt` (`AnchorBeforeUpdate`), `round > lastRound` (`NonMonotonicRound`; round 0 is reserved
  for "no report"), `session <= 5` (`InvalidSession`), and one extra rule: `updatedAt >= lastUpdatedAt`
  (`NonMonotonicTimestamp`), so a token's clock can never move backwards. A token may appear more than once in a
  batch. Emits the spec's `ReportPosted` for each report.
- **Views.** `getReport` (reverts `NoReport`), `tryGetReport` (never reverts; `exists = false` and a zeroed report
  when the token has never been reported), `isFresh(token, maxAge)` (cannot overflow or underflow),
  `decimals() = 8`.
- **Feed factory.** `createFeed(token)` (owner) deploys a `NightshiftFeed` with CREATE2, `salt = token`, so there is
  one feed per token at an address you can compute in advance (`predictFeed`). `feedOf(token)` and `feedTokens()`
  give the registry. It reverts with `FeedExists`, `NotAContract` or `ZeroAddress`.
- **Ownership.** `Ownable2Step`. `renounceOwnership` is disabled (`RenounceDisabled`), because an ownerless oracle
  could not remove a compromised reporter.

### NightshiftFeed

A Chainlink `AggregatorV3Interface` view adapter for one token:

| AggregatorV3 field | Value |
|---|---|
| `roundId`, `answeredInRound` | `report.round` |
| `answer` | `int256(report.fairValue)`, 8 decimals |
| `startedAt`, `updatedAt` | `report.updatedAt` |
| `decimals()` / `version()` | `8` / `1` |
| `description()` | `"<SYMBOL> / USD (Nightshift)"`, e.g. `"NVDAB / USD (Nightshift)"` |

`getRoundData(id)` serves only the latest round, because the oracle stores only the latest report. Any other id
reverts with `RoundNotAvailable(requested, latest)`. `band()` returns `(lower, upper, anchorTime, session, flags)`,
and `latestReport()` returns the full struct. The feed only translates the report: it never filters on staleness or
flags. Chainlink consumers check `updatedAt` as usual, and Nightshift-aware consumers read `band()`.

The symbol is read once, at construction, with a bounded `staticcall` (100k gas, at most 128 bytes of return data
copied). It accepts both ABI strings and the legacy `bytes32` encoding. A symbol that reverts, is empty or
malformed, or is longer than 64 bytes falls back to the token's hex address, so a hostile token can never break
feed creation.

### NightshiftVenusOracle

`getPrice(asset)` returns `fairValue * 10^(28 - assetDecimals)`. That is the Venus convention: the USD price scaled
to `1e(36 - decimals)`. For an 18-decimal bStock it is `fairValue * 1e10`. It reverts so that a Venus
ResilientOracle falls back to its pivot or fallback source in these cases:

| Condition | Error |
|---|---|
| never reported | `NoReport` (from the oracle) |
| `block.timestamp - updatedAt > maxAge` | `StalePrice(asset, updatedAt, maxAge)` |
| `flags & 1` (corporate action / issuer pause) | `CorporateActionPaused(asset)` |
| `flags & 8` (model degraded) | `ModelDegraded(asset)` |
| `fairValue == 0` (faulty oracle) | `MalformedReport(asset)` |
| asset decimals > 28 | `UnsupportedDecimals(asset, decimals)` |

Flag bits 1 (reference stale) and 2 (thin liquidity) are informational and do not block pricing. The owner sets
`maxAge` with `setMaxAge`, where `0 < maxAge <= 7 days`.

### ForecastBook

Forecaster agents use it to prove foresight. Before an open, an agent commits the Merkle root of its whole forecast
set. Later, anyone can verify any single forecast against that root.

- `commit(round, anchorTime, root, count)`: one commitment per (forecaster, round), immutable, and only strictly
  before `anchorTime` (`CommitTooLate`). `root` and `count` must be non-zero. The block timestamp is stored as
  `committedAt`.
- `reveal(round, uri)`: called once, at any time after the commit. It publishes where the full leaf set lives (IPFS,
  HTTPS, and so on).
- `verifyForecast(forecaster, round, leaf, proof) -> bool`: never reverts. It returns true only if the commitment
  exists, `leaf.round == round`, `leaf.anchorTime == commitment.anchorTime`, and the proof checks out. The anchor
  equality is what stops a forecaster from committing after an open and passing off a "forecast" of that open.
- **ERC-8004 identity (optional).** The constructor takes an ERC-721 identity registry; `address(0)` disables
  linking. `linkAgent(agentId)` requires `registry.ownerOf(agentId) == msg.sender`. Agent id 0 is valid, and an
  unknown id gives `UnknownAgent`. `unlinkAgent()` removes the link, `linkedAgent(forecaster)` returns it, and
  `isLinkCurrent(forecaster)` detects links that went stale because the agent NFT was transferred.
- Events: `ForecastCommitted`, `ForecastRevealed`, `AgentLinked`, `AgentUnlinked`.

The leaf encoding is specified [below](#forecastbook-leaf-encoding-and-test-vector).

### NightshiftCredit

An isolated lending market that values collateral at the 5th-percentile next-open price. Lenders deposit USDT and
receive ERC-4626 shares (`nsUSDT`). Borrowers post allowlisted bStocks (up to 16 tokens market-wide, any mix per
account), borrow USDT, repay, and withdraw. The mechanics are described [below](#credit-market-mechanics).

| Function | Who | Pausable | Notes |
|---|---|---|---|
| `deposit`/`mint`/`withdraw`/`redeem` | lenders | yes | `maxWithdraw`/`maxRedeem` are capped by idle cash; every `max*` returns 0 while paused |
| `depositCollateral(token, amount, onBehalfOf)` | anyone | **no** | credits the amount actually received (fee-on-transfer safe); third parties may only top up a token the account already holds |
| `withdrawCollateral(token, amount, receiver)` | borrower | yes | without debt the oracle is never consulted; with debt the remaining position must pass the full borrow check |
| `borrow(amount, receiver)` | borrower | yes | safety gates plus `debt <= borrowing power` |
| `repay(amount, onBehalfOf)` | anyone | **no** | `type(uint256).max` (or any amount above the debt) repays exactly the debt |
| `liquidate(borrower, token, repayAmount, minSeized, receiver)` | anyone but the borrower | yes | 50% close factor, 5% bonus at fair value, `minSeized` slippage guard |
| `setCollateral`, `setBorrowRate`, `pause`/`unpause`, `skim` | owner | n/a | `skim` can only move tokens held above internal accounting |
| `maxBorrow(account)` | view | n/a | the exact largest amount `borrow` accepts right now (0 if gated or paused) |
| `getAccountData`, `isLiquidatable`, `debtOf`, `collateralOf`, ... | views | n/a | |

Every state change emits an event: `CollateralConfigured`, `BorrowRateUpdated`, `InterestAccrued`,
`CollateralDeposited`, `CollateralWithdrawn`, `Borrowed`, `Repaid`, `Liquidated`, `BadDebtRealized`, `Skimmed`, plus
OpenZeppelin's `Deposit`/`Withdraw`/`Transfer`/`Paused`/`Unpaused`/ownership events. Every failure is a custom error
that carries the values needed to diagnose it, for example `InsufficientCollateral(account, debt, borrowPower)` or
`StaleReport(token, updatedAt, maxAge)`.

## Units and conventions

| Quantity | Unit |
|---|---|
| Prices (`fairValue`, `lower`, `upper`, Feed `answer`) | USD per **token**, 8 decimals (per-share value times the token's shares-per-token multiplier) |
| Venus `getPrice` | USD per smallest unit, 1e18 precision, i.e. `1e(36 - assetDecimals)` per whole token |
| Debt, cash, `totalAssets`, borrowing power | debt-asset units (USDT on BSC: 18 decimals); 1 USDT is assumed to be 1 USD |
| Collateral amounts | the collateral token's own decimals (read once at listing, at most 36) |
| Basis points | 10_000 = 100% |
| Interest rate and borrow index | ray (1e27) |
| Health factor (`getAccountData`) | WAD (1e18); `type(uint256).max` without debt |
| Times | unix seconds (`uint64` in reports, `uint32` for `maxAge`) |

Value of `amount` collateral at `price`, in debt-asset units:
`amount * price * 10^assetDecimals / (10^(collateralDecimals + 8))`, always computed with a 512-bit `mulDiv`.

## Parameters and rationale

Defaults are the deploy script's values, which the owner can change per collateral with `setCollateral`.

| Parameter | Default | Bounds | Rationale |
|---|---|---|---|
| `baseLtvBps` | 5000 | `< liqThresholdBps` | Borrowing power is half of the collateral's value **at the band's lower edge** (the 5th-percentile next-open price). A max loan stays fully backed unless the open lands more than 50% below that already-pessimistic edge. |
| `liqThresholdBps` | 6500 | `< 10_000`; `threshold * (1 + bonus) <= 100%` | A 15-point buffer over the LTV: `lower` can fall about 23% (`1 - 50/65`) after a max borrow before the position can be liquidated, so routine band moves and interest never trigger liquidations. |
| `liqBonusBps` | 500 | `<= 2000` | A 5% incentive, paid in collateral valued at `fairValue`. On BSC a liquidation costs about 0.15M gas, so 5% is ample for any position worth more than a few dollars without over-penalizing borrowers. The `threshold * (1 + bonus) <= 100%` rule guarantees that a liquidation at the threshold never needs more collateral than exists. |
| `maxBandBps` | 1500 | `(0, 10_000]` | No new risk when the band is wider than 15% of fair value. Weekend 5–95% bands for mega-cap names are typically single-digit percent; a wider band means the model sees event risk (earnings, macro), so the market stops lending against it while repay, deposits and liquidations keep working. |
| `maxAge` | 3600 s | `(0, 7 days]` | Aggregators post every few minutes. An hour absorbs short outages while guaranteeing that new risk never rests on a stale band. |
| borrow APR | 800 bps | `<= 10_000` | A fixed rate (spec), accrued per second, set by the owner. Changing it accrues at the old rate first. |
| close factor | 50% | constant | The standard partial liquidation. It is rounded up so that dust debts can always be closed. |
| Venus `maxAge` | 3600 s | `(0, 7 days]` | Same reasoning as the collateral `maxAge`. |
| `MAX_COLLATERALS` | 16 | constant | Bounds every loop: health checks touch at most 16 tokens, so gas is bounded and a 16-bit per-account mask suffices. |
| debt asset decimals | 18 (USDT) | `<= 18` | Keeps every intermediate product far below 2^256. |

Disabled collateral (`enabled = false`) accepts no new deposits and adds no borrowing power. It still counts toward
the liquidation value, so disabling a token never makes healthy positions liquidatable. Lowering
`liqThresholdBps` does take effect immediately, so production owners belong behind a timelock (see the
[threat model](#threat-model)).

## Credit market mechanics

**Valuation rule.** For an account holding amounts `a_i` of collateral `i`, using each token's latest report:

```
borrowing power   = sum over enabled i of  a_i * lower_i * baseLtv_i          (rounded down)
liquidation value = sum over all i     of  a_i * lower_i * liqThreshold_i     (rounded down)
health factor     = liquidation value / debt;  liquidatable  <=>  liquidation value < debt
```

**Safety gates.** These apply to `borrow`, and to `withdrawCollateral` when the account has debt, for every
*enabled* collateral the account holds. The report must:

1. exist (`MissingReport`);
2. be well formed (`MalformedReport`, a defence against a faulty oracle implementation);
3. be at most `maxAge` old (`StaleReport`);
4. have no corporate-action flag, `flags & 1` (`CorporateAction`);
5. have no model-degraded flag, `flags & 8` (`DegradedReport`);
6. have a band no wider than `maxBandBps`, checked exactly as `(upper - lower) * 10_000 <= maxBandBps * fairValue`
   (`BandTooWide`, which reports the band in bps rounded up).

The checks run in that order, and the first failure reverts with its own error. All of them run before the borrowing
power is compared with the debt. `repay` and `depositCollateral` are never gated or paused, so borrowers can always
de-risk. `withdrawCollateral` without debt never reads the oracle, so an oracle outage can never trap collateral.

**Liquidation.** An account is liquidatable when its liquidation value is below its debt. That value uses each
collateral's latest report regardless of age, and a missing report counts as zero. No report state can therefore
make the check revert, and no one can shield a position by attaching collateral that has a stale report or none at
all. The seized collateral's own report must be fresh and must not be flagged corporate action. Degraded and
wide-band reports are accepted for seizures, because liquidations matter most when uncertainty is high. The
liquidator repays `min(repayAmount, ceil(debt / 2))` and receives `repaid * (1 + bonus) / fairValue` of the chosen
collateral, rounded down. If that is more than the account holds, the seizure is capped at the balance and the
repayment is reduced to the balance's value net of the bonus, rounded up. If the account is then left with debt and
no collateral at all, the remainder is written off at once (`BadDebtRealized`). The share price then drops by exactly
the shortfall, instead of `totalAssets` carrying phantom debt that early withdrawers could escape. Self-liquidation
is rejected.

**Worked example.** These numbers are from `test/NightshiftCreditLiquidation.t.sol`.

| Step | Value |
|---|---|
| Saturday report (session 4, anchor Monday 09:30 ET) | fair $236, band $220–$250 (12.7%) |
| 1 NVDAB of collateral: borrowing power | 1 × $220 × 50% = **110 USDT** (at fair value it would be 118) |
| Health factor after borrowing 110 | 143 / 110 = 1.30 |
| Monday open gaps to $150 (live band $149–$151) | liquidation value 1 × $149 × 65% = 96.85 < debt 110.05: liquidatable |
| Liquidation | repays 55.02 USDT, seizes 0.385 NVDAB (worth 57.78 at $150, a 5% bonus) |
| After | debt 55.02 against 0.615 NVDAB = $92.2; health factor 1.08; lenders lose nothing |

**Interest.** `index_{t} = index_{t0} * (1 + ratePerSecond * (t - t0))`, rounded up, compounded at every accrual.
`ratePerSecond = ceil(aprBps * 1e27 / (1e4 * 365 days))`. An account's debt is
`ceil(scaledDebt * index / 1e27)`. `totalAssets = cash + floor(totalScaledDebt * index / 1e27)`, computed with the
projected index, so ERC-4626 conversions are always current.

**Exact maximum borrow.** Scaled debt and debt both round up, so once the index has moved away from 1e27, borrowing
*exactly* `borrowPower - debt` can miss by 1–2 wei. `maxBorrow(account)` returns the exact largest amount
`borrow` accepts: with power `P`, scaled debt `S` and index `i`, it is
`floor((floor(P * RAY / i) - S) * i / RAY)`, capped by cash. It returns 0 if any gate fails or the market is paused.
Unit, fuzz and invariant tests pin this exactness.

**Rounding.** It always runs against the borrower and in favor of the protocol:

| Quantity | Direction |
|---|---|
| rate per second, borrow index growth | up |
| scaled debt added by `borrow` | up |
| account debt (scaled to assets) | up |
| scaled debt removed by a partial repay or liquidation | down |
| total debt inside `totalAssets` | down |
| borrowing power, liquidation value | down |
| collateral seized | down |
| repayment charged when a seizure is capped | up |
| close-factor maximum | up (so dust can always be closed) |
| ERC-4626 conversions | OpenZeppelin (vault-favoring) |

Each account's debt rounds up while the aggregate in `totalAssets` rounds down, so lenders are never credited with
more than borrowers owe. The invariant suite asserts this directly: `totalAssets <= cash + sum(debtOf)`.

**ERC-4626 specifics.** Cash is tracked internally, so donated tokens never move the share price. That makes the
classic first-depositor inflation attack impossible, and the owner can `skim` donations. `_decimalsOffset` is 0, so
shares have 18 decimals and start 1:1. `maxWithdraw` and `maxRedeem` are bounded by idle cash. A lender who deposits
and immediately redeems can never get back more than they put in (fuzzed in any market state).

## ForecastBook leaf encoding and test vector

```
leafHash = keccak256(bytes.concat(keccak256(abi.encode(
    uint64  round,       // must equal the commitment's round
    address token,
    uint128 medianE8,    // USD per token, 8 decimals
    uint128 lowerE8,     // 5th percentile, 8 decimals
    uint128 upperE8,     // 95th percentile, 8 decimals
    uint64  anchorTime   // must equal the commitment's anchorTime
))))
```

- The `abi.encode` preimage is 6 × 32 = 192 bytes; every field is left-padded to 32 bytes.
- The double hash means a 64-byte internal node can never be passed off as a leaf (second-preimage safety).
- Internal nodes are `keccak256(min(a, b) ++ max(a, b))`, OpenZeppelin `MerkleProof`'s sorted pairs, so proofs carry
  no left/right flags.
- This is exactly OpenZeppelin's JavaScript `StandardMerkleTree` (npm package `@openzeppelin/merkle-tree`). It
  builds trees whose roots and proofs `verifyForecast` accepts:

```ts
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

const types = ["uint64", "address", "uint128", "uint128", "uint128", "uint64"];
const values = [
  [42n, "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436", 23600000000n, 22000000000n, 25000000000n, 1791811800n], // NVDAB
  [42n, "0x5b1910eAaD6450E50f816082Aa078C41F10C292f", 43000000000n, 40000000000n, 46000000000n, 1791811800n], // TSLAB
  [42n, "0x7138b48df7D98D7e3cc221BfE7192D0a178182D8", 67000000000n, 65500000000n, 68500000000n, 1791811800n], // SPYB
  [42n, "0x1111111111111111111111111111111111111111", 100000000n, 95000000n, 105000000n, 1791811800n],       // TEST
];
const tree = StandardMerkleTree.of(values, types); // sortLeaves: true (default)
// tree.root === "0xe06290fea4ba91b76f45affd9b48dfa50d4c69c815c8241f3a4e90d3cd9d2fb0"
// commit(42, 1791811800, tree.root, 4); verifyForecast(..., values[i] as Leaf, tree.getProof(i)) === true
```

**Test vector.** Round 42, anchor 1791811800 (Mon 2026-10-12 13:30 UTC). It is asserted in
`test/ForecastBook.t.sol` and was computed independently with `cast abi-encode` and `cast keccak`.

| Leaf | Leaf hash |
|---|---|
| NVDAB, 236.00 / 220.00 / 250.00 | `0xb6476578ac615829d4157df6a99711134873b67ecee1e2d54b5fa1d7fd97184f` |
| TSLAB, 430.00 / 400.00 / 460.00 | `0x94be875fcafb102fd7b1465e8a092e1a576936504a20b2ec35f0ee0031783e0f` |
| SPYB, 670.00 / 655.00 / 685.00 | `0x86356732510532068af2acbb3392dabdffe9f61f5c292b4c0de0f41b12f46a20` |
| TEST (0x1111…1111), 1.00 / 0.95 / 1.05 | `0x3b97602ef9fd456d397b71f714fb4ea53a4f42c8d96810682f4f44b48213c13c` |

The leaves are sorted ascending (TEST < SPYB < TSLAB < NVDAB) and paired (0, 1) and (2, 3):

```
n01  = H(TEST, SPYB)   = 0x137e0ef1e5b797697be421d8bb17109053a455deb7575efd4fce25478e83aaf6
n23  = H(TSLAB, NVDAB) = 0x4bf1a9b1ac5ecd5d875f799a6cc282b8f9a1bead946afea49e3ddc456dc3576e
root = H(n01, n23)     = 0xe06290fea4ba91b76f45affd9b48dfa50d4c69c815c8241f3a4e90d3cd9d2fb0
proof(NVDAB) = [TSLAB, n01]    proof(TSLAB) = [NVDAB, n01]
proof(SPYB)  = [TEST, n23]     proof(TEST)  = [SPYB, n23]
```

A fuzz test also builds random trees of 1–33 leaves and verifies every proof on-chain.

## Threat model

**Oracle trust (the main assumption).** Reporters are trusted to post honest numbers. A compromised reporter key
could post a high `lower`, borrow against it and leave bad debt, or post a crash and liquidate positions at the
bonus. The contracts mitigate this as follows:

- Reporters are an allowlist that the owner can revoke instantly. Ownership is two-step and can never be renounced.
- The oracle rejects structurally invalid data, non-increasing rounds and timestamps that move backwards. It does
  not reject merely implausible values.
- New borrowing additionally requires a fresh, unflagged report whose band is at most 15% wide. Every consumer
  re-checks that reports are well formed.
- The owner can `pause` the market, which stops borrows, collateral withdrawals, liquidations and lender flows,
  within the block the compromise is noticed.

What is still trusted: within those bounds a malicious reporter can still mis-price, and no single-reporter design
avoids that. The planned hardening is a k-of-n signed-report quorum (median of independent aggregators), a per-round
deviation circuit breaker, and a timelocked multisig owner. `ForecastBook` makes reporter honesty auditable after the
fact: forecasts are committed before the open and can be scored against the tape.

**Stale data.** Each consumer enforces its own staleness budget: per-collateral `maxAge` in the credit market,
`maxAge` in the Venus adapter, and `updatedAt` for Chainlink consumers of the feed. During an outage:

- Borrowing and risky withdrawals stop (`StaleReport`).
- Repay and deposits continue. Withdrawals without debt never need the oracle.
- Liquidations need a fresh price for the collateral they seize, so nobody can be liquidated on a stale price.
- The health check uses the last known `lower` for the other collateral. This is the Compound/Aave behaviour, and it
  prevents shielding.

**Price manipulation.** No price is read from an on-chain pool at execution time. Prices come only from signed-off
reports, so flash loans and pool manipulation within a block cannot move a valuation. Manipulating the off-chain
inputs is the aggregators' problem. Its on-chain blast radius is limited by valuing at the 5th percentile, the 50%
LTV, the band-width gate and the pause.

**Corporate actions and the issuer.** bStocks are OpenZeppelin BeaconProxies (beacon `0x156d…93a3`). Each has a
compliance module (a blocklist and a sanctions list, exposed as `checkIsCompliant(from, to)`), a pause manager, and
a UI multiplier for dividends and splits (NVDAB `uiMultiplier` was about 1.000778 when this was written). Reports price the **raw
token** (the per-share value times the multiplier), so balances never need rebasing. The aggregator sets
`flags & 1` while a multiplier change is pending or the issuer has paused transfers. That blocks new borrows,
withdrawals with debt, Venus pricing and seizures of that token, because a seizure would fail anyway if transfers
are paused. Residual issuer risk: if the issuer blocklists the credit contract or a liquidator, transfers revert.
Liquidators can choose another `receiver`, but collateral held by a blocklisted market is frozen. This is inherent
to permissioned RWAs and is documented rather than mitigated.

**Liquidation incentives.**

- The 5% bonus is paid at `fairValue`, which is never more than the price a liquidator can realize when reports are
  honest. The `threshold * (1 + bonus) <= 100%` rule keeps a liquidation at the threshold solvent.
- The 50% close factor limits the loss from any single liquidation. The `minSeized` guard protects liquidators from
  a report that lands between submission and execution.
- Dust positions can be closed: the close factor rounds up, and capped seizures are allowed.
- Positions cannot be shielded. Missing or stale reports on other collateral never make the health check revert.
  Third parties cannot attach new collateral to someone else's account (`CollateralNotOpened`), which also stops
  them freezing a victim's borrows with a stale-report token.
- When collateral runs out, bad debt is socialized immediately and transparently (`BadDebtRealized`).

**Rounding.** It runs in the protocol's favor everywhere; see the [table](#credit-market-mechanics). The invariants
"share price never decreases except at a bad-debt write-off" and "lender claims <= totalAssets <= cash + sum(debt)"
are checked after every call: about 65k random calls in a default run, and about 524k with
`FOUNDRY_PROFILE=deep`.

**Reentrancy and call ordering.** Every state-changing entry point is `nonReentrant`, using OpenZeppelin
`ReentrancyGuardTransient` (EIP-1153, available on BSC; the storage-based guard is deprecated in OpenZeppelin 5.x).
State is written before tokens move, except for the balance-delta pull in `depositCollateral`, which runs under the
guard. Tests drive a hostile token whose transfer hook re-enters `borrow` and `withdrawCollateral`; both are
rejected.

**Admin powers.** The owner can:

- list collateral and tune its parameters, including lowering a threshold, which can make positions liquidatable
  immediately;
- set the APR;
- pause, which also pauses lender withdrawals so that funds cannot be drained during an incident; repay and deposits
  stay open;
- `skim` tokens held above the internal accounting.

The owner cannot move lenders' cash or borrowers' collateral. Production deployments should hand ownership to a
timelocked multisig. The deploy script supports this through `NIGHTSHIFT_OWNER` and two-step acceptance.

**Assumptions.** USDT is treated as exactly 1 USD; a depeg is not modelled. Collateral is assumed not to rebase.
Fee-on-transfer collateral is handled by crediting the balance delta.

## Build, test, deploy

All commands run from `contracts/`. Foundry must be on `PATH`; on this machine run
`export PATH="$PATH:/c/Users/Dflame/.foundry/bin"` first.

```bash
# From a fresh clone: fetch pinned dependencies (soldeer.lock) and build
forge soldeer install && forge build

# Full suite, including the BSC mainnet fork tests (latest block of BSC_RPC_URL; default https://bsc-dataseed.bnbchain.org)
forge test

# Offline: the fork tests are skipped
SKIP_FORK_TESTS=true forge test
# or: forge test --no-match-path "test/fork/*"

# Only the fork tests, against another RPC
BSC_RPC_URL=https://bsc-rpc.publicnode.com forge test --match-path "test/fork/*" -vv

# Heavier fuzz and invariant campaign (20k fuzz runs, 1024 x 256 invariant calls)
FOUNDRY_PROFILE=deep forge test --no-match-path "test/fork/*"

# Gas for the hot paths, each call as its own transaction (writes snapshots/GasBenchmarks.json)
forge test --match-contract GasBenchmarks --isolate

# Formatting, lint-clean build, contract sizes
forge fmt --check && forge build --sizes

# Deployment dry run against a BSC fork: simulation only, writes deployments/56.dry-run.json
forge script script/Deploy.s.sol --fork-url https://bsc-dataseed.bnbchain.org
```

**Deploying for real.** Add `--broadcast` and wallet flags. The output then goes to `deployments/<chainid>.json`.
Every parameter is an optional environment variable; the full list is in the `Deploy.s.sol` NatSpec:

- `NIGHTSHIFT_OWNER`, `NIGHTSHIFT_USDT`, `NIGHTSHIFT_TOKENS`, `NIGHTSHIFT_REPORTERS`, `NIGHTSHIFT_IDENTITY_REGISTRY`;
- `NIGHTSHIFT_BORROW_APR_BPS`, `NIGHTSHIFT_VENUS_MAX_AGE`;
- the collateral parameters: `NIGHTSHIFT_BASE_LTV_BPS`, `NIGHTSHIFT_LIQ_THRESHOLD_BPS`, `NIGHTSHIFT_LIQ_BONUS_BPS`,
  `NIGHTSHIFT_MAX_BAND_BPS`, `NIGHTSHIFT_MAX_AGE`.

When `NIGHTSHIFT_OWNER` differs from the deployer, ownership of the oracle, the Venus adapter and the market is
*offered*, and the new owner must call `acceptOwnership()` on each. Nothing has been broadcast. The dry run against
BSC mainnet state deploys all four contracts and three feeds, and lists NVDAB, TSLAB and SPYB, in about 14.0M gas
(≈0.0007 BNB at 0.05 gwei).

## Test suite

133 tests in 12 suites, all passing. Without network access, 130 pass and the 3 fork tests are skipped.

| Suite | Tests | Focus |
|---|---|---|
| `NightshiftOracle.t.sol` | 20 | reporters, every `postReports` validation path, batch atomicity, monotonic round and time, freshness edges, CREATE2 factory; fuzz: valid reports round-trip, invalid prices rejected, rounds only increase |
| `NightshiftFeed.t.sol` | 12 | AggregatorV3 mapping, latest-only `getRoundData`, `band()`, defensive `symbol()` reads (bytes32, reverting, malformed, oversized, a return bomb); fuzz |
| `NightshiftVenusOracle.t.sol` | 11 | scaling for 0–28 decimals, staleness boundary, each blocking and non-blocking flag, faulty-oracle defence; fuzz |
| `ForecastBook.t.sol` | 12 | the test vector, tamper rejection, round and anchor binding, commit/reveal rules, ERC-8004 linking (id 0, stale links); fuzz: random trees of 1–33 leaves |
| `NightshiftCredit.t.sol` | 44 | config validation, the 16-token cap with high mask bits, pause semantics, ERC-4626 limits, donations and skim, fee-on-transfer, third-party top-ups, every borrow gate with boundaries, repay paths, exact interest, `maxBorrow`, reentrancy |
| `NightshiftCreditLiquidation.t.sol` | 15 | weekend gap, band widening, exact amounts, close factor, slippage guard, crash beyond collateral with bad-debt write-off, seize gates, anti-shielding, lenders whole end to end |
| `NightshiftCreditFuzz.t.sol` | 6 | exact borrowing power for any decimals, exact `maxBorrow`, interest is never below simple APR, newcomers never profit, liquidation bounds, **no bad debt and no liquidation when the realized price is at or above `lower`** |
| `invariant/CreditInvariant.t.sol` | 2 campaigns, 17 invariants | stateful random sequences of 13 actions (lend, mint, withdraw, redeem, donate, deposit and withdraw collateral, borrow, borrowMax, repay, liquidate, post reports, warp) in two regimes, listed below |
| `fork/BscFork.t.sol` | 3 | BSC mainnet, latest block: real USDT, real NVDAB, price from the PancakeSwap V3 pool, the full weekend lifecycle, Feed and Venus outputs |
| `Deploy.t.sol` | 4 | script wiring, two-step ownership handover, BSC defaults |
| `Gas.t.sol` | 4 | gas benchmarks |

The invariant suite runs in two regimes:

- **In-band.** Every posted fair value is at or above the highest `lower` any successful borrow check relied on. No
  bad debt is ever realized, and every account with debt is fully backed at the realized price.
- **Gap.** Prices fall by up to 98%. Liquidations and bad-debt write-offs both occur, which was verified with
  temporary coverage probes.

In both regimes these always hold:

- cash is backed and donations are ignored;
- `totalScaledDebt` equals the sum of the accounts' scaled debt;
- `totalAssets <= cash + sum(debt)`;
- lender claims never exceed `totalAssets`;
- the share price never decreases except at a write-off;
- `maxBorrow` is always exactly borrowable;
- collateral accounting matches token balances, and collateral masks match balances;
- no account carries debt without collateral.

**Fork scenario** (`test_fork_weekendLoanLifecycle`):

1. A lender deposits 1000 real USDT, and a borrower posts 1 real NVDAB (`deal` works through the beacon proxy;
   the PancakeSwap pool's balance is the fallback).
2. The reporter posts a Saturday session-4 report centred on the pool price, with a 14% band.
3. A borrow of exactly `maxBorrow` succeeds, and one more wei reverts `InsufficientCollateral`.
4. The report goes stale and blocks borrowing (`StaleReport`).
5. A Monday regular-session report gaps to 72% of Saturday's lower edge. The position becomes liquidatable, and a
   liquidator repays half in real USDT and receives real NVDAB.
6. `totalAssets` stays at or above 1000 USDT, and the remaining debt is fully collateralized at the gap price.
7. The borrower repays, and the lender redeems more than 1000 USDT.

## Gas and sizes

These figures were measured with `forge test --match-contract GasBenchmarks --isolate`. Each call runs as its own
transaction, so the figures include the 21k intrinsic gas and cold storage.

| Operation | Gas |
|---|---|
| `postReports`, 1 token, first write | 101,946 |
| `postReports`, 1 token, update (steady state) | 45,046 |
| `postReports`, 3 tokens, update | 85,750 |
| `borrow`, 1 collateral (first borrow / later borrow) | 120,279 / 94,008 |
| `borrow`, 3 collaterals | 124,808 |
| `repay` in full | 57,923 |
| `liquidate` (partial, 1 collateral) | 146,230 |
| `depositCollateral` (first) | 135,707 |
| lender `deposit` (first) | 130,909 |

Runtime sizes are all under 24,576 bytes without `via_ir`: `NightshiftCredit` 18,765, `NightshiftOracle` 10,144
(it embeds the feed's creation code), `ForecastBook` 4,277, `NightshiftFeed` 2,364 and `NightshiftVenusOracle`
2,247.

## Known limitations

- **Single trusted reporter set.** There is no on-chain quorum or deviation breaker yet; see the
  [threat model](#threat-model).
- **Fixed APR.** There is no utilization curve, so liquidity is restored by owner rate changes rather than
  automatically. At 100% utilization lenders wait for repayments or liquidations, and `maxWithdraw` reports this
  honestly.
- **Liquidity is not enforced on-chain.** Liquidations depend on bStock liquidity, for example about 9.6k NVDAB in
  the PancakeSwap V3 pool. There are no supply or borrow caps yet; a per-token debt ceiling is the natural next
  parameter.
- **Latest round only.** `getRoundData` in the feed serves only the latest round, because history lives in events
  and the HTTP mirror.
- **Assumptions.** USDT is assumed to be 1 USD, and the issuer can freeze bStock transfers.
