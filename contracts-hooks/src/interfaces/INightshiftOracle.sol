// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title INightshiftOracle (Nightshift Fair Value Feed v1)
/// @notice Copied verbatim from docs/specs/fair-value-feed-v1.md. Do not edit here without bumping the spec.
/// @dev Report invariants: 0 < lower <= fairValue <= upper, updatedAt <= block.timestamp, anchorTime >= updatedAt.
interface INightshiftOracle {
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

    function getReport(address token) external view returns (Report memory);

    function decimals() external pure returns (uint8); // 8
}
