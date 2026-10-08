// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin-contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin-contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {INightshiftOracle} from "./interfaces/INightshiftOracle.sol";
import {OracleInterface} from "./interfaces/OracleInterface.sol";
import {ReportLib} from "./libraries/ReportLib.sol";

/// @title NightshiftVenusOracle
/// @author Nightshift
/// @notice Venus `OracleInterface` adapter: lets a Venus ResilientOracle (or any Venus-style consumer) price a
///         tokenized stock from Nightshift.
///
///         `getPrice(asset)` returns `fairValue` scaled to `1e(36 - assetDecimals)`. For an 18-decimal token that is
///         `fairValue * 1e10` (USD per whole token with 18 decimals).
///
///         It reverts, so the ResilientOracle falls back to its pivot/fallback source, when the report is
///           - missing (the oracle's `NoReport`),
///           - older than the owner-set {maxAge} ({StalePrice}),
///           - flagged corporate action / issuer pause, `flags & 1` ({CorporateActionPaused}),
///           - flagged model degraded, `flags & 8` ({ModelDegraded}).
///         Flags bit1 (reference stale) and bit2 (thin liquidity) are informational and do not block pricing.
contract NightshiftVenusOracle is OracleInterface, Ownable2Step {
    /// @notice Largest staleness budget the owner may configure.
    uint256 public constant MAX_MAX_AGE = 7 days;

    /// @dev Price decimals: 36 - assetDecimals, with the report already at 8, leaves 28 - assetDecimals to add.
    uint256 private constant SCALE_EXPONENT_BASE = 36 - ReportLib.PRICE_DECIMALS;

    /// @notice The Nightshift oracle read by this adapter.
    INightshiftOracle public immutable nightshift;

    /// @notice Maximum report age in seconds before {getPrice} reverts.
    uint256 public maxAge;

    event MaxAgeUpdated(uint256 previousMaxAge, uint256 newMaxAge);

    error ZeroAddress();
    error InvalidMaxAge(uint256 maxAge);
    error StalePrice(address asset, uint64 updatedAt, uint256 maxAge);
    error CorporateActionPaused(address asset);
    error ModelDegraded(address asset);
    error MalformedReport(address asset);
    error UnsupportedDecimals(address asset, uint8 decimals);
    error RenounceDisabled();

    /// @param nightshift_ The Nightshift oracle.
    /// @param initialOwner Owner allowed to tune {maxAge}.
    /// @param maxAge_ Initial staleness budget in seconds, `0 < maxAge_ <= MAX_MAX_AGE`.
    constructor(INightshiftOracle nightshift_, address initialOwner, uint256 maxAge_) Ownable(initialOwner) {
        if (address(nightshift_) == address(0)) revert ZeroAddress();
        nightshift = nightshift_;
        _setMaxAge(maxAge_);
    }

    /// @notice Set the staleness budget, `0 < newMaxAge <= MAX_MAX_AGE`.
    function setMaxAge(uint256 newMaxAge) external onlyOwner {
        _setMaxAge(newMaxAge);
    }

    /// @notice Ownership can only be transferred (two-step), never renounced.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    /// @inheritdoc OracleInterface
    function getPrice(address asset) external view returns (uint256) {
        INightshiftOracle.Report memory r = nightshift.getReport(asset);
        if (!ReportLib.isFreshAt(r.updatedAt, maxAge)) revert StalePrice(asset, r.updatedAt, maxAge);
        if (r.flags & ReportLib.FLAG_CORPORATE_ACTION != 0) revert CorporateActionPaused(asset);
        if (r.flags & ReportLib.FLAG_DEGRADED != 0) revert ModelDegraded(asset);
        if (r.fairValue == 0) revert MalformedReport(asset);

        uint8 assetDecimals = IERC20Metadata(asset).decimals();
        if (assetDecimals > SCALE_EXPONENT_BASE) revert UnsupportedDecimals(asset, assetDecimals);
        // fairValue < 2^128 and the multiplier is at most 1e28 < 2^94, so the product cannot overflow.
        return uint256(r.fairValue) * 10 ** (SCALE_EXPONENT_BASE - assetDecimals);
    }

    function _setMaxAge(uint256 newMaxAge) private {
        if (newMaxAge == 0 || newMaxAge > MAX_MAX_AGE) revert InvalidMaxAge(newMaxAge);
        emit MaxAgeUpdated(maxAge, newMaxAge);
        maxAge = newMaxAge;
    }
}
