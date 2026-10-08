// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {INightshiftOracle} from "../interfaces/INightshiftOracle.sol";

/// @title ReportLib
/// @notice Shared constants and pure helpers for reading Nightshift fair-value reports.
library ReportLib {
    /// @dev Prices in a report carry 8 decimals (USD per token).
    uint256 internal constant PRICE_DECIMALS = 8;
    uint256 internal constant PRICE_UNIT = 1e8;
    uint256 internal constant BPS = 10_000;

    /// @dev Session codes (underlying US session at `updatedAt`).
    uint8 internal constant SESSION_REGULAR = 0;
    uint8 internal constant SESSION_PRE = 1;
    uint8 internal constant SESSION_POST = 2;
    uint8 internal constant SESSION_OVERNIGHT = 3;
    uint8 internal constant SESSION_CLOSED = 4;
    uint8 internal constant SESSION_HALTED = 5;
    uint8 internal constant MAX_SESSION = SESSION_HALTED;

    /// @dev Flag bits.
    uint8 internal constant FLAG_CORPORATE_ACTION = 1; // bit0: corporate action / issuer pause
    uint8 internal constant FLAG_REFERENCE_STALE = 2; // bit1: off-chain reference stale
    uint8 internal constant FLAG_THIN_LIQUIDITY = 4; // bit2: thin liquidity
    uint8 internal constant FLAG_DEGRADED = 8; // bit3: model degraded (fallback estimator)

    /// @notice True iff `updatedAt` is at most `maxAge` seconds before now.
    /// @dev Written so it can neither underflow (a report "from the future" relative to a rewound clock counts as
    ///      fresh) nor overflow (any `maxAge`, including `type(uint256).max`, is accepted).
    function isFreshAt(uint64 updatedAt, uint256 maxAge) internal view returns (bool) {
        return updatedAt >= block.timestamp || block.timestamp - updatedAt <= maxAge;
    }

    /// @notice True iff the report is internally consistent: `0 < lower <= fairValue <= upper`.
    /// @dev The oracle enforces this on write; consumers re-check it so a faulty oracle implementation can never make
    ///      them divide by zero or underflow.
    function isWellFormed(INightshiftOracle.Report memory r) internal pure returns (bool) {
        return r.lower != 0 && r.lower <= r.fairValue && r.fairValue <= r.upper;
    }

    /// @notice Band width `(upper - lower) / fairValue` in basis points, rounded up. Requires a well-formed report.
    function bandBps(INightshiftOracle.Report memory r) internal pure returns (uint256) {
        uint256 width = uint256(r.upper) - uint256(r.lower);
        // ceil(width * BPS / fairValue); fairValue > 0 for well-formed reports.
        return (width * BPS + uint256(r.fairValue) - 1) / uint256(r.fairValue);
    }

    /// @notice True iff `(upper - lower) / fairValue <= maxBandBps / 10_000`, compared exactly (no rounding).
    function bandWithin(INightshiftOracle.Report memory r, uint256 maxBandBps) internal pure returns (bool) {
        return (uint256(r.upper) - uint256(r.lower)) * BPS <= maxBandBps * uint256(r.fairValue);
    }
}
