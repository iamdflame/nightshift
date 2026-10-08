// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NightshiftFeeMath, SafeCastU160} from "../src/libraries/NightshiftFeeMath.sol";
import {INightshiftOracle} from "../src/interfaces/INightshiftOracle.sol";

/// @dev External wrapper so reverts inside internal library code can be asserted with vm.expectRevert.
contract FeeMathHarness {
    function sqrtPriceX96FromPriceE8(uint256 priceE8, bool stockIsCurrency0, uint8 ds, uint8 dq)
        external
        pure
        returns (uint160)
    {
        return NightshiftFeeMath.sqrtPriceX96FromPriceE8(priceE8, stockIsCurrency0, ds, dq);
    }

    function poolPriceE8(uint160 sqrtPriceX96, bool stockIsCurrency0, uint8 ds, uint8 dq)
        external
        pure
        returns (uint256)
    {
        return NightshiftFeeMath.poolPriceE8(sqrtPriceX96, stockIsCurrency0, ds, dq);
    }
}

/// @title Unit and fuzz tests of the pure fee schedule (no PoolManager involved).
contract NightshiftFeeMathTest is Test {
    uint160 internal constant MIN_SQRT_RATIO = 4_295_128_739;
    uint160 internal constant MAX_SQRT_RATIO = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342;
    uint256 internal constant NOW = 1_760_000_000;

    // Reference values computed independently (Python big integers): floor(sqrt(ratio * 2^192)).
    uint160 internal constant SQRT_230_STOCK0 = 1_201_554_576_013_481_201_906_741_281_693; // ratio 230
    uint160 internal constant SQRT_230_STOCK1 = 5_224_150_330_493_396_530_029_309_920; // ratio 1/230
    uint160 internal constant SQRT_230_STOCK0_18_6 = 1_201_554_576_013_481_201_906_741; // 18-dec stock, 6-dec quote
    uint160 internal constant SQRT_230_STOCK1_8_18 = 52_241_503_304_933_965_300_293; // 8-dec stock, 18-dec quote

    FeeMathHarness internal harness;

    function setUp() public {
        vm.warp(NOW);
        harness = new FeeMathHarness();
    }

    // ------------------------------------------------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------------------------------------------------

    function _params() internal pure returns (NightshiftFeeMath.FeeParams memory) {
        // Launch defaults: 5 bps floor, 10% ceiling, 0.5x informed slope, 0.05x uncertainty, 15 min staleness.
        return NightshiftFeeMath.FeeParams({
            minFee: 500, maxFee: 100_000, informedSlope: 500_000, uncertaintyCoef: 50_000, maxAge: 900
        });
    }

    function _report(uint256 fv, uint256 lower, uint256 upper, uint8 session, uint8 flags, uint256 updatedAt)
        internal
        pure
        returns (INightshiftOracle.Report memory r)
    {
        r.fairValue = uint128(fv);
        r.lower = uint128(lower);
        r.upper = uint128(upper);
        r.updatedAt = uint64(updatedAt);
        r.anchorTime = uint64(updatedAt + 13 hours);
        r.round = 1;
        r.session = session;
        r.flags = flags;
    }

    /// Sunday night before a Monday gap: FV $236, next-open band $229-$243, overnight session, fresh.
    function _mondayReport() internal pure returns (INightshiftOracle.Report memory) {
        return _report(236e8, 229e8, 243e8, 3, 0, NOW - 60);
    }

    function _fee(INightshiftOracle.Report memory r, uint256 priceE8, bool buying)
        internal
        view
        returns (uint24 fee, NightshiftFeeMath.Regime regime)
    {
        return NightshiftFeeMath.computeFee(_params(), r, priceE8, buying, block.timestamp);
    }

    // ------------------------------------------------------------------------------------------------------------
    // price conversion
    // ------------------------------------------------------------------------------------------------------------

    function test_poolPrice_stockIsCurrency0() public pure {
        // floor(sqrt) loses < 1e-28 relative; the floor of the 8-decimal price lands one unit below 230e8.
        assertEq(NightshiftFeeMath.poolPriceE8(SQRT_230_STOCK0, true, 18, 18), 230e8 - 1);
    }

    function test_poolPrice_stockIsCurrency1() public pure {
        assertEq(NightshiftFeeMath.poolPriceE8(SQRT_230_STOCK1, false, 18, 18), 230e8);
    }

    function test_poolPrice_mixedDecimals() public pure {
        assertEq(NightshiftFeeMath.poolPriceE8(SQRT_230_STOCK0_18_6, true, 18, 6), 230e8 - 1);
        assertEq(NightshiftFeeMath.poolPriceE8(SQRT_230_STOCK1_8_18, false, 8, 18), 230e8);
    }

    function test_sqrtPriceFromPrice_matchesReference() public pure {
        assertEq(NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, true, 18, 18), SQRT_230_STOCK0);
        assertEq(NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, false, 18, 18), SQRT_230_STOCK1);
        assertEq(NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, true, 18, 6), SQRT_230_STOCK0_18_6);
        assertEq(NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, false, 8, 18), SQRT_230_STOCK1_8_18);
    }

    function test_sqrtPriceFromPrice_revertsOutOfRange() public {
        // 1e62 USD per token (0 decimals both sides) needs a sqrt price far above 2^160.
        vm.expectRevert();
        harness.sqrtPriceX96FromPriceE8(1e70, true, 0, 0);
    }

    function test_poolPrice_extremesDoNotRevert() public view {
        harness.poolPriceE8(MIN_SQRT_RATIO, true, 18, 18);
        harness.poolPriceE8(MIN_SQRT_RATIO, false, 18, 0);
        harness.poolPriceE8(MAX_SQRT_RATIO - 1, true, 18, 0);
        harness.poolPriceE8(MAX_SQRT_RATIO - 1, false, 18, 18);
    }

    // ------------------------------------------------------------------------------------------------------------
    // direction
    // ------------------------------------------------------------------------------------------------------------

    function test_isBuyingStock_truthTable() public pure {
        // stock = currency0: zeroForOne sends the stock in (sell); oneForZero sends the quote in (buy).
        assertFalse(NightshiftFeeMath.isBuyingStock(true, true));
        assertTrue(NightshiftFeeMath.isBuyingStock(false, true));
        // stock = currency1: zeroForOne sends the quote in (buy); oneForZero sends the stock in (sell).
        assertTrue(NightshiftFeeMath.isBuyingStock(true, false));
        assertFalse(NightshiftFeeMath.isBuyingStock(false, false));
    }

    function test_isInformed_directions() public pure {
        assertTrue(NightshiftFeeMath.isInformed(true, 230e8, 236e8)); // buy below FV
        assertFalse(NightshiftFeeMath.isInformed(false, 230e8, 236e8)); // sell below FV
        assertTrue(NightshiftFeeMath.isInformed(false, 240e8, 236e8)); // sell above FV
        assertFalse(NightshiftFeeMath.isInformed(true, 240e8, 236e8)); // buy above FV
        assertFalse(NightshiftFeeMath.isInformed(true, 236e8, 236e8)); // at FV: both directions move away
        assertFalse(NightshiftFeeMath.isInformed(false, 236e8, 236e8));
    }

    // ------------------------------------------------------------------------------------------------------------
    // the worked example of docs/hook.md (Monday gap: pool $230, FV $236)
    // ------------------------------------------------------------------------------------------------------------

    function test_mondayGap_informedBuyPaysGap() public view {
        // base = 500 + 50_000 * 14e8 / 236e8 = 500 + 2_966 ; informed = base + 500_000 * 6e8 / 236e8 = base + 12_711
        (uint24 fee, NightshiftFeeMath.Regime regime) = _fee(_mondayReport(), 230e8, true);
        assertEq(fee, 16_177);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Informed));
    }

    function test_mondayGap_uninformedSellPaysBase() public view {
        (uint24 fee, NightshiftFeeMath.Regime regime) = _fee(_mondayReport(), 230e8, false);
        assertEq(fee, 3466);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Uninformed));
    }

    /// @dev The fee table published in docs/hook.md (LP fee in pips, before PancakeSwap's protocol fee).
    function test_mondayGap_feeSchedule() public view {
        INightshiftOracle.Report memory r = _mondayReport();
        uint256[8] memory prices = [uint256(220e8), 225e8, 230e8, 233e8, 236e8, 239e8, 242e8, 250e8];
        uint24[8] memory buyFees = [uint24(37_364), 26_771, 16_177, 9821, 3466, 3466, 3466, 3466];
        uint24[8] memory sellFees = [uint24(3466), 3466, 3466, 3466, 3466, 9821, 16_177, 33_127];
        for (uint256 i; i < prices.length; ++i) {
            (uint24 b,) = _fee(r, prices[i], true);
            (uint24 s,) = _fee(r, prices[i], false);
            assertEq(b, buyFees[i], "buy");
            assertEq(s, sellFees[i], "sell");
            assertEq(b, _expected(r, prices[i], true), "buy closed form");
            assertEq(s, _expected(r, prices[i], false), "sell closed form");
        }
    }

    /// @dev Closed-form reference of the schedule, written independently of the library.
    function _expected(INightshiftOracle.Report memory r, uint256 price, bool buying) internal pure returns (uint24) {
        NightshiftFeeMath.FeeParams memory p = _params();
        uint256 fv = r.fairValue;
        uint256 base = p.minFee + (r.session == 0 ? 0 : (uint256(r.upper - r.lower) * p.uncertaintyCoef) / fv);
        bool informed = buying ? price < fv : price > fv;
        uint256 gap = price > fv ? price - fv : fv - price;
        uint256 f = base + (informed ? (gap * p.informedSlope) / fv : 0);
        return uint24(f > p.maxFee ? p.maxFee : f);
    }

    // ------------------------------------------------------------------------------------------------------------
    // base fee, sessions, caps
    // ------------------------------------------------------------------------------------------------------------

    function test_regularSession_baseIsMinFee() public view {
        // Wide band during the regular session is ignored: the base is exactly minFee.
        INightshiftOracle.Report memory r = _report(236e8, 200e8, 270e8, 0, 0, NOW);
        (uint24 fee, NightshiftFeeMath.Regime regime) = _fee(r, 240e8, true);
        assertEq(fee, 500);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Uninformed));
        // Informed in session: 500 + 500_000 * 4e8 / 236e8 = 500 + 8_474
        (fee,) = _fee(r, 240e8, false);
        assertEq(fee, 8974);
    }

    function test_darkSessions_addUncertaintyPremium() public view {
        for (uint8 session = 1; session <= 5; ++session) {
            INightshiftOracle.Report memory r = _report(236e8, 229e8, 243e8, session, 0, NOW);
            (uint24 fee,) = _fee(r, 240e8, true); // uninformed
            assertEq(fee, 3466, "dark base");
        }
    }

    function test_cap_informedFeeCappedAtMaxFee() public view {
        // 50% below FV: 3_466 + 250_000 > maxFee
        (uint24 fee, NightshiftFeeMath.Regime regime) = _fee(_mondayReport(), 118e8, true);
        assertEq(fee, 100_000);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Informed));
    }

    function test_cap_baseFeeCappedAtMaxFee() public view {
        // A band as wide as 5x FV would ask for a 25% premium: capped.
        INightshiftOracle.Report memory r = _report(100e8, 1e8, 501e8, 4, 0, NOW);
        (uint24 fee,) = _fee(r, 100e8, true);
        assertEq(fee, 100_000);
    }

    function test_zeroSlope_noInformedPremium() public view {
        NightshiftFeeMath.FeeParams memory p = _params();
        p.informedSlope = 0;
        (uint24 fee, NightshiftFeeMath.Regime regime) =
            NightshiftFeeMath.computeFee(p, _mondayReport(), 230e8, true, block.timestamp);
        assertEq(fee, 3466);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Informed));
    }

    // ------------------------------------------------------------------------------------------------------------
    // staleness, flags, invalid reports
    // ------------------------------------------------------------------------------------------------------------

    function test_stale_chargesMaxFee() public view {
        INightshiftOracle.Report memory r = _report(236e8, 229e8, 243e8, 3, 0, NOW - 901);
        (uint24 fee, NightshiftFeeMath.Regime regime) = _fee(r, 240e8, true);
        assertEq(fee, 100_000);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Stale));
    }

    function test_notStale_atExactlyMaxAge() public view {
        INightshiftOracle.Report memory r = _report(236e8, 229e8, 243e8, 3, 0, NOW - 900);
        (uint24 fee,) = _fee(r, 240e8, true);
        assertEq(fee, 3466);
    }

    function test_flags_corporateActionAndDegradedChargeMaxFee() public view {
        uint8[2] memory protect = [uint8(1), 8];
        for (uint256 i; i < protect.length; ++i) {
            INightshiftOracle.Report memory r = _report(236e8, 229e8, 243e8, 0, protect[i], NOW);
            (uint24 fee, NightshiftFeeMath.Regime regime) = _fee(r, 236e8, true);
            assertEq(fee, 100_000);
            assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Flagged));
        }
        INightshiftOracle.Report memory both = _report(236e8, 229e8, 243e8, 0, 1 | 8, NOW);
        (uint24 f,) = _fee(both, 236e8, true);
        assertEq(f, 100_000);
    }

    function test_flags_refStaleAndThinLiquidityDoNotProtect() public view {
        // bit1 (reference stale) and bit2 (thin liquidity) are informational: the normal schedule applies.
        INightshiftOracle.Report memory r = _report(236e8, 229e8, 243e8, 3, 2 | 4, NOW);
        (uint24 fee, NightshiftFeeMath.Regime regime) = _fee(r, 230e8, true);
        assertEq(fee, 16_177);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Informed));
    }

    function test_invalidReports_chargeMaxFee() public view {
        INightshiftOracle.Report[6] memory bad = [
            _report(0, 0, 0, 0, 0, NOW), // empty (unknown token)
            _report(236e8, 0, 243e8, 0, 0, NOW), // lower == 0
            _report(236e8, 237e8, 243e8, 0, 0, NOW), // lower > fairValue
            _report(236e8, 229e8, 235e8, 0, 0, NOW), // fairValue > upper
            _report(236e8, 229e8, 243e8, 0, 0, NOW + 1), // updatedAt in the future
            _report(236e8, 229e8, 243e8, 0, 0, NOW) // anchorTime < updatedAt (patched below)
        ];
        bad[5].anchorTime = uint64(NOW - 1);
        for (uint256 i; i < bad.length; ++i) {
            (uint24 fee, NightshiftFeeMath.Regime regime) = _fee(bad[i], 236e8, true);
            assertEq(fee, 100_000);
            assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.InvalidReport));
        }
    }

    function test_degenerateBand_isValid() public view {
        // lower == fairValue == upper satisfies the invariants: no uncertainty premium.
        INightshiftOracle.Report memory r = _report(236e8, 236e8, 236e8, 4, 0, NOW);
        (uint24 fee,) = _fee(r, 240e8, true);
        assertEq(fee, 500);
    }

    // ------------------------------------------------------------------------------------------------------------
    // token order both ways
    // ------------------------------------------------------------------------------------------------------------

    function test_tokenOrder_sameEconomicsBothWays() public view {
        INightshiftOracle.Report memory r = _mondayReport();
        // stock = currency0 (NVDAB/USDT on BSC): buying stock is oneForZero.
        uint256 p0 = NightshiftFeeMath.poolPriceE8(SQRT_230_STOCK0, true, 18, 18);
        // stock = currency1: buying stock is zeroForOne.
        uint256 p1 = NightshiftFeeMath.poolPriceE8(SQRT_230_STOCK1, false, 18, 18);

        (uint24 buy0,) = _fee(r, p0, NightshiftFeeMath.isBuyingStock(false, true));
        (uint24 buy1,) = _fee(r, p1, NightshiftFeeMath.isBuyingStock(true, false));
        (uint24 sell0,) = _fee(r, p0, NightshiftFeeMath.isBuyingStock(true, true));
        (uint24 sell1,) = _fee(r, p1, NightshiftFeeMath.isBuyingStock(false, false));
        assertEq(buy0, buy1);
        assertEq(sell0, sell1);
        assertEq(buy0, 16_177);
        assertEq(sell0, 3466);
    }

    // ------------------------------------------------------------------------------------------------------------
    // fuzz
    // ------------------------------------------------------------------------------------------------------------

    function _boundParams(NightshiftFeeMath.FeeParams memory p)
        internal
        pure
        returns (NightshiftFeeMath.FeeParams memory)
    {
        p.maxFee = uint24(bound(p.maxFee, 0, 500_000));
        p.minFee = uint24(bound(p.minFee, 0, p.maxFee));
        p.informedSlope = uint24(bound(p.informedSlope, 0, 1_000_000));
        p.uncertaintyCoef = uint24(bound(p.uncertaintyCoef, 0, 1_000_000));
        p.maxAge = uint32(bound(p.maxAge, 60, 1 days));
        return p;
    }

    function _boundReport(uint256 fv, uint256 lowerBps, uint256 upperBps, uint8 session, uint8 flags, uint256 age)
        internal
        pure
        returns (INightshiftOracle.Report memory)
    {
        fv = bound(fv, 1e4, 1e14); // $0.0001 .. $1,000,000 per token
        uint256 lower = fv - (fv * bound(lowerBps, 0, 9999)) / 10_000;
        uint256 upper = fv + (fv * bound(upperBps, 0, 50_000)) / 10_000;
        if (lower == 0) lower = 1;
        return _report(fv, lower, upper, uint8(bound(session, 0, 5)), flags, NOW - bound(age, 0, 30 days));
    }

    function testFuzz_feeNeverExceedsMaxFee(
        NightshiftFeeMath.FeeParams memory p,
        INightshiftOracle.Report memory r,
        uint256 priceE8,
        bool buying
    ) public view {
        p = _boundParams(p);
        priceE8 = bound(priceE8, 0, 2 ** 128 * 1e26);
        (uint24 fee,) = NightshiftFeeMath.computeFee(p, r, priceE8, buying, block.timestamp);
        assertLe(fee, p.maxFee);
    }

    function testFuzz_unusableReportsPayExactlyMaxFee(
        NightshiftFeeMath.FeeParams memory p,
        INightshiftOracle.Report memory r,
        uint256 priceE8,
        bool buying
    ) public view {
        p = _boundParams(p);
        (bool ok,) = NightshiftFeeMath.checkReport(p, r, block.timestamp);
        (uint24 fee, NightshiftFeeMath.Regime regime) =
            NightshiftFeeMath.computeFee(p, r, bound(priceE8, 0, 1e30), buying, block.timestamp);
        if (!ok) {
            assertEq(fee, p.maxFee);
            assertGe(uint8(regime), uint8(NightshiftFeeMath.Regime.Stale));
        } else {
            assertLe(uint8(regime), uint8(NightshiftFeeMath.Regime.Informed));
        }
    }

    function testFuzz_usableFeeAtLeastMinFee(
        NightshiftFeeMath.FeeParams memory p,
        uint256 fv,
        uint256 lowerBps,
        uint256 upperBps,
        uint8 session,
        uint256 age,
        uint256 priceE8,
        bool buying
    ) public view {
        p = _boundParams(p);
        INightshiftOracle.Report memory r = _boundReport(fv, lowerBps, upperBps, session, 0, age);
        vm.assume(NOW - r.updatedAt <= p.maxAge);
        (uint24 fee,) = NightshiftFeeMath.computeFee(p, r, bound(priceE8, 1, 1e20), buying, block.timestamp);
        assertGe(fee, p.minFee);
    }

    function testFuzz_informedNeverCheaperThanUninformed(
        NightshiftFeeMath.FeeParams memory p,
        uint256 fv,
        uint256 lowerBps,
        uint256 upperBps,
        uint8 session,
        uint256 priceE8
    ) public view {
        p = _boundParams(p);
        INightshiftOracle.Report memory r = _boundReport(fv, lowerBps, upperBps, session, 0, 0);
        priceE8 = bound(priceE8, 1, 1e20);
        (uint24 buyFee, NightshiftFeeMath.Regime buyRegime) =
            NightshiftFeeMath.computeFee(p, r, priceE8, true, block.timestamp);
        (uint24 sellFee, NightshiftFeeMath.Regime sellRegime) =
            NightshiftFeeMath.computeFee(p, r, priceE8, false, block.timestamp);
        // Exactly one side is informed unless the pool sits at FV.
        if (priceE8 == r.fairValue) {
            assertEq(buyFee, sellFee);
            assertEq(uint8(buyRegime), uint8(NightshiftFeeMath.Regime.Uninformed));
        } else if (priceE8 < r.fairValue) {
            assertEq(uint8(buyRegime), uint8(NightshiftFeeMath.Regime.Informed));
            assertEq(uint8(sellRegime), uint8(NightshiftFeeMath.Regime.Uninformed));
            assertGe(buyFee, sellFee);
        } else {
            assertEq(uint8(sellRegime), uint8(NightshiftFeeMath.Regime.Informed));
            assertEq(uint8(buyRegime), uint8(NightshiftFeeMath.Regime.Uninformed));
            assertGe(sellFee, buyFee);
        }
    }

    function testFuzz_informedFeeMonotoneInGap(
        NightshiftFeeMath.FeeParams memory p,
        uint256 fv,
        uint256 gapA,
        uint256 gapB,
        bool below
    ) public view {
        p = _boundParams(p);
        INightshiftOracle.Report memory r = _boundReport(fv, 500, 500, 3, 0, 0);
        uint256 maxGap = below ? r.fairValue - 1 : r.fairValue * 10;
        gapA = bound(gapA, 1, maxGap);
        gapB = bound(gapB, gapA, maxGap);
        // informed direction: buy when below FV, sell when above
        uint256 pa = below ? r.fairValue - gapA : r.fairValue + gapA;
        uint256 pb = below ? r.fairValue - gapB : r.fairValue + gapB;
        (uint24 fa,) = NightshiftFeeMath.computeFee(p, r, pa, below, block.timestamp);
        (uint24 fb,) = NightshiftFeeMath.computeFee(p, r, pb, below, block.timestamp);
        assertGe(fb, fa);
    }

    function testFuzz_baseFeeMonotoneInBandWidth(
        NightshiftFeeMath.FeeParams memory p,
        uint256 fv,
        uint256 widthA,
        uint256 widthB,
        uint8 session
    ) public view {
        p = _boundParams(p);
        session = uint8(bound(session, 1, 5));
        widthA = bound(widthA, 0, 9999);
        widthB = bound(widthB, widthA, 9999);
        INightshiftOracle.Report memory ra = _boundReport(fv, widthA, widthA, session, 0, 0);
        INightshiftOracle.Report memory rb = _boundReport(fv, widthB, widthB, session, 0, 0);
        (uint24 fa,) = NightshiftFeeMath.computeFee(p, ra, ra.fairValue, true, block.timestamp);
        (uint24 fb,) = NightshiftFeeMath.computeFee(p, rb, rb.fairValue, true, block.timestamp);
        assertGe(fb, fa);
    }

    function testFuzz_protectiveStatesAlwaysMaxFee(
        NightshiftFeeMath.FeeParams memory p,
        uint256 fv,
        uint256 lowerBps,
        uint256 upperBps,
        uint8 session,
        uint8 flags,
        uint256 extraAge,
        uint256 priceE8,
        bool buying,
        uint8 which
    ) public view {
        p = _boundParams(p);
        INightshiftOracle.Report memory r = _boundReport(fv, lowerBps, upperBps, session, 0, 0);
        which = uint8(bound(which, 0, 2));
        if (which == 0) {
            r.updatedAt = uint64(NOW - p.maxAge - bound(extraAge, 1, 30 days));
            r.anchorTime = r.updatedAt;
        } else if (which == 1) {
            r.flags = flags | (flags % 2 == 0 ? 1 : 8);
        } else {
            r.lower = r.fairValue + 1; // breaks lower <= fairValue
        }
        (uint24 fee,) = NightshiftFeeMath.computeFee(p, r, bound(priceE8, 0, 1e30), buying, block.timestamp);
        assertEq(fee, p.maxFee);
    }

    /// @notice The fairness bound of the NatSpec: with informedSlope <= 1, a buyer moving the price up toward FV pays
    ///         at most FV * (1 + baseFee) per unit, i.e. no more than an uninformed trade at fair value.
    function testFuzz_buyerTowardFairValueNeverPaysAboveFairPlusBase(
        NightshiftFeeMath.FeeParams memory p,
        uint256 fv,
        uint256 lowerBps,
        uint256 upperBps,
        uint8 session,
        uint256 priceE8
    ) public view {
        p = _boundParams(p);
        INightshiftOracle.Report memory r = _boundReport(fv, lowerBps, upperBps, session, 0, 0);
        priceE8 = bound(priceE8, 1, r.fairValue);
        (uint24 fee,) = NightshiftFeeMath.computeFee(p, r, priceE8, true, block.timestamp);
        uint256 base = NightshiftFeeMath.baseFee(p, r);
        assertLe(priceE8 * (1e6 + fee), uint256(r.fairValue) * (1e6 + base));
    }

    /// @notice Seller-side counterpart: proceeds per unit are at least FV * (1 - baseFee) minus a second-order term
    ///         gap * (gap / FV + baseFee), i.e. fair to first order in the gap.
    function testFuzz_sellerTowardFairValueFairToFirstOrder(
        NightshiftFeeMath.FeeParams memory p,
        uint256 fv,
        uint256 lowerBps,
        uint256 upperBps,
        uint8 session,
        uint256 priceE8
    ) public view {
        p = _boundParams(p);
        INightshiftOracle.Report memory r = _boundReport(fv, lowerBps, upperBps, session, 0, 0);
        uint256 v = r.fairValue;
        priceE8 = bound(priceE8, v, 2 * v);
        (uint24 fee,) = NightshiftFeeMath.computeFee(p, r, priceE8, false, block.timestamp);
        uint256 base = NightshiftFeeMath.baseFee(p, r);
        vm.assume(base <= 1e6);
        uint256 gap = priceE8 - v;
        // all terms scaled by 1e6 (pips)
        uint256 proceeds = priceE8 * (1e6 - fee);
        uint256 fair = v * (1e6 - base);
        uint256 secondOrder = (gap * gap * 1e6) / v + gap * base + 1e6;
        assertGe(proceeds + secondOrder, fair);
    }

    function testFuzz_priceRoundTrip(uint256 priceE8, bool stockIsCurrency0, uint8 ds, uint8 dq) public view {
        ds = uint8(bound(ds, 0, 18));
        dq = uint8(bound(dq, 0, 18));
        priceE8 = bound(priceE8, 1e4, 1e14); // $0.0001 .. $1,000,000
        uint160 s = harness.sqrtPriceX96FromPriceE8(priceE8, stockIsCurrency0, ds, dq);
        // Skip combinations whose raw ratio lies outside the pool's tick range (e.g. a $0.0001 stock with 0 decimals
        // against an 18-decimal quote): such a pool cannot exist.
        vm.assume(s >= MIN_SQRT_RATIO && s < MAX_SQRT_RATIO);
        uint256 back = harness.poolPriceE8(s, stockIsCurrency0, ds, dq);
        // Error sources: floor(sqrt) (relative 2/s <= 5e-10 at the bottom of the tick range) and the final floor
        // (1 unit of 1e-8 USD).
        assertApproxEqAbs(back, priceE8, priceE8 / 1e9 + 1);
    }

    function testFuzz_sqrtPriceHelperCoversTickRange(uint256 priceE8, bool stockIsCurrency0, uint8 ds, uint8 dq)
        public
        view
    {
        ds = uint8(bound(ds, 0, 18));
        dq = uint8(bound(dq, 0, 18));
        priceE8 = bound(priceE8, 1, 1e18); // up to $10B per token
        // Raw ratios here stay below 2^128 (up to 1e28 either way), so the helper must never revert, including
        // the ratio > 2^64 branch, and must round-trip whenever the result is a valid pool price.
        uint160 s = harness.sqrtPriceX96FromPriceE8(priceE8, stockIsCurrency0, ds, dq);
        if (s >= MIN_SQRT_RATIO && s < MAX_SQRT_RATIO) {
            assertApproxEqAbs(harness.poolPriceE8(s, stockIsCurrency0, ds, dq), priceE8, priceE8 / 1e9 + 1);
        }
    }

    function testFuzz_poolPriceTotalAndMonotone(uint160 sa, uint160 sb, bool stockIsCurrency0, uint8 ds, uint8 dq)
        public
        view
    {
        ds = uint8(bound(ds, 0, 18));
        dq = uint8(bound(dq, 0, 18));
        sa = uint160(bound(sa, MIN_SQRT_RATIO, MAX_SQRT_RATIO - 1));
        sb = uint160(bound(sb, sa, MAX_SQRT_RATIO - 1));
        uint256 pa = harness.poolPriceE8(sa, stockIsCurrency0, ds, dq);
        uint256 pb = harness.poolPriceE8(sb, stockIsCurrency0, ds, dq);
        // A higher sqrt price means more currency1 per currency0: the stock gets dearer iff it is currency0.
        if (stockIsCurrency0) assertGe(pb, pa);
        else assertLe(pb, pa);
    }

    function testFuzz_tokenOrderSymmetry(uint256 priceE8, uint256 fv, bool buying) public view {
        // Stocks priced $1 .. $1,000,000. Below $1 the oracle's 8-decimal grid itself is coarser than 1 pip of fee.
        INightshiftOracle.Report memory r = _boundReport(bound(fv, 1e8, 1e14), 300, 300, 3, 0, 0);
        priceE8 = bound(priceE8, r.fairValue / 2, r.fairValue * 2);
        uint160 s0 = NightshiftFeeMath.sqrtPriceX96FromPriceE8(priceE8, true, 18, 18);
        uint160 s1 = NightshiftFeeMath.sqrtPriceX96FromPriceE8(priceE8, false, 18, 18);
        uint256 p0 = NightshiftFeeMath.poolPriceE8(s0, true, 18, 18);
        uint256 p1 = NightshiftFeeMath.poolPriceE8(s1, false, 18, 18);
        // zeroForOne flag that buys (or sells) the stock under each ordering
        bool zfo0 = !buying; // stock = currency0: buying means the quote (currency1) goes in
        bool zfo1 = buying; // stock = currency1: buying means the quote (currency0) goes in
        (uint24 f0,) =
            NightshiftFeeMath.computeFee(_params(), r, p0, NightshiftFeeMath.isBuyingStock(zfo0, true), block.timestamp);
        (uint24 f1,) = NightshiftFeeMath.computeFee(
            _params(), r, p1, NightshiftFeeMath.isBuyingStock(zfo1, false), block.timestamp
        );
        // The two encodings of the same price differ only by rounding (a few 1e-8 dollars): fees agree within 1 pip.
        assertApproxEqAbs(f0, f1, 1);
    }

    function test_safeCastU160() public {
        vm.expectRevert(abi.encodeWithSelector(SafeCastU160.SafeCastU160Overflow.selector, uint256(1) << 160));
        this.castExternal(uint256(1) << 160);
        assertEq(this.castExternal(type(uint160).max), type(uint160).max);
    }

    function castExternal(uint256 x) external pure returns (uint160) {
        return SafeCastU160.toUint160(x);
    }
}
