# Nightshift Fair Value Feed v1

The on-chain interface every Nightshift consumer reads: the credit vault, the PancakeSwap Infinity hook, the Venus
adapter, Chainlink-style feeds, and any third-party protocol.

## Why it exists

Tokenized US equities trade 24/7. Their underlying has a deep regular session for 32.5 h a week and no reference
price at all for the 48 h dark period (Friday 20:00 ET → Sunday 20:00 ET) plus holidays and halts. Existing feeds
either go stale (report Friday's close) or echo thin on-chain trades. A Nightshift report gives a **fair value now**
plus a **calibrated band for the price at the next regular-session open**, so consumers can size risk to the gap.

## Report (per token)

| Field | Type | Units / meaning |
|---|---|---|
| `fairValue` | `uint128` | USD per **token**, 8 decimals. Best estimate of what the token is worth now (per-share fair value × the token's shares-per-token multiplier). |
| `lower` | `uint128` | USD per token, 8 decimals. 5th percentile of the predictive distribution of the token's value at `anchorTime`. |
| `upper` | `uint128` | USD per token, 8 decimals. 95th percentile of the same distribution. |
| `anchorTime` | `uint64` | Unix seconds of the next regular-session open — the horizon `lower`/`upper` describe. During the regular session it equals `updatedAt` (band = live uncertainty). |
| `updatedAt` | `uint64` | Unix seconds when the aggregator produced the report. |
| `round` | `uint64` | Monotonic round id (one round per aggregation cycle). |
| `session` | `uint8` | Underlying US session at `updatedAt`: 0 regular, 1 pre, 2 post, 3 overnight, 4 closed (dark), 5 halted. |
| `flags` | `uint8` | Bitfield: bit0 corporate action / issuer pause, bit1 reference stale, bit2 thin liquidity, bit3 model degraded (fallback estimator in use). |

Invariants a valid report satisfies: `0 < lower <= fairValue <= upper`, `updatedAt <= block.timestamp`,
`anchorTime >= updatedAt`, `round` strictly increases per token.

## Contract interface

```solidity
interface INightshiftOracle {
    struct Report {
        uint128 fairValue;   // USD per token, 1e8
        uint128 lower;       // USD per token at anchorTime, 5th pct, 1e8
        uint128 upper;       // USD per token at anchorTime, 95th pct, 1e8
        uint64 anchorTime;   // next regular open (unix s)
        uint64 updatedAt;    // unix s
        uint64 round;
        uint8 session;       // 0 regular,1 pre,2 post,3 overnight,4 closed,5 halted
        uint8 flags;         // bit0 corpAction, bit1 refStale, bit2 thinLiquidity, bit3 degraded
    }
    event ReportPosted(address indexed token, uint64 indexed round, uint128 fairValue, uint128 lower, uint128 upper, uint8 session, uint8 flags);
    function getReport(address token) external view returns (Report memory);
    function decimals() external pure returns (uint8); // 8
}
```

Adapters built on top:

- **`NightshiftFeed`** (one per token) implements Chainlink `AggregatorV3Interface`: `latestRoundData()` returns
  `answer = fairValue`, `updatedAt = updatedAt`, `roundId = round`, `decimals() = 8`, plus `band()` returning
  `(lower, upper, anchorTime)`.
- **`NightshiftVenusOracle`** implements Venus `OracleInterface.getPrice(address asset)`: returns `fairValue` scaled to
  `1e(36 - assetDecimals)` (for 18-decimal tokens: `fairValue * 1e10`), reverting when the report is stale or flagged.

## Consumer guidance

- Value collateral for *borrowing* at `lower` (the next-open 5th percentile), never at `fairValue`, while
  `session != 0`. That is what makes a Sunday loan safe at Monday's open.
- Treat a report older than your staleness budget as absent. Treat `flags & 1` (corporate action) as a pause.
- The band width `(upper - lower) / fairValue` is the market's uncertainty. Gate risky actions on it.

## Off-chain mirror

The same report is served over HTTP (`GET /v1/fair-value/{token}`; b402-paid for the premium variant with full
distribution parameters) and is reproducible from the forecast commitments in `ForecastBook` and the tape.
