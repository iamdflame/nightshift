# NightshiftHook: a PancakeSwap Infinity hook that pays LPs the reopen gap

`contracts-hooks/src/NightshiftHook.sol` is a concentrated-liquidity (CL) hook for PancakeSwap Infinity on BNB Smart
Chain. It prices every swap in a tokenized-stock / USDT pool against the Nightshift fair-value oracle
([`fair-value-feed-v1.md`](specs/fair-value-feed-v1.md)). Without it, the pool's liquidity providers lose the reopen
gap to arbitrageurs. With it, they keep most of that gap as fees.

On a BSC mainnet fork, against the live PancakeSwap contracts, a $302k NVDAB/USDT position facing a Monday gap from
$230 to $236 **lost $70.63 with NightshiftHook, compared with $244.92 on a flat 0.05% pool and $207.81 on a flat
0.25% pool** (see [Measured on BSC](#measured-on-bsc)).

## The problem: loss-versus-rebalancing at every reopen

Tokenized US stocks such as NVDAB trade on-chain 24/7. Price discovery for the underlying share happens only in the
32.5 hour/week regular session. When the market reopens, the fair price jumps. This happens every morning, and most of
all on Monday after the 48 hour dark period. An ordinary AMM is still quoting the old price, so the first
arbitrageurs buy (or sell) the whole gap from LPs. That transfer is loss-versus-rebalancing (LVR, Milionis,
Moallemi, Roughgarden and Zhang, 2022). At a reopen it is realized in one burst. A static fee *f* protects only the
first *f* of the gap, and the rest goes to whoever trades first.

## The mechanism

Each report gives a fair value FV and a 5%-95% band `[lower, upper]` for the price at the next open. Before every
swap the hook reads the pool price (USDT per stock token, from `slot0`) and the report, then charges one of:

| Situation | LP fee |
|---|---|
| Oracle unusable: stale (`now - updatedAt > maxAge`), corporate action (`flags & 1`), degraded model (`flags & 8`), report breaks the feed invariants, or the oracle call fails | `maxFee` |
| **Informed flow**: the trade moves the pool toward FV (buying while pool < FV, selling while pool > FV) | `baseFee + informedSlope × |pool − FV| / FV` |
| **Uninformed flow**: the trade moves the pool away from FV (or the pool sits at FV) | `baseFee` |

with `baseFee = minFee` during the regular session (`session == 0`) and
`baseFee = minFee + uncertaintyCoef × (upper − lower) / FV` in pre-market, post-market, overnight, closed or halted
hours. Every fee is capped at `maxFee`. The fee is returned from `beforeSwap` with `OVERRIDE_FEE_FLAG`, so it applies
to that swap only.

Why this split works:

- **LPs keep about `informedSlope` of the LVR.** An arbitrageur closing the gap in small clips pays, on each clip,
  `informedSlope` times the gap that remains. Summed over the path, that is `informedSlope × LVR` in fees. Arbitrage
  stops once the gap is within `baseFee / (1 − informedSlope)` of FV, so the pool still converges to fair value.
- **Nobody pays more than fair.** With `informedSlope ≤ 1` (a hard cap), a buyer pushing the price up toward FV pays
  at most `FV × (1 + baseFee)` per unit. That is no worse than an uninformed trade at fair value; the hook only takes
  back the mispricing. Sellers get the same bound to first order. Both are fuzz-tested
  (`testFuzz_buyerTowardFairValueNeverPaysAboveFairPlusBase`, `testFuzz_sellerTowardFairValueFairToFirstOrder`).
  This matters because the hook cannot tell an arbitrageur from a retail trader who happens to trade toward FV. Both
  pay the informed fee, and both still get a price at or better than fair.
- **Uncertainty is priced.** Outside the regular session LPs may be trading against people who know more than the
  oracle, for example about earnings released after the close. The base fee grows with the width of the oracle's band,
  in the spirit of Glosten-Milgrom: the spread widens with the risk of trading against better information.
- **Failure is safe and never blocks trading.** Every oracle failure mode maps to `maxFee`. That includes a reverting
  oracle, an empty account, short or out-of-range return data, and an oracle that burns gas (the call is capped at
  100k gas). So a broken feed makes the pool expensive but never makes a swap revert.

## Worked example: the Monday gap

It is Sunday 21:00 ET, during the overnight session. The pool trades at **$230**. The oracle posts
**FV = $236** with a next-open band of **$229 to $243**. The pool runs the launch defaults: `minFee` 5 bps,
`uncertaintyCoef` 0.05, `informedSlope` 0.5, `maxFee` 10%.

- Uncertainty premium: `0.05 × (243 − 229) / 236 = 0.2966%` → **baseFee = 0.05% + 0.2966% = 0.3466%** (3,466 pips)
- Gap: `|230 − 236| / 236 = 2.542%` → informed premium `0.5 × 2.542% = 1.2711%` → **informed fee = 1.6177%**

The schedule as the pool price moves. LP fee in pips (1,000,000 = 100%). The total adds PancakeSwap's protocol fee:
`300 + lp − 300 × lp / 1e6`, which is 3 bps on BSC dynamic-fee pools.

| Pool price | Buy NVDAB: LP fee | Buy: total fee | Sell NVDAB: LP fee | Sell: total fee |
|---:|---:|---:|---:|---:|
| $220 | 37,364 (3.74%) | 37,653 | 3,466 | 3,765 |
| $225 | 26,771 (2.68%) | 27,063 | 3,466 | 3,765 |
| **$230** | **16,177 (1.62%)** | **16,473** | **3,466 (0.35%)** | **3,765** |
| $233 | 9,821 (0.98%) | 10,119 | 3,466 | 3,765 |
| $236 (= FV) | 3,466 | 3,765 | 3,466 | 3,765 |
| $239 | 3,466 | 3,765 | 9,821 | 10,119 |
| $242 | 3,466 | 3,765 | 16,177 | 16,473 |
| $250 | 3,466 | 3,765 | 33,127 (3.31%) | 33,418 |

These exact values are asserted in `test_mondayGap_feeSchedule` and, end to end on the live pool, in
`test_fork_mondayGap_bothTokenOrders`.

**Who pays.**

- The arbitrageur buying NVDAB at $230 to sell after the open at about $236 pays 1.62% on his first clip. On a
  $5,000 clip, $80.87 goes to LPs and $1.50 to the protocol. If he buys the whole gap in one swap he loses money:
  he pays 1.62% on every unit while gaining about 1.27% on average. So he buys in clips, and each clip pays half of
  the gap that remains.
- A holder who sells at $230 is moving the price away from FV. She pays only the 0.35% base fee: the hook does not
  tax uninformed flow for the gap.
- Once the gap is within 0.75% of FV, `(0.3466% + 0.03%) / (1 − 0.5)`, overnight arbitrage stops. After the open
  (session 0, tight band) the base fee falls to 5 bps, and arbitrage continues until the pool is within 0.16% of FV.

### Measured on BSC

`test_fork_reopen_lpOutcome_vsFlatFeePools` runs this scenario against the live CLPoolManager, CLPositionManager,
Universal Router and CLQuoter. Each pool holds the same liquidity: L = 1e23 over ±2,100 ticks, about $302k TVL. The
only difference between pools is the LP-fee schedule. A rational arbitrageur buys NVDAB in 1,000 USDT clips for as
long as the live quoter says a clip is profitable at $236. He does this first with the Sunday-night report, then
again after the open (regular session, band $235.50 to $236.50). LP P&L is marked at fair value as
`-(arbitrage profit) - protocol fees`. With zero fees, the LVR of moving this position from $230 to $236 is $254.71.

| Pool (same liquidity) | LP P&L at FV | Arbitrage profit | Protocol fees | Clips | Final price |
|---|---:|---:|---:|---:|---:|
| **NightshiftHook defaults** | **−$70.63** | $65.23 | $5.40 | 18 | $235.43 |
| Flat 0.05% | −$244.92 | $239.22 | $5.70 | 19 | $235.79 |
| Flat 0.25% | −$207.81 | $202.41 | $5.40 | 18 | $235.48 |

NightshiftHook cuts the LPs' reopen loss by **71%** against a 0.05% pool and **66%** against a 0.25% pool. The pool
still ends within 0.24% of fair value. Re-run it with `forge test --match-test lpOutcome -vv`; the numbers move a
little with the fork block.

## Parameters

Each pool has its own `FeeParams`. The owner sets them within hard caps that are constants in the contract. Every
change emits an event.

| Parameter | Unit | Launch default | Hard cap | Meaning |
|---|---|---:|---|---|
| `minFee` | pips | 500 (0.05%) | ≤ `maxFee` | Fee for uninformed flow in the regular session |
| `maxFee` | pips | 100,000 (10%) | ≤ 500,000 (50%) | Ceiling on every fee; charged outright when the oracle is unusable |
| `informedSlope` | ppm | 500,000 (0.5×) | ≤ 1,000,000 (1×) | Share of the relative gap charged to flow moving toward FV |
| `uncertaintyCoef` | ppm | 50,000 (0.05×) | ≤ 1,000,000 (1×) | Share of the relative band width added to the base fee outside the regular session |
| `maxAge` | seconds | 900 | 60 to 86,400 | Age at which a report counts as stale |

Why these caps:

- `maxFee` stays far below 100%, the level at which the CLPoolManager makes exact-output swaps revert, so a pool is
  never closed by its fee.
- `informedSlope ≤ 1` keeps the fairness bound above.

`defaultFeeParams()` returns the launch values. Raising `informedSlope` toward 1 lets LPs keep more of the gap, at the
cost of a wider zone around FV where arbitrage does not happen. Raising `uncertaintyCoef` makes dark-hours trading
dearer.

Admin surface: `configurePool`, `setFeeParams` and `setOracle` are owner-only. Ownership uses OpenZeppelin
`Ownable2Step`. The quote token is treated as exactly $1.

## How it plugs into PancakeSwap Infinity

- **Permissions.** Infinity hooks do not encode permissions in their address, as Uniswap v4 hooks do. A hook
  declares them in `getHooksRegistrationBitmap()`, and the pool repeats them in the low 16 bits of
  `PoolKey.parameters`. At initialization the CLPoolManager checks that the two match (`Hooks.validateHookConfig`).
  NightshiftHook registers `beforeInitialize` (bit 0) and `beforeSwap` (bit 6), so its bitmap is `0x41`. For tick
  spacing 10, `parameters = 0x0a0041` (tick spacing sits in bits 16-39), which `hook.poolParameters(10)` returns.
- **Dynamic fee.** A pool is dynamic when `PoolKey.fee == LPFeeLibrary.DYNAMIC_FEE_FLAG` (`0x800000`).
  `beforeInitialize` rejects any other fee.
- **Per-swap override.** `beforeSwap` returns `(selector, ZERO_DELTA, fee | OVERRIDE_FEE_FLAG)` with
  `OVERRIDE_FEE_FLAG = 0x400000`. For a dynamic pool, `CLHooks.beforeSwap` parses the fee, `CLPool.swap` strips the
  flag, checks the fee against 100%, and uses it for that swap only. The pool's stored dynamic fee stays at 0 and is
  never used. PancakeSwap's own `SampleCLDynamicFeeHook` computes `OVERRIDE_FEE_FLAG & fee`, which is always 0, so
  its override never fires. Use `|`.
- **Protocol fee.** For dynamic-fee pools, PancakeSwap's live `ProtocolFeeController` sets
  `defaultProtocolFeeForDynamicFeePool = 300`, which is 3 bps in each direction. That is charged on top:
  `swapFee = 300 + lpFee − 300 × lpFee / 1e6`.
- **Guarded birth.** `beforeInitialize` admits a pool only if all of these hold:
  - the pool uses a dynamic fee;
  - the owner configured it in advance, with stock side, oracle and parameters;
  - the oracle is usable;
  - the initial price lies inside `[lower, upper]`.

  So nobody can front-run the owner and create the pool at an off-market price.
- **Hot path.** `beforeSwap` makes two calls and writes no state. One is a warm STATICCALL to the PoolManager (its
  caller) for `slot0`. The other is the oracle read, with a 100k gas cap, decoded by hand so that malformed data
  cannot revert. Price conversion is an exact-floor `mulDiv` and handles either token order and any decimals up to
  18.
- **Base contract.** The hook implements `ICLHooks` directly instead of inheriting `CLBaseHook` from
  `pancakeswap/infinity-hooks`. That file is `SPDX: UNLICENSED`, and the repository has no LICENSE. The behaviour is
  the same: only the PoolManager may call the hook, and callbacks it does not register revert.

Gas: inside a real swap, `beforeSwap` costs about **22.7k gas** with its own config and the oracle cold. The read of
the mock oracle is 9.6k of that. With the PoolManager cold as well, the isolated upper bound is 27.2k
(`test_gas_beforeSwap`). The hook's runtime bytecode is 11,634 bytes.

## Addresses used (BSC mainnet, chain 56)

| Contract | Address | Source |
|---|---|---|
| Infinity Vault | `0x238a358808379702088667322f80aC48bAd5e6c4` | [developer.pancakeswap.finance Infinity addresses](https://developer.pancakeswap.finance/contracts/infinity/resources/addresses); `infinity-core/script/config/bsc-mainnet.json` |
| CLPoolManager | `0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b` | same; on-chain `vault()` returns the Vault |
| CLPositionManager | `0x55f4c8abA71A1e923edC303eb4fEfF14608cC226` | docs; `infinity-periphery/script/config/bsc-mainnet.json`; on-chain `clPoolManager()` and `permit2()` match |
| Universal Router | `0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB` | docs; `infinity-universal-router/deploy-addresses/bsc-mainnet.json` |
| CLQuoter | `0xd0737C9762912dD34c3271197E362Aa736Df0926` | docs; periphery config; on-chain `poolManager()` matches |
| Permit2 | `0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768` | periphery config; on-chain `CLPositionManager.permit2()` |
| CL ProtocolFeeController | `0x15F6180033aEa66377d2A1778e418591C00dEb4c` | on-chain `CLPoolManager.protocolFeeController()`; `defaultProtocolFeeForDynamicFeePool() = 300` |
| USDT (BEP-20, 18 decimals) | `0x55d398326f99059fF775485246999027B3197955` | brief; on-chain `decimals() = 18` |
| NVDAB, NVIDIA bStock (18 decimals) | `0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436` | brief; on-chain `name() = "NVIDIA Corp"`; a beacon proxy that behaves as a plain BEP-20 on the fork |

The dependency sources match the deployed code. They are vendored in `contracts-hooks/lib/` (the 91 files the build
uses, plus licenses):

- infinity-core `7c04695`: the BSC deployment `3891d0c` plus the June 2025 protocol-fee controller
- infinity-periphery `04585d1`: the BSC deployment `b22d04b` plus a bin-pool helper

`script/vendor-deps.sh` restores the full upstream trees at those commits.

## Build, test, deploy

```bash
cd contracts-hooks
export PATH="$PATH:$HOME/.foundry/bin"          # Foundry 1.x
forge build --sizes
forge test                                      # 71 tests; the fork suites use the public BSC RPC
forge test --no-match-path 'test/fork/*'        # 64 offline tests (fee math + hook on locally deployed Infinity core)
BSC_RPC_URL=https://bsc-rpc.publicnode.com forge test --match-path 'test/fork/*' -vv   # any BSC RPC; BSC_FORK_BLOCK pins a block (needs an archive node)
forge test --match-test lpOutcome -vv           # prints the reopen LVR comparison above
forge fmt --check
forge script script/DeployHook.s.sol --tc DeployHook --fork-url https://bsc-dataseed.bnbchain.org -vv   # dry run
```

What the tests cover:

- **`test/NightshiftFeeMath.t.sol` (37 tests, fuzz at 1,024 runs):**
  - direction truth table and the Monday-gap schedule, with values computed independently;
  - sessions, caps, the staleness boundary, flags and invalid reports;
  - both token orders;
  - the fairness bounds;
  - price round-trips across decimals and the whole tick range.
- **`test/NightshiftHook.t.sol` (27 tests):** the hook against the real Vault, CLPoolManager and
  ProtocolFeeController, compiled from the pinned source.
  - The fee recovered from token amounts equals the hook fee plus the protocol fee, for exact-in and exact-out, both
    token orders and every regime. Fee growth shows that LPs receive it.
  - Five oracle failure modes, none of which revert swaps.
  - Initialization guards, admin caps, events and two-step ownership.
  - A 1,024-run property fuzz: whatever the oracle reports, the CLPoolManager charges exactly what `quoteFee`
    announced.
- **`test/fork/` (7 tests):** the live BSC contracts.
  - Real NVDAB as currency0, plus a stand-in stock that sorts as currency1.
  - Liquidity minted through CLPositionManager and Permit2.
  - Swaps through the Universal Router, pre-quoted by CLQuoter (quote equals execution).
  - Every oracle state, the clip-by-clip reopen, and the LVR comparison.
  - The deploy script run end to end.

`script/DeployHook.s.sol` is driven by environment variables:

- `CL_POOL_MANAGER`, `STOCK_TOKEN`, `QUOTE_TOKEN`, `NIGHTSHIFT_ORACLE`, `INIT_PRICE_E8`, `TICK_SPACING`, `HOOK_OWNER`;
- `FEE_MIN`, `FEE_MAX`, `INFORMED_SLOPE`, `UNCERTAINTY_COEF`, `MAX_AGE`.

The defaults deploy NVDAB/USDT on BSC. Until the Nightshift oracle is deployed, the script uses a
`DryRunFairValueOracle`, a placeholder that always reports FV = $236.

The script **refuses to run in a broadcast context** unless `NIGHTSHIFT_ALLOW_BROADCAST=true` is set, and this
repository holds no keys. A fork dry run deploys the hook, registers the pool and initializes it with the live
3 bps protocol fee. The whole run is about 4.18M gas, roughly 0.0002 BNB at 0.05 gwei.

## Risks and limitations

- **The oracle is trusted.** Every check above (staleness, flags, invariants, gas cap) catches an oracle that is
  broken. None of them catches an oracle that is wrong but well-formed. A bad FV can make arbitrage look
  "uninformed": LPs then lose as they would in a plain pool. It can also make honest flow look "informed": traders
  then pay at most `maxFee`, and their slippage limits still apply. Point production pools at a feed whose
  aggregation is decentralized, and keep `maxAge` tight.
- **USDT is treated as $1.** If USDT depegs, FV and the pool price are compared in different units.
- **The fee is fixed for the whole swap.** It is computed from the price before the swap. Arbitrageurs who split
  their trades pay the marginal fee, so LPs capture about `informedSlope × LVR`, not all of it. A single swap that
  overshoots FV pays the informed rate on the overshoot too.
- **Latency.** During the regular session, a trader with faster information than the oracle's update cadence looks
  "uninformed" and pays only `minFee`. The oracle's cadence must sit well inside `maxAge` in every session, or the
  pool spends long stretches at `maxFee`.
- **Admin power.** The owner can raise fees up to 50%, or repoint the oracle. Use a multisig or timelock as owner;
  `Ownable2Step` is already in place.
- **Initialization price.** Anyone may initialize a configured pool, but only at a price inside the oracle band. A
  griefer could therefore initialize at the edge of the band, and the first LP should check the price before adding
  liquidity.
- **PancakeSwap's protocol fee is outside the hook's control.** PancakeSwap can change it per pool, and the hook's
  schedule sets only the LP share.
- **Token behaviour.** NVDAB is an issuer-upgradeable beacon proxy. It behaved as a plain BEP-20 on the fork, but
  transfer restrictions could be added later.
- **No audit.** This is unaudited hackathon code, built on audited PancakeSwap Infinity contracts.
