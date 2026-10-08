// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title INightshiftOracle
/// @notice Nightshift Fair Value Feed v1, the canonical consumer interface (docs/specs/fair-value-feed-v1.md).
/// @dev Kept identical to the spec so third parties can code against the document alone. Extra, non-breaking
///      reads that Nightshift's own consumers use live in {INightshiftOracleExtended}.
interface INightshiftOracle {
    /// @notice One fair-value report for one token.
    /// @dev Invariants enforced at write time: `0 < lower <= fairValue <= upper`, `updatedAt <= block.timestamp`,
    ///      `anchorTime >= updatedAt`, `round` strictly increasing per token, `session <= 5`.
    struct Report {
        uint128 fairValue; // USD per token, 1e8
        uint128 lower; // USD per token at anchorTime, 5th pct, 1e8
        uint128 upper; // USD per token at anchorTime, 95th pct, 1e8
        uint64 anchorTime; // next regular open (unix s)
        uint64 updatedAt; // unix s
        uint64 round;
        uint8 session; // 0 regular,1 pre,2 post,3 overnight,4 closed,5 halted
        uint8 flags; // bit0 corpAction, bit1 refStale, bit2 thinLiquidity, bit3 degraded
    }

    event ReportPosted(
        address indexed token,
        uint64 indexed round,
        uint128 fairValue,
        uint128 lower,
        uint128 upper,
        uint8 session,
        uint8 flags
    );

    /// @notice Latest report for `token`. Reverts if the token has never been reported.
    function getReport(address token) external view returns (Report memory);

    /// @notice Decimals of every price in a report (8).
    function decimals() external pure returns (uint8);
}

/// @title INightshiftOracleExtended
/// @notice Non-reverting and freshness reads implemented by {NightshiftOracle} on top of the v1 spec interface.
interface INightshiftOracleExtended is INightshiftOracle {
    /// @notice Latest report for `token` without reverting. `exists` is false (and `report` zeroed) if the token
    ///         was never reported. Consumers that must not be blockable by a missing report use this read.
    function tryGetReport(address token) external view returns (bool exists, Report memory report);

    /// @notice True iff `token` has a report and it is at most `maxAge` seconds old.
    function isFresh(address token, uint256 maxAge) external view returns (bool);
}
