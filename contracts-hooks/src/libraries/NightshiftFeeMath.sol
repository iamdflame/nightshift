// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {INightshiftOracle} from "../interfaces/INightshiftOracle.sol";

/// @title NightshiftFeeMath
/// @notice The pure fee schedule behind NightshiftHook. Given (parameters, oracle report, pool price, trade direction,
///         time) it returns the LP fee in pips. No storage and no external calls, so every branch is unit- and
///         fuzz-testable without a PoolManager.
/// @dev Units: fees are pips (hundredths of a bip, 1_000_000 = 100%), the PancakeSwap Infinity LP-fee unit. The two
///      coefficients are ppm multipliers (1_000_000 = 1.0x). Prices are USD per whole stock token with 8 decimals,
///      the oracle's unit; the quote token is treated as exactly 1 USD.
///
///      Schedule:
///        report invalid / flagged (corporate action, degraded) / stale  ->  maxFee
///        base     = minFee                                               (session == 0, regular)
///        base     = minFee + uncertaintyCoef * (upper - lower) / FV      (session != 0, dark or thin hours)
///        informed = base + informedSlope * |pool - FV| / FV              (trade moves the pool price toward FV)
///        fee      = min(base or informed, maxFee)
library NightshiftFeeMath {
    /// @notice 100% in pips, also the scale of the ppm coefficients.
    uint256 internal constant ONE = 1_000_000;

    /// @notice Report flag bits (spec: bit0 corpAction, bit1 refStale, bit2 thinLiquidity, bit3 degraded).
    uint8 internal constant FLAG_CORPORATE_ACTION = 1;
    uint8 internal constant FLAG_DEGRADED = 8;
    /// @notice Flags under which the fair value must not be priced against: the hook charges maxFee instead.
    uint8 internal constant PROTECT_FLAGS = FLAG_CORPORATE_ACTION | FLAG_DEGRADED;

    /// @notice Session code of the regular US session; every other code (pre, post, overnight, closed, halted) is "dark".
    uint8 internal constant SESSION_REGULAR = 0;

    /// @notice Per-pool fee parameters. Packed into one storage slot.
    struct FeeParams {
        /// Floor fee in pips: the whole fee for uninformed flow during the regular session.
        uint24 minFee;
        /// Ceiling in pips for every fee; charged outright when the oracle cannot be trusted.
        uint24 maxFee;
        /// ppm share of the relative gap |pool - FV| / FV charged to flow that moves the pool toward FV.
        uint24 informedSlope;
        /// ppm share of the relative band width (upper - lower) / FV added to the base fee outside the regular session.
        uint24 uncertaintyCoef;
        /// Seconds after `updatedAt` at which a report is stale.
        uint32 maxAge;
    }

    /// @notice Which branch of the schedule priced a swap. Exposed by NightshiftHook.quoteFee for routers and UIs.
    enum Regime {
        Uninformed, // trade moves the price away from FV (or the pool is at FV): base fee
        Informed, // trade moves the price toward FV: base fee + informedSlope * gap
        Stale, // report older than maxAge: maxFee
        Flagged, // corporate action or degraded model flag: maxFee
        InvalidReport, // report breaks the feed invariants: maxFee
        OracleFailure // oracle call reverted or returned malformed data (detected by the hook): maxFee
    }

    /// @notice Pool mid price in USD per whole stock token, 8 decimals.
    /// @dev sqrtPriceX96 encodes sqrt(raw currency1 / raw currency0) * 2^96. priceX128 = sqrtPriceX96^2 / 2^64 is that
    ///      raw ratio as a Q128.128 number and is exact (floor) over the whole PancakeSwap price range: MIN_SQRT_RATIO
    ///      > 2^32 keeps it >= 1 and MAX_SQRT_RATIO < 2^160 keeps it < 2^256. With decimals <= 18 the result is below
    ///      2^128 * 1e26, so nothing downstream can overflow. Requires sqrtPriceX96 >= 2^32 (any initialized pool).
    /// @param sqrtPriceX96 Pool sqrt price from slot0.
    /// @param stockIsCurrency0 True when the stock token is currency0 (and the quote is currency1).
    /// @param stockDecimals Decimals of the stock token (<= 18).
    /// @param quoteDecimals Decimals of the quote token (<= 18).
    function poolPriceE8(uint160 sqrtPriceX96, bool stockIsCurrency0, uint8 stockDecimals, uint8 quoteDecimals)
        internal
        pure
        returns (uint256)
    {
        uint256 priceX128 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
        uint256 scale = 10 ** (8 + uint256(stockDecimals));
        // stock = currency0: USD/stock = (raw quote per raw stock) * 10^stockDecimals / 10^quoteDecimals.
        // stock = currency1: the raw ratio is stock per quote, so invert it.
        uint256 scaled = stockIsCurrency0 ? Math.mulDiv(priceX128, scale, 1 << 128) : Math.mulDiv(1 << 128, scale, priceX128);
        // floor(floor(a / b) / c) == floor(a / (b * c)) for positive integers: no precision is lost by splitting.
        return scaled / 10 ** uint256(quoteDecimals);
    }

    /// @notice Inverse of poolPriceE8: the sqrtPriceX96 at which the pool quotes `priceE8` USD per stock token.
    /// @dev Used off the hot path (deployment, tests). Rounds down; reverts on prices outside the representable range.
    function sqrtPriceX96FromPriceE8(uint256 priceE8, bool stockIsCurrency0, uint8 stockDecimals, uint8 quoteDecimals)
        internal
        pure
        returns (uint160)
    {
        uint256 stockScale = 10 ** (8 + uint256(stockDecimals));
        uint256 quoteScale = 10 ** uint256(quoteDecimals);
        // ratioX192 = raw currency1 per raw currency0, as a Q64.192 number.
        uint256 ratioX192 = stockIsCurrency0
            ? Math.mulDiv(priceE8 * quoteScale, 1 << 192, stockScale)
            : Math.mulDiv(stockScale, 1 << 192, priceE8 * quoteScale);
        return SafeCastU160.toUint160(Math.sqrt(ratioX192));
    }

    /// @notice True when the trade buys the stock token (the quote token goes in).
    function isBuyingStock(bool zeroForOne, bool stockIsCurrency0) internal pure returns (bool) {
        // zeroForOne means currency0 goes in. Buying stock means the quote goes in, i.e. the quote is the input side.
        return zeroForOne != stockIsCurrency0;
    }

    /// @notice True when the trade moves the pool price toward fair value: buying below FV or selling above FV.
    function isInformed(bool buyingStock, uint256 priceE8, uint256 fairValueE8) internal pure returns (bool) {
        return buyingStock ? priceE8 < fairValueE8 : priceE8 > fairValueE8;
    }

    /// @notice Decides whether a report may be priced against at all.
    /// @return ok False when the caller must charge maxFee.
    /// @return regime Uninformed when ok (the caller refines it); otherwise why the report was rejected.
    function checkReport(FeeParams memory p, INightshiftOracle.Report memory r, uint256 nowTs)
        internal
        pure
        returns (bool ok, Regime regime)
    {
        // Feed invariants: 0 < lower <= fairValue <= upper, anchorTime >= updatedAt, updatedAt <= now.
        if (r.lower == 0 || r.lower > r.fairValue || r.fairValue > r.upper || r.updatedAt > nowTs || r.anchorTime < r.updatedAt) {
            return (false, Regime.InvalidReport);
        }
        if (r.flags & PROTECT_FLAGS != 0) return (false, Regime.Flagged);
        if (nowTs - r.updatedAt > p.maxAge) return (false, Regime.Stale);
        return (true, Regime.Uninformed);
    }

    /// @notice Base fee in pips (uncapped): minFee, plus the uncertainty premium outside the regular session.
    /// @dev coef (ppm) * band / FV is already in pips because both scales are 1e6. Cannot overflow: band < 2^128.
    function baseFee(FeeParams memory p, INightshiftOracle.Report memory r) internal pure returns (uint256 fee) {
        fee = p.minFee;
        if (r.session != SESSION_REGULAR) fee += Math.mulDiv(r.upper - r.lower, p.uncertaintyCoef, r.fairValue);
    }

    /// @notice Fee for a report that passed checkReport.
    /// @dev Cannot overflow: priceE8 < 2^128 * 1e26 (see poolPriceE8) and informedSlope <= 2^24.
    function feeForUsableReport(
        FeeParams memory p,
        INightshiftOracle.Report memory r,
        uint256 priceE8,
        bool buyingStock
    ) internal pure returns (uint24 fee, Regime regime) {
        uint256 f = baseFee(p, r);
        uint256 fv = r.fairValue;
        if (isInformed(buyingStock, priceE8, fv)) {
            regime = Regime.Informed;
            uint256 gap = priceE8 > fv ? priceE8 - fv : fv - priceE8;
            f += Math.mulDiv(gap, p.informedSlope, fv);
        } else {
            regime = Regime.Uninformed;
        }
        fee = f < p.maxFee ? uint24(f) : p.maxFee;
    }

    /// @notice The full schedule: report checks, then base and informed components, capped at maxFee.
    /// @param p Pool fee parameters.
    /// @param r Oracle report for the stock token.
    /// @param priceE8 Pool price, USD per stock token, 8 decimals (see poolPriceE8).
    /// @param buyingStock True when the trade buys the stock token.
    /// @param nowTs Current timestamp.
    function computeFee(
        FeeParams memory p,
        INightshiftOracle.Report memory r,
        uint256 priceE8,
        bool buyingStock,
        uint256 nowTs
    ) internal pure returns (uint24 fee, Regime regime) {
        bool ok;
        (ok, regime) = checkReport(p, r, nowTs);
        if (!ok) return (p.maxFee, regime);
        return feeForUsableReport(p, r, priceE8, buyingStock);
    }
}

/// @dev Minimal checked downcast (OpenZeppelin SafeCast would pull in the whole library for one function).
library SafeCastU160 {
    error SafeCastU160Overflow(uint256 value);

    function toUint160(uint256 x) internal pure returns (uint160) {
        if (x > type(uint160).max) revert SafeCastU160Overflow(x);
        return uint160(x);
    }
}
