// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin-contracts/utils/math/Math.sol";

import {NightshiftCredit} from "../src/NightshiftCredit.sol";
import {MockERC20} from "./mocks/Mocks.sol";
import {CreditFixture} from "./utils/Fixtures.sol";

/// Weekend-gap liquidation behaviour: a Saturday loan sized at the band's lower edge, a Monday open below it.
contract NightshiftCreditLiquidationTest is CreditFixture {
    // Monday open gaps far below Saturday's lower edge ($220): $150 with a tight live band.
    uint128 internal constant MON_FAIR = 150e8;
    uint128 internal constant MON_LOWER = 149e8;
    uint128 internal constant MON_UPPER = 151e8;

    event Liquidated(
        address indexed liquidator,
        address indexed borrower,
        address indexed collateralToken,
        uint256 repaid,
        uint256 seized,
        uint256 price,
        address receiver
    );
    event BadDebtRealized(address indexed borrower, uint256 amount);

    function setUp() public override {
        super.setUp();
        _lend(lender, 1000e18);
        _depositCollateral(borrower, nvda, 1e18);
        _post(address(nvda), FAIR, LOWER, UPPER); // Saturday, session 4, anchor = Monday open
        _borrow(borrower, 110e18); // the maximum: 1 * $220 * 50%
        usdt.mint(liquidator, 10_000e18);
        vm.prank(liquidator);
        usdt.approve(address(credit), type(uint256).max);
    }

    function _monday(uint128 fair, uint128 lower, uint128 upper) internal {
        vm.warp(MON_OPEN + 60);
        _post(address(nvda), fair, lower, upper); // session 0, anchor = now
    }

    function _liquidate(uint256 repayAmount) internal returns (uint256 repaid, uint256 seized) {
        vm.prank(liquidator);
        return credit.liquidate(borrower, address(nvda), repayAmount, 0, liquidator);
    }

    /// Expected (repaid, seized) per the contract's formula, for an 18-decimal collateral and 18-decimal asset.
    function _expected(uint256 debt, uint256 repayAmount, uint256 price, uint256 balance)
        internal
        pure
        returns (uint256 repaid, uint256 seized)
    {
        uint256 maxRepay = Math.mulDiv(debt, 5000, 1e4, Math.Rounding.Ceil);
        repaid = Math.min(repayAmount, maxRepay);
        seized = Math.mulDiv(repaid, 10_500 * 1e26, 1e4 * price * 1e18);
        if (seized > balance) {
            seized = balance;
            uint256 needed = Math.mulDiv(balance, 1e4 * price * 1e18, 10_500 * 1e26, Math.Rounding.Ceil);
            if (needed < repaid) repaid = needed;
        }
    }

    // ------------------------------------------------------------------ eligibility

    function test_saturdayPositionIsNotLiquidatable() public {
        assertFalse(credit.isLiquidatable(borrower));
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.PositionHealthy.selector, borrower, 143e18, 110e18));
        credit.liquidate(borrower, address(nvda), 1e18, 0, liquidator);
    }

    function test_noDebtIsNotLiquidatable() public {
        _depositCollateral(lender, nvda, 1e18);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.PositionHealthy.selector, lender, 143e18, 0));
        credit.liquidate(lender, address(nvda), 1e18, 0, liquidator);
    }

    function test_mondayGapBelowLowerMakesPositionLiquidatable() public {
        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        NightshiftCredit.AccountData memory d = credit.getAccountData(borrower);
        assertEq(d.liquidationValue, 96.85e18); // 1 * $149 * 65%
        assertGt(d.debt, 110e18); // ~1.9 days of 8% APR on top
        assertLt(d.healthFactor, 1e18);
        assertTrue(credit.isLiquidatable(borrower));
    }

    function test_bandWideningAloneCanMakePositionLiquidatable() public {
        // Same fair value, but uncertainty about Monday's open explodes: lower falls to $165 (band 40%).
        vm.warp(SAT + 600);
        _post(address(nvda), FAIR, 165e8, 260e8);
        assertTrue(credit.isLiquidatable(borrower)); // 165 * 65% = 107.25 < 110
        (uint256 repaid, uint256 seized) = _liquidate(type(uint256).max);
        assertGt(repaid, 0);
        // Seized at fair value ($236) plus 5%: the borrower keeps more than if seized at lower.
        assertEq(seized, Math.mulDiv(repaid, 10_500 * 1e26, 1e4 * uint256(FAIR) * 1e18));
    }

    // ------------------------------------------------------------------ amounts

    function test_liquidation_exactAmountsAndEvent() public {
        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        uint256 debt = credit.debtOf(borrower);
        (uint256 expRepaid, uint256 expSeized) = _expected(debt, type(uint256).max, MON_FAIR, 1e18);

        vm.expectEmit(address(credit));
        emit Liquidated(liquidator, borrower, address(nvda), expRepaid, expSeized, MON_FAIR, liquidator);
        (uint256 repaid, uint256 seized) = _liquidate(type(uint256).max);
        assertEq(repaid, expRepaid);
        assertEq(seized, expSeized);
        assertEq(nvda.balanceOf(liquidator), seized);
        assertEq(credit.collateralOf(borrower, address(nvda)), 1e18 - seized);
        assertEq(credit.totalCollateral(address(nvda)), 1e18 - seized);
        assertApproxEqAbs(credit.debtOf(borrower), debt - repaid, 1);
        assertEq(credit.cash(), 890e18 + repaid);

        // Liquidator profit: collateral worth 105% of the repayment at fair value.
        assertApproxEqRel(seized * MON_FAIR / 1e8, repaid * 105 / 100, 1e12);
        // The position is healthy again and still fully backed at the realized price.
        assertFalse(credit.isLiquidatable(borrower));
        assertGe((1e18 - seized) * MON_FAIR / 1e8, credit.debtOf(borrower));
    }

    function test_liquidation_closeFactorCapsRepay() public {
        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        uint256 debt = credit.debtOf(borrower);
        (uint256 repaid,) = _liquidate(debt); // asks for everything
        assertEq(repaid, Math.mulDiv(debt, 5000, 1e4, Math.Rounding.Ceil));

        // A smaller request is honoured exactly (when the position is still unhealthy).
        _monday(100e8, 99e8, 101e8);
        (uint256 repaid2,) = _liquidate(1e18);
        assertEq(repaid2, 1e18);
    }

    function test_liquidation_tooSmall() public {
        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        vm.prank(liquidator);
        vm.expectRevert(NightshiftCredit.LiquidationTooSmall.selector); // 1 wei of USDT buys 0 collateral units
        credit.liquidate(borrower, address(nvda), 1, 0, liquidator);
    }

    function test_liquidation_minSeizedSlippageGuard() public {
        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        (, uint256 expSeized) = _expected(credit.debtOf(borrower), 10e18, MON_FAIR, 1e18);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.SeizeBelowMinimum.selector, expSeized, expSeized + 1));
        credit.liquidate(borrower, address(nvda), 10e18, expSeized + 1, liquidator);
        vm.prank(liquidator);
        credit.liquidate(borrower, address(nvda), 10e18, expSeized, liquidator);
    }

    // ------------------------------------------------------------------ crash beyond collateral: bad debt

    function test_crashBeyondCollateral_seizesAllAndRealizesBadDebt() public {
        _monday(50e8, 49e8, 51e8); // collateral worth $50 against ~$110 debt
        uint256 debt = credit.debtOf(borrower);
        uint256 assetsBefore = credit.totalAssets();
        (uint256 expRepaid, uint256 expSeized) = _expected(debt, type(uint256).max, 50e8, 1e18);
        assertEq(expSeized, 1e18); // capped at the balance
        uint256 index = credit.borrowIndex();
        uint256 remainingScaled = credit.scaledDebtOf(borrower) - Math.mulDiv(expRepaid, 1e27, index);
        uint256 expBadDebt = Math.mulDiv(remainingScaled, index, 1e27, Math.Rounding.Ceil);
        assertApproxEqAbs(expBadDebt, debt - expRepaid, 1);

        vm.expectEmit(address(credit));
        emit BadDebtRealized(borrower, expBadDebt);
        (uint256 repaid, uint256 seized) = _liquidate(type(uint256).max);
        assertEq(repaid, expRepaid);
        assertEq(seized, 1e18);
        assertApproxEqAbs(repaid, uint256(50e18) * 1e4 / 10_500, 1); // $50 of collateral net of the 5% bonus

        // Position fully closed; the shortfall is socialized immediately (share price drops by exactly it).
        assertEq(credit.debtOf(borrower), 0);
        assertEq(credit.scaledDebtOf(borrower), 0);
        assertEq(credit.getAccountData(borrower).collateralMask, 0);
        assertEq(credit.totalScaledDebt(), 0);
        assertEq(credit.totalAssets(), credit.cash());
        assertApproxEqAbs(assetsBefore - credit.totalAssets(), debt - repaid, 2);
        assertEq(usdt.balanceOf(address(credit)), credit.cash());
    }

    // ------------------------------------------------------------------ seize gates

    function test_seizeRequiresFreshReport() public {
        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        vm.warp(block.timestamp + 3601);
        vm.prank(liquidator);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.StaleReport.selector, address(nvda), MON_OPEN + 60, 3600)
        );
        credit.liquidate(borrower, address(nvda), 1e18, 0, liquidator);
    }

    function test_seizeBlockedByCorporateActionButNotByDegradedOrWideBand() public {
        vm.warp(MON_OPEN + 60);
        _postFlags(address(nvda), MON_FAIR, MON_LOWER, MON_UPPER, 1);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.CorporateAction.selector, address(nvda)));
        credit.liquidate(borrower, address(nvda), 1e18, 0, liquidator);

        // Degraded model and a very wide band block borrowing but must not block liquidation.
        _postFlags(address(nvda), MON_FAIR, 100e8, 200e8, 8);
        (uint256 repaid,) = _liquidate(1e18);
        assertEq(repaid, 1e18);
    }

    function test_liquidate_argumentReverts() public {
        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        vm.prank(borrower);
        vm.expectRevert(NightshiftCredit.SelfLiquidation.selector);
        credit.liquidate(borrower, address(nvda), 1e18, 0, borrower);

        vm.startPrank(liquidator);
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        credit.liquidate(borrower, address(nvda), 1e18, 0, address(0));
        vm.expectRevert(NightshiftCredit.ZeroAmount.selector);
        credit.liquidate(borrower, address(nvda), 0, 0, liquidator);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.CollateralNotListed.selector, address(usdt)));
        credit.liquidate(borrower, address(usdt), 1e18, 0, liquidator);
        vm.stopPrank();

        MockERC20 tsla = new MockERC20("Tesla", "TSLAB", 18);
        vm.prank(owner);
        credit.setCollateral(address(tsla), _defaultParams());
        _post(address(tsla), 400e8, 399e8, 401e8);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.NoCollateral.selector, borrower, address(tsla)));
        credit.liquidate(borrower, address(tsla), 1e18, 0, liquidator);
    }

    // ------------------------------------------------------------------ cannot be shielded

    function test_staleOtherCollateralDoesNotBlockLiquidation() public {
        MockERC20 tsla = new MockERC20("Tesla", "TSLAB", 18);
        vm.prank(owner);
        credit.setCollateral(address(tsla), _defaultParams());
        _post(address(tsla), 10e8, 9.5e8, 10.5e8); // Saturday report, will be stale on Monday
        _depositCollateral(borrower, tsla, 1e18);

        _monday(MON_FAIR, MON_LOWER, MON_UPPER); // only NVDAB is refreshed
        assertTrue(credit.isLiquidatable(borrower)); // 96.85 + 6.175 < ~110
        (uint256 repaid, uint256 seized) = _liquidate(type(uint256).max);
        assertGt(repaid, 0);
        assertGt(seized, 0);
    }

    function test_collateralWithoutAnyReportCannotShieldPosition() public {
        MockERC20 junk = new MockERC20("Junk", "JUNK", 18);
        vm.prank(owner);
        credit.setCollateral(address(junk), _defaultParams());
        _depositCollateral(borrower, junk, 1); // never reported: contributes 0, must not make liquidation revert

        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        (uint256 repaid,) = _liquidate(type(uint256).max);
        assertGt(repaid, 0);

        // The junk dust also keeps the account from being written off, so remaining debt stays owed.
        assertGt(credit.debtOf(borrower), 0);
    }

    // ------------------------------------------------------------------ end-to-end: lenders stay whole

    function test_weekendGap_lendersStayWhole() public {
        _monday(MON_FAIR, MON_LOWER, MON_UPPER);
        _liquidate(type(uint256).max);
        assertGe(credit.totalAssets(), 1000e18); // no loss: principal plus interest
        assertGe(credit.convertToAssets(credit.balanceOf(lender)), 1000e18);

        // Borrower settles the rest; the lender exits with principal plus interest.
        _repay(borrower, type(uint256).max);
        uint256 shares = credit.balanceOf(lender);
        vm.prank(lender);
        uint256 out = credit.redeem(shares, lender, lender);
        assertGt(out, 1000e18);
        assertEq(credit.totalSupply(), 0);
        assertLe(credit.cash(), 1); // only rounding dust remains
    }
}
