// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title OracleInterface
/// @notice Venus Protocol's per-asset oracle interface (venus-protocol/oracle, `contracts/interfaces/OracleInterface.sol`).
///         The ResilientOracle consumes it as a main/pivot/fallback source.
/// @dev `getPrice` returns the USD price of one whole unit of `asset` scaled to `1e(36 - assetDecimals)`, i.e. the
///      price of the smallest unit in 1e18 precision.
interface OracleInterface {
    function getPrice(address asset) external view returns (uint256);
}
