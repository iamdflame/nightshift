// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin-contracts/utils/math/Math.sol";

import {NightshiftCredit} from "../src/NightshiftCredit.sol";
import {MockERC20} from "./mocks/Mocks.sol";
import {CreditFixture} from "./utils/Fixtures.sol";

contract NightshiftCreditFuzzTest is CreditFixture {
    uint256 internal constant RAY = 1e27;

    function _fund(uint256 assets) internal {
        usdt.mint(lender, assets);
        vm.startPrank(lender);
        usdt.approve(address(credit), assets);
        credit.deposit(assets, lender);
        vm.stopPrank();
    }

    /// Borrowing power equals floor(amount * lower * ltv * 10^assetDec / (10^(collDec+8) * 1e4)) for any decimals,
    /// and the borrow check is exact: the power itself can be borrowed, one more wei cannot.
    function testFuzz_borrowPowerIsExactAndTight(uint256 amount, uint256 price, uint16 ltv, uint8 dec) public {
        dec = uint8(bound(dec, 0, 36));
        ltv = uint16(bound(ltv, 1, 9000));
        price = bound(price, 1, 1e16); // up to $100M per token
        amount = bound(amount, 1, 1e40);
        MockERC20 tok = new MockERC20("T", "T", dec);
        vm.prank(owner);
        credit.setCollateral(address(tok), NightshiftCredit.CollateralParams(true, ltv, ltv + 500, 500, 1500, 3600));
        _post(address(tok), uint128(price), uint128(price), uint128(price));
        _depositCollateral(borrower, tok, amount);

        uint256 expected = Math.mulDiv(amount, price * ltv * 1e18, 10 ** (uint256(dec) + 8) * 1e4);
        assertEq(credit.getAccountData(borrower).borrowPower, expected);
        vm.assume(expected > 0 && expected < 1e60);

        _fund(expected + 1);
        _borrow(borrower, expected);
        assertEq(credit.debtOf(borrower), expected);
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.InsufficientCollateral.selector, borrower, expected + 1, expected)
        );
        credit.borrow(1, borrower);
    }

    /// Debt never accrues slower than the stated APR, account debt >= the aggregate's share, and a full repay
    /// clears the account and every aggregate exactly.
    function testFuzz_interestRoundsAgainstBorrower(uint256 amount, uint256 elapsed, uint16 apr, uint256 steps) public {
        apr = uint16(bound(apr, 0, 10_000));
        elapsed = bound(elapsed, 1, 30 days);
        steps = bound(steps, 1, 5);
        vm.prank(owner);
        credit.setBorrowRate(apr);
        _fund(1000e18);
        _depositCollateral(borrower, nvda, 1e18);
        _post(address(nvda), FAIR, LOWER, UPPER);
        amount = bound(amount, 1, 110e18);
        _borrow(borrower, amount);

        uint256 rate = Math.mulDiv(apr, RAY, 1e4 * 365 days, Math.Rounding.Ceil);
        for (uint256 i; i < steps; ++i) {
            vm.warp(block.timestamp + elapsed);
            vm.prank(owner);
            credit.setBorrowRate(apr); // forces an accrual at every step (compounding)
        }
        uint256 debt = credit.debtOf(borrower);
        // Simple interest is a lower bound for per-step compounding.
        uint256 simple = amount + Math.mulDiv(amount, rate * elapsed * steps, RAY);
        assertGe(debt, simple);
        assertGe(debt, credit.totalDebt());
        assertLe(debt - credit.totalDebt(), 2);

        _repay(borrower, type(uint256).max);
        assertEq(credit.debtOf(borrower), 0);
        assertEq(credit.totalScaledDebt(), 0);
        assertEq(credit.totalAssets(), credit.cash());
        assertEq(usdt.balanceOf(address(credit)), credit.cash());
        assertGe(credit.cash(), 1000e18); // lenders got at least their principal back in cash
    }

    /// A newcomer depositing and immediately leaving never extracts value from existing lenders, whatever the state.
    function testFuzz_lenderRoundTripNeverProfits(uint256 seed, uint256 x, uint256 borrowed, uint256 elapsed) public {
        seed = bound(seed, 1, 1e30);
        x = bound(x, 1, 1e30);
        elapsed = bound(elapsed, 0, 365 days);
        _fund(seed);
        _depositCollateral(borrower, nvda, 1e24);
        _post(address(nvda), FAIR, LOWER, UPPER);
        borrowed = bound(borrowed, 0, Math.min(seed, 110e24)); // 1e24 NVDAB * $220 * 50%
        if (borrowed > 0) _borrow(borrower, borrowed);
        vm.warp(block.timestamp + elapsed);

        uint256 priceBefore = credit.convertToAssets(1e18);
        address newcomer = makeAddr("newcomer");
        usdt.mint(newcomer, x);
        vm.startPrank(newcomer);
        usdt.approve(address(credit), x);
        uint256 shares = credit.deposit(x, newcomer);
        uint256 out = credit.redeem(Math.min(shares, credit.maxRedeem(newcomer)), newcomer, newcomer);
        vm.stopPrank();

        assertLe(out, x);
        assertGe(credit.convertToAssets(1e18), priceBefore); // existing lenders were not diluted
    }

    /// The liquidator never receives more than repaid * (1 + bonus) at fair value, never repays more than the close
    /// factor allows, and every unit of collateral is accounted for.
    function testFuzz_liquidationBounds(uint256 mondayPrice, uint256 repayAmount, uint256 collateral) public {
        collateral = bound(collateral, 1e15, 1e24);
        _fund(1e30);
        _depositCollateral(borrower, nvda, collateral);
        _post(address(nvda), FAIR, LOWER, UPPER);
        uint256 maxBorrow = credit.getAccountData(borrower).borrowPower;
        vm.assume(maxBorrow > 0);
        _borrow(borrower, maxBorrow);

        mondayPrice = bound(mondayPrice, 1e6, 168e8); // below 220 * 50/65 + margin: liquidatable
        vm.warp(MON_OPEN);
        _post(address(nvda), uint128(mondayPrice), uint128(mondayPrice), uint128(mondayPrice));
        vm.assume(credit.isLiquidatable(borrower));
        uint256 debt = credit.debtOf(borrower);
        repayAmount = bound(repayAmount, 1, type(uint256).max);

        usdt.mint(liquidator, debt);
        vm.startPrank(liquidator);
        usdt.approve(address(credit), debt);
        try credit.liquidate(borrower, address(nvda), repayAmount, 0, liquidator) returns (
            uint256 repaid, uint256 seized
        ) {
            vm.stopPrank();
            assertLe(repaid, Math.mulDiv(debt, 5000, 1e4, Math.Rounding.Ceil));
            assertLe(repaid, repayAmount);
            // seized * price / 1e8 <= repaid * 1.05  (cross-multiplied, exact)
            assertLe(seized * mondayPrice * 1e4, repaid * 10_500 * 1e8);
            assertEq(nvda.balanceOf(liquidator), seized);
            assertEq(credit.collateralOf(borrower, address(nvda)) + seized, collateral);
            assertEq(credit.totalCollateral(address(nvda)), nvda.balanceOf(address(credit)));
            assertEq(usdt.balanceOf(address(credit)), credit.cash());
        } catch (bytes memory err) {
            vm.stopPrank();
            // Only a dust repay that buys zero collateral may fail.
            assertEq(bytes4(err), NightshiftCredit.LiquidationTooSmall.selector);
        }
    }

    /// The core claim: a loan taken against a band, at most `maxBand` wide, is fully backed and not liquidatable
    /// whenever the realized next-open price is at or above the band's lower edge.
    function testFuzz_inBand_noBadDebtAndNotLiquidatable(
        uint256 fair,
        uint256 bandBps,
        uint256 skew,
        uint256 collateral,
        uint256 realized
    ) public {
        fair = bound(fair, 1e8, 1e13); // $1 to $100k
        bandBps = bound(bandBps, 0, 1500);
        skew = bound(skew, 0, 100);
        collateral = bound(collateral, 1e12, 1e24);
        uint256 width = fair * bandBps / 1e4;
        uint256 lower = fair - width * skew / 100;
        uint256 upper = lower + width;
        vm.assume(lower > 0 && upper >= fair);

        _fund(1e30);
        _depositCollateral(borrower, nvda, collateral);
        _post(address(nvda), uint128(fair), uint128(lower), uint128(upper));
        uint256 power = credit.getAccountData(borrower).borrowPower;
        vm.assume(power > 0);
        _borrow(borrower, power);

        // Monday open realizes anywhere at or above Saturday's lower edge (live band +-0.5%).
        realized = bound(realized, lower, 3 * upper);
        vm.warp(MON_OPEN);
        uint256 liveLow = realized - realized / 200;
        vm.assume(liveLow > 0);
        _post(address(nvda), uint128(realized), uint128(liveLow), uint128(realized + realized / 200));

        uint256 debt = credit.debtOf(borrower);
        assertGe(collateral * realized / 1e8, debt, "bad debt inside the band");
        assertFalse(credit.isLiquidatable(borrower));
    }
}
