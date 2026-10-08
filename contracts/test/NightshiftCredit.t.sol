// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin-contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin-contracts/token/ERC20/extensions/ERC4626.sol";
import {Pausable} from "@openzeppelin-contracts/utils/Pausable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin-contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin-contracts/utils/math/Math.sol";

import {NightshiftCredit} from "../src/NightshiftCredit.sol";
import {INightshiftOracle, INightshiftOracleExtended} from "../src/interfaces/INightshiftOracle.sol";
import {FeeOnTransferToken, MockERC20, MockNightshiftOracle, NoDecimalsToken, ReentrantToken} from "./mocks/Mocks.sol";
import {CreditFixture} from "./utils/Fixtures.sol";

contract NightshiftCreditTest is CreditFixture {
    uint256 internal constant RAY = 1e27;

    event CollateralConfigured(
        address indexed token, uint8 indexed index, uint8 decimals, NightshiftCredit.CollateralParams params
    );
    event BorrowRateUpdated(uint256 previousAprBps, uint256 newAprBps, uint256 ratePerSecond);
    event CollateralDeposited(address indexed caller, address indexed account, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed account, address indexed receiver, address indexed token, uint256 amount);
    event Borrowed(address indexed account, address indexed receiver, uint256 amount, uint256 debtAfter);
    event Repaid(address indexed payer, address indexed account, uint256 amount, uint256 debtAfter);
    event Skimmed(address indexed token, address indexed to, uint256 amount);

    /// @dev Standard position: 1000 USDT lent, 1 NVDAB posted, weekend report (fair 236, band 220-250).
    function _open() internal {
        _lend(lender, 1000e18);
        _depositCollateral(borrower, nvda, 1e18);
        _post(address(nvda), FAIR, LOWER, UPPER);
    }

    function _list(MockERC20 token, NightshiftCredit.CollateralParams memory p) internal {
        vm.prank(owner);
        credit.setCollateral(address(token), p);
    }

    function _rate(uint256 aprBps) internal pure returns (uint256) {
        return Math.mulDiv(aprBps, RAY, 1e4 * 365 days, Math.Rounding.Ceil);
    }

    // ================================================================== construction & admin

    function test_constructor_state() public view {
        assertEq(credit.asset(), address(usdt));
        assertEq(address(credit.oracle()), address(oracle));
        assertEq(credit.owner(), owner);
        assertEq(credit.name(), "Nightshift USDT");
        assertEq(credit.symbol(), "nsUSDT");
        assertEq(credit.decimals(), 18);
        assertEq(credit.borrowAprBps(), APR_BPS);
        assertEq(credit.borrowRatePerSecond(), _rate(APR_BPS));
        assertEq(credit.borrowIndex(), RAY);
        assertEq(credit.lastAccrual(), SAT);
        assertEq(credit.totalAssets(), 0);
        assertEq(credit.collateralTokens().length, 1);
        NightshiftCredit.CollateralConfig memory c = credit.collateralConfig(address(nvda));
        assertTrue(c.listed && c.enabled);
        assertEq(c.index, 0);
        assertEq(c.decimals, 18);
        assertEq(c.baseLtvBps, 5000);
        assertEq(c.liqThresholdBps, 6500);
        assertEq(c.liqBonusBps, 500);
        assertEq(c.maxBandBps, 1500);
        assertEq(c.maxAge, 3600);
    }

    function test_constructor_reverts() public {
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        new NightshiftCredit(IERC20(address(0)), oracle, owner, 800, "n", "s");
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        new NightshiftCredit(usdt, INightshiftOracleExtended(address(0)), owner, 800, "n", "s");

        MockERC20 wide = new MockERC20("W", "W", 19);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.UnsupportedAsset.selector, address(wide)));
        new NightshiftCredit(wide, oracle, owner, 800, "n", "s");
        NoDecimalsToken nd = new NoDecimalsToken();
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.UnsupportedAsset.selector, address(nd)));
        new NightshiftCredit(IERC20(address(nd)), oracle, owner, 800, "n", "s");

        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidBorrowRate.selector, 10_001));
        new NightshiftCredit(usdt, oracle, owner, 10_001, "n", "s");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new NightshiftCredit(usdt, oracle, address(0), 800, "n", "s");

        // 6-decimal debt asset is supported.
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        assertEq(new NightshiftCredit(usdc, oracle, owner, 800, "n", "s").decimals(), 6);
    }

    function test_setCollateral_listsAndUpdates() public {
        MockERC20 tsla = new MockERC20("Tesla", "TSLAB", 8);
        NightshiftCredit.CollateralParams memory p = _defaultParams();
        vm.expectEmit(address(credit));
        emit CollateralConfigured(address(tsla), 1, 8, p);
        _list(tsla, p);
        assertEq(credit.collateralTokens()[1], address(tsla));
        assertEq(credit.collateralConfig(address(tsla)).decimals, 8);

        p.enabled = false;
        p.baseLtvBps = 4000;
        _list(tsla, p); // update keeps index and list
        NightshiftCredit.CollateralConfig memory c = credit.collateralConfig(address(tsla));
        assertEq(c.index, 1);
        assertFalse(c.enabled);
        assertTrue(c.listed);
        assertEq(c.baseLtvBps, 4000);
        assertEq(credit.collateralTokens().length, 2);
    }

    function test_setCollateral_paramValidation() public {
        NightshiftCredit.CollateralParams memory p;
        vm.startPrank(owner);

        p = _defaultParams();
        p.baseLtvBps = 6500;
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidLtv.selector, 6500, 6500));
        credit.setCollateral(address(nvda), p);

        p = _defaultParams();
        p.liqThresholdBps = 10_000;
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidLtv.selector, 5000, 10_000));
        credit.setCollateral(address(nvda), p);

        p = _defaultParams();
        p.liqBonusBps = 2001;
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidLiquidationBonus.selector, 2001, 6500));
        credit.setCollateral(address(nvda), p);

        p = _defaultParams();
        p.liqThresholdBps = 9600; // 96% * 1.05 > 100%: a liquidation at the threshold would need more than exists
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidLiquidationBonus.selector, 500, 9600));
        credit.setCollateral(address(nvda), p);

        p = _defaultParams();
        p.maxBandBps = 0;
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidMaxBand.selector, 0));
        credit.setCollateral(address(nvda), p);
        p.maxBandBps = 10_001;
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidMaxBand.selector, 10_001));
        credit.setCollateral(address(nvda), p);

        p = _defaultParams();
        p.maxAge = 0;
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidMaxAge.selector, 0));
        credit.setCollateral(address(nvda), p);
        p.maxAge = 7 days + 1;
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidMaxAge.selector, 7 days + 1));
        credit.setCollateral(address(nvda), p);

        // Boundaries that are accepted.
        p = NightshiftCredit.CollateralParams(true, 0, 9500, 500, 10_000, 7 days); // 95% * 1.05 = 99.75%
        credit.setCollateral(address(nvda), p);
        vm.stopPrank();
    }

    function test_setCollateral_badTokens() public {
        NightshiftCredit.CollateralParams memory p = _defaultParams();
        vm.startPrank(owner);
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        credit.setCollateral(address(0), p);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidCollateral.selector, address(usdt)));
        credit.setCollateral(address(usdt), p);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidCollateral.selector, address(credit)));
        credit.setCollateral(address(credit), p);
        address nd = address(new NoDecimalsToken());
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidCollateral.selector, nd));
        credit.setCollateral(nd, p);
        address d37 = address(new MockERC20("X", "X", 37));
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidCollateral.selector, d37));
        credit.setCollateral(d37, p);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        credit.setCollateral(address(nvda), p);
    }

    function test_setCollateral_maxSixteen() public {
        for (uint256 i = 1; i < 16; ++i) {
            _list(new MockERC20("T", "T", 18), _defaultParams());
        }
        assertEq(credit.collateralTokens().length, 16);
        MockERC20 extra = new MockERC20("T", "T", 18);
        NightshiftCredit.CollateralParams memory p = _defaultParams();
        vm.prank(owner);
        vm.expectRevert(NightshiftCredit.TooManyCollaterals.selector);
        credit.setCollateral(address(extra), p);
    }

    function test_setBorrowRate_accruesAtOldRateFirst() public {
        _open();
        _borrow(borrower, 100e18);
        vm.warp(SAT + 1000);
        uint256 expectedIndex = RAY + _rate(APR_BPS) * 1000;

        vm.expectEmit(address(credit));
        emit BorrowRateUpdated(APR_BPS, 2000, _rate(2000));
        vm.prank(owner);
        credit.setBorrowRate(2000);
        assertEq(credit.borrowIndex(), expectedIndex);
        assertEq(credit.lastAccrual(), SAT + 1000);

        vm.warp(SAT + 2000);
        assertEq(credit.borrowIndex(), Math.mulDiv(expectedIndex, RAY + _rate(2000) * 1000, RAY, Math.Rounding.Ceil));

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InvalidBorrowRate.selector, 10_001));
        credit.setBorrowRate(10_001);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        credit.setBorrowRate(1);
    }

    function test_ownership_twoStepNoRenounce() public {
        vm.prank(owner);
        vm.expectRevert(NightshiftCredit.RenounceDisabled.selector);
        credit.renounceOwnership();
        address next = makeAddr("next");
        vm.prank(owner);
        credit.transferOwnership(next);
        vm.prank(next);
        credit.acceptOwnership();
        assertEq(credit.owner(), next);
    }

    // ================================================================== pause

    function test_pause_blocksRiskIncreasingActions() public {
        _open();
        _borrow(borrower, 50e18);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        credit.pause();
        vm.prank(owner);
        credit.pause();

        bytes memory err = abi.encodeWithSelector(Pausable.EnforcedPause.selector);
        usdt.mint(lender, 10e18);
        vm.startPrank(lender);
        usdt.approve(address(credit), 10e18);
        vm.expectRevert(err);
        credit.deposit(10e18, lender);
        vm.expectRevert(err);
        credit.mint(10e18, lender);
        vm.expectRevert(err);
        credit.withdraw(1e18, lender, lender);
        vm.expectRevert(err);
        credit.redeem(1e18, lender, lender);
        vm.stopPrank();

        vm.startPrank(borrower);
        vm.expectRevert(err);
        credit.borrow(1e18, borrower);
        vm.expectRevert(err);
        credit.withdrawCollateral(address(nvda), 1, borrower);
        vm.stopPrank();

        vm.prank(liquidator);
        vm.expectRevert(err);
        credit.liquidate(borrower, address(nvda), 1e18, 0, liquidator);

        assertEq(credit.maxDeposit(lender), 0);
        assertEq(credit.maxMint(lender), 0);
        assertEq(credit.maxWithdraw(lender), 0);
        assertEq(credit.maxRedeem(lender), 0);

        vm.prank(owner);
        credit.unpause();
        assertEq(credit.maxDeposit(lender), type(uint256).max);
        _borrow(borrower, 1e18);
    }

    function test_pause_repayAndDepositCollateralStillWork() public {
        _open();
        _borrow(borrower, 50e18);
        vm.prank(owner);
        credit.pause();
        _repay(borrower, 20e18);
        assertEq(credit.debtOf(borrower), 30e18);
        _depositCollateral(borrower, nvda, 1e18);
        assertEq(credit.collateralOf(borrower, address(nvda)), 2e18);
    }

    // ================================================================== lenders

    function test_lender_depositMintWithdrawRedeem() public {
        assertEq(_lend(lender, 1000e18), 1000e18); // 1:1 initially
        assertEq(credit.totalAssets(), 1000e18);
        assertEq(credit.cash(), 1000e18);

        usdt.mint(lender, 500e18);
        vm.startPrank(lender);
        usdt.approve(address(credit), 500e18);
        assertEq(credit.mint(500e18, lender), 500e18);
        assertEq(credit.withdraw(200e18, lender, lender), 200e18);
        assertEq(credit.redeem(300e18, lender, lender), 300e18);
        vm.stopPrank();
        assertEq(credit.balanceOf(lender), 1000e18);
        assertEq(usdt.balanceOf(lender), 500e18);
        assertEq(credit.cash(), 1000e18);
    }

    function test_lender_withdrawLimitedByCash() public {
        _open();
        _borrow(borrower, 100e18);
        assertEq(credit.maxWithdraw(lender), 900e18);
        uint256 maxShares = credit.maxRedeem(lender);
        assertEq(credit.previewRedeem(maxShares), 900e18);

        vm.startPrank(lender);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxWithdraw.selector, lender, 900e18 + 1, 900e18));
        credit.withdraw(900e18 + 1, lender, lender);
        credit.withdraw(900e18, lender, lender);
        vm.stopPrank();
        assertEq(credit.cash(), 0);
        assertEq(credit.maxWithdraw(lender), 0);
    }

    function test_lender_earnsInterest() public {
        _open();
        _borrow(borrower, 100e18);
        vm.warp(SAT + 365 days);
        uint256 index = RAY + _rate(APR_BPS) * 365 days;
        uint256 debt = Math.mulDiv(100e18, index, RAY, Math.Rounding.Ceil);
        assertApproxEqAbs(debt, 108e18, 1e9);
        assertEq(credit.debtOf(borrower), debt);
        assertEq(credit.totalAssets(), 900e18 + Math.mulDiv(100e18, index, RAY));
        // The lender owns everything (minus the vault-favoring rounding of the virtual share).
        assertApproxEqAbs(credit.convertToAssets(1000e18), credit.totalAssets(), 1);

        _repay(borrower, type(uint256).max);
        assertEq(credit.debtOf(borrower), 0);
        uint256 shares = credit.balanceOf(lender);
        vm.prank(lender);
        uint256 out = credit.redeem(shares, lender, lender);
        assertApproxEqAbs(out, 1008e18, 1e9);
        assertGe(credit.cash(), 0);
    }

    function test_donation_doesNotMoveSharePrice_andIsSkimmable() public {
        _lend(lender, 1000e18);
        uint256 priceBefore = credit.convertToAssets(1e18);
        usdt.mint(address(credit), 500e18); // donation
        assertEq(credit.totalAssets(), 1000e18);
        assertEq(credit.convertToAssets(1e18), priceBefore);

        vm.expectEmit(address(credit));
        emit Skimmed(address(usdt), owner, 500e18);
        vm.prank(owner);
        assertEq(credit.skim(address(usdt), owner), 500e18);
        assertEq(usdt.balanceOf(address(credit)), 1000e18);
    }

    function test_skim_collateralSurplusOnly() public {
        _depositCollateral(borrower, nvda, 2e18);
        nvda.mint(address(credit), 1e18);
        vm.prank(owner);
        assertEq(credit.skim(address(nvda), owner), 1e18);
        assertEq(nvda.balanceOf(address(credit)), 2e18);

        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.NothingToSkim.selector, address(nvda)));
        credit.skim(address(nvda), owner);
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        credit.skim(address(nvda), address(0));
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        credit.skim(address(nvda), owner);

        // A token that is not tracked at all can be recovered in full.
        MockERC20 stray = new MockERC20("S", "S", 18);
        stray.mint(address(credit), 7);
        vm.prank(owner);
        assertEq(credit.skim(address(stray), owner), 7);
    }

    // ================================================================== collateral

    function test_depositCollateral() public {
        nvda.mint(borrower, 1e18);
        vm.startPrank(borrower);
        nvda.approve(address(credit), 1e18);
        vm.expectEmit(address(credit));
        emit CollateralDeposited(borrower, borrower, address(nvda), 1e18);
        assertEq(credit.depositCollateral(address(nvda), 1e18, borrower), 1e18);
        vm.stopPrank();
        assertEq(credit.collateralOf(borrower, address(nvda)), 1e18);
        assertEq(credit.totalCollateral(address(nvda)), 1e18);
        assertEq(credit.getAccountData(borrower).collateralMask, 1);
    }

    function test_depositCollateral_thirdPartyCanOnlyTopUp() public {
        address keeper = makeAddr("keeper");
        nvda.mint(keeper, 2e18);
        vm.prank(keeper);
        nvda.approve(address(credit), 2e18);

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.CollateralNotOpened.selector, borrower, address(nvda)));
        credit.depositCollateral(address(nvda), 1e18, borrower);

        _depositCollateral(borrower, nvda, 1e18);
        vm.prank(keeper);
        credit.depositCollateral(address(nvda), 1e18, borrower); // rescue top-up is fine
        assertEq(credit.collateralOf(borrower, address(nvda)), 2e18);
    }

    function test_depositCollateral_reverts() public {
        vm.startPrank(borrower);
        vm.expectRevert(NightshiftCredit.ZeroAmount.selector);
        credit.depositCollateral(address(nvda), 0, borrower);
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        credit.depositCollateral(address(nvda), 1, address(0));
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.CollateralNotEnabled.selector, address(usdt)));
        credit.depositCollateral(address(usdt), 1, borrower);
        vm.stopPrank();

        NightshiftCredit.CollateralParams memory p = _defaultParams();
        p.enabled = false;
        _list(nvda, p);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.CollateralNotEnabled.selector, address(nvda)));
        credit.depositCollateral(address(nvda), 1, borrower);
    }

    function test_depositCollateral_feeOnTransferCreditsReceived() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        _list(fee, _defaultParams());
        _depositCollateral(borrower, fee, 100e18);
        assertEq(credit.collateralOf(borrower, address(fee)), 99e18);
        assertEq(credit.totalCollateral(address(fee)), 99e18);
        assertEq(fee.balanceOf(address(credit)), 99e18);
    }

    function test_withdrawCollateral_noDebtNeverConsultsOracle() public {
        _depositCollateral(borrower, nvda, 1e18); // no report has ever been posted
        vm.expectEmit(address(credit));
        emit CollateralWithdrawn(borrower, borrower, address(nvda), 1e18);
        vm.prank(borrower);
        assertEq(credit.withdrawCollateral(address(nvda), type(uint256).max, borrower), 1e18);
        assertEq(credit.getAccountData(borrower).collateralMask, 0);
        assertEq(nvda.balanceOf(borrower), 1e18);
        assertEq(credit.totalCollateral(address(nvda)), 0);
    }

    function test_withdrawCollateral_withDebtKeepsBorrowCheck() public {
        _open();
        _borrow(borrower, 55e18); // half the borrowing power
        vm.startPrank(borrower);
        // Leaves 0.5e18 - 1e8 collateral: power = remaining * 220 * 50% = 55e18 - 110e8 < debt.
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.InsufficientCollateral.selector, borrower, 55e18, 55e18 - 110e8)
        );
        credit.withdrawCollateral(address(nvda), 0.5e18 + 1e8, borrower);
        credit.withdrawCollateral(address(nvda), 0.5e18, borrower); // leaves exactly enough
        vm.stopPrank();
        assertEq(credit.collateralOf(borrower, address(nvda)), 0.5e18);
    }

    function test_withdrawCollateral_withDebtStaleReportBlocks() public {
        _open();
        _borrow(borrower, 10e18);
        vm.warp(SAT + 3601);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.StaleReport.selector, address(nvda), SAT, 3600));
        credit.withdrawCollateral(address(nvda), 1, borrower);
    }

    function test_withdrawCollateral_reverts() public {
        _depositCollateral(borrower, nvda, 1e18);
        vm.startPrank(borrower);
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        credit.withdrawCollateral(address(nvda), 1, address(0));
        vm.expectRevert(NightshiftCredit.ZeroAmount.selector);
        credit.withdrawCollateral(address(nvda), 0, borrower);
        vm.expectRevert(NightshiftCredit.ZeroAmount.selector);
        credit.withdrawCollateral(address(usdt), type(uint256).max, borrower); // nothing held
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.InsufficientCollateralBalance.selector, address(nvda), 1e18, 2e18)
        );
        credit.withdrawCollateral(address(nvda), 2e18, borrower);
        vm.stopPrank();
    }

    // ================================================================== borrow

    function test_borrow_upToLimitThenOneWeiMoreReverts() public {
        _open();
        uint256 limit = _power(1e18, LOWER, 5000);
        assertEq(limit, 110e18);
        assertEq(credit.getAccountData(borrower).borrowPower, limit);

        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.InsufficientCollateral.selector, borrower, limit + 1, limit)
        );
        credit.borrow(limit + 1, borrower);

        vm.expectEmit(address(credit));
        emit Borrowed(borrower, borrower, limit, limit);
        _borrow(borrower, limit);
        assertEq(usdt.balanceOf(borrower), limit);
        assertEq(credit.debtOf(borrower), limit);
        assertEq(credit.cash(), 1000e18 - limit);

        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.InsufficientCollateral.selector, borrower, limit + 1, limit)
        );
        credit.borrow(1, borrower);
    }

    function test_borrow_valuesAtLowerNotFair() public {
        _open();
        // At fair value the same collateral would support 118 USDT; Nightshift lends 110 (lower) and no more.
        uint256 atFair = _power(1e18, FAIR, 5000);
        assertEq(atFair, 118e18);
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.InsufficientCollateral.selector, borrower, atFair, 110e18)
        );
        credit.borrow(atFair, borrower);
    }

    function test_borrow_basicReverts() public {
        _lend(lender, 50e18);
        vm.startPrank(borrower);
        vm.expectRevert(NightshiftCredit.ZeroAmount.selector);
        credit.borrow(0, borrower);
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        credit.borrow(1, address(0));
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InsufficientCollateral.selector, borrower, 1, 0));
        credit.borrow(1, borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.InsufficientLiquidity.selector, 60e18, 50e18));
        credit.borrow(60e18, borrower);
        vm.stopPrank();
    }

    function test_borrow_gate_missingReport() public {
        _lend(lender, 1000e18);
        _depositCollateral(borrower, nvda, 1e18);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.MissingReport.selector, address(nvda)));
        credit.borrow(1e18, borrower);
    }

    function test_borrow_gate_staleness() public {
        _open();
        vm.warp(SAT + 3600); // exactly maxAge old: still fresh
        _borrow(borrower, 1e18);
        vm.warp(SAT + 3601);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.StaleReport.selector, address(nvda), SAT, 3600));
        credit.borrow(1e18, borrower);
        _post(address(nvda), FAIR, LOWER, UPPER); // a fresh report unblocks
        _borrow(borrower, 1e18);
    }

    function test_borrow_gate_flags() public {
        _lend(lender, 1000e18);
        _depositCollateral(borrower, nvda, 1e18);

        _postFlags(address(nvda), FAIR, LOWER, UPPER, 1);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.CorporateAction.selector, address(nvda)));
        credit.borrow(1e18, borrower);

        _postFlags(address(nvda), FAIR, LOWER, UPPER, 8);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.DegradedReport.selector, address(nvda)));
        credit.borrow(1e18, borrower);

        _postFlags(address(nvda), FAIR, LOWER, UPPER, 9); // corporate action is reported first
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.CorporateAction.selector, address(nvda)));
        credit.borrow(1e18, borrower);

        _postFlags(address(nvda), FAIR, LOWER, UPPER, 2 | 4); // informational flags do not block
        _borrow(borrower, 1e18);
    }

    function test_borrow_gate_bandWidthBoundary() public {
        _lend(lender, 1000e18);
        _depositCollateral(borrower, nvda, 1e18);
        _post(address(nvda), 100e8, 90e8, 105e8); // (105 - 90) / 100 = 15.00% == maxBand: allowed
        _borrow(borrower, 1e18);

        _post(address(nvda), 100e8, 90e8, 105e8 + 1); // 15.00000001%: rejected, reported as 1501 bps (rounded up)
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.BandTooWide.selector, address(nvda), 1501, 1500));
        credit.borrow(1e18, borrower);
    }

    function test_borrow_gate_malformedReportFromFaultyOracle() public {
        MockNightshiftOracle bad = new MockNightshiftOracle();
        NightshiftCredit c2 = new NightshiftCredit(usdt, bad, owner, 800, "n", "s");
        vm.prank(owner);
        c2.setCollateral(address(nvda), _defaultParams());
        usdt.mint(address(this), 100e18);
        usdt.approve(address(c2), 100e18);
        c2.deposit(100e18, address(this));
        nvda.mint(borrower, 1e18);
        vm.startPrank(borrower);
        nvda.approve(address(c2), 1e18);
        c2.depositCollateral(address(nvda), 1e18, borrower);
        vm.stopPrank();

        INightshiftOracle.Report memory r = _report(100e8, 101e8, 102e8); // lower > fair
        bad.set(address(nvda), r);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.MalformedReport.selector, address(nvda)));
        c2.borrow(1e18, borrower);
        assertEq(c2.getAccountData(borrower).liquidationValue, 0); // malformed counts as zero, never reverts
    }

    function test_borrow_disabledCollateralIgnored() public {
        MockERC20 tsla = new MockERC20("Tesla", "TSLAB", 18);
        _list(tsla, _defaultParams());
        _open();
        _depositCollateral(borrower, tsla, 1e18); // TSLAB never gets a report
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.MissingReport.selector, address(tsla)));
        credit.borrow(1e18, borrower);

        NightshiftCredit.CollateralParams memory p = _defaultParams();
        p.enabled = false;
        _list(tsla, p);
        _borrow(borrower, 110e18); // only NVDAB's power counts, TSLAB's missing report is irrelevant
        assertEq(credit.getAccountData(borrower).borrowPower, 110e18);
    }

    function test_borrow_multiCollateralAcrossHighIndexes() public {
        MockERC20[] memory toks = new MockERC20[](15);
        for (uint256 i; i < 15; ++i) {
            toks[i] = new MockERC20("T", "T", 18);
            _list(toks[i], _defaultParams());
        }
        MockERC20 last = toks[14]; // index 15: the highest mask bit
        assertEq(credit.collateralConfig(address(last)).index, 15);
        MockERC20 mid = toks[7]; // index 8: first index past a uint8 shift
        _open();
        _depositCollateral(borrower, last, 2e18);
        _depositCollateral(borrower, mid, 1e18);
        _post(address(last), 100e8, 95e8, 105e8);
        _post(address(mid), 50e8, 48e8, 52e8);
        assertEq(credit.getAccountData(borrower).collateralMask, uint16(1 | (1 << 8) | (1 << 15)));

        uint256 power = 110e18 + _power(2e18, 95e8, 5000) + _power(1e18, 48e8, 5000);
        assertEq(credit.getAccountData(borrower).borrowPower, power);
        _borrow(borrower, power);
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.InsufficientCollateral.selector, borrower, power + 1, power)
        );
        credit.borrow(1, borrower);

        _repay(borrower, type(uint256).max);
        vm.prank(borrower);
        credit.withdrawCollateral(address(last), type(uint256).max, borrower);
        assertEq(credit.getAccountData(borrower).collateralMask, uint16(1 | (1 << 8)));
    }

    // ================================================================== repay

    function test_repay_partialFullAndOverpay() public {
        _open();
        _borrow(borrower, 100e18);
        usdt.mint(borrower, 1000e18);
        vm.prank(borrower);
        usdt.approve(address(credit), type(uint256).max);
        vm.expectEmit(address(credit));
        emit Repaid(borrower, borrower, 40e18, 60e18);
        vm.prank(borrower);
        assertEq(credit.repay(40e18, borrower), 40e18);
        assertEq(credit.debtOf(borrower), 60e18);

        uint256 balBefore = usdt.balanceOf(borrower);
        vm.prank(borrower);
        assertEq(credit.repay(1000e18, borrower), 60e18); // only the debt is pulled
        assertEq(balBefore - usdt.balanceOf(borrower), 60e18);
        assertEq(credit.debtOf(borrower), 0);
        assertEq(credit.scaledDebtOf(borrower), 0);
        assertEq(credit.totalScaledDebt(), 0);
        assertEq(credit.cash(), 1000e18);
    }

    function test_repay_onBehalfOf() public {
        _open();
        _borrow(borrower, 100e18);
        address friend = makeAddr("friend");
        usdt.mint(friend, 100e18);
        vm.startPrank(friend);
        usdt.approve(address(credit), 100e18);
        credit.repay(type(uint256).max, borrower);
        vm.stopPrank();
        assertEq(credit.debtOf(borrower), 0);
        assertEq(usdt.balanceOf(borrower), 100e18); // borrower kept the loan proceeds
    }

    function test_repay_reverts() public {
        vm.startPrank(borrower);
        vm.expectRevert(NightshiftCredit.ZeroAmount.selector);
        credit.repay(0, borrower);
        vm.expectRevert(NightshiftCredit.ZeroAddress.selector);
        credit.repay(1, address(0));
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.NoDebt.selector, borrower));
        credit.repay(1, borrower);
        vm.stopPrank();
    }

    function test_repay_tooSmallToReduceDebt() public {
        vm.prank(owner);
        credit.setBorrowRate(10_000); // 100% APR
        _open();
        _borrow(borrower, 10e18);
        vm.warp(SAT + 400 days); // index > 2 RAY: 1 wei of repayment is worth 0 scaled units
        assertGt(credit.borrowIndex(), 2 * RAY);
        usdt.mint(borrower, 1);
        vm.startPrank(borrower);
        usdt.approve(address(credit), 1);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.RepayTooSmall.selector, 1));
        credit.repay(1, borrower);
        vm.stopPrank();
    }

    // ================================================================== interest & rounding

    function test_interest_exactIndexAndRounding() public {
        _open();
        _borrow(borrower, 100e18 + 1);
        vm.warp(SAT + 1000);
        uint256 rate = _rate(APR_BPS);
        uint256 i1 = RAY + rate * 1000;
        assertEq(credit.borrowIndex(), i1);
        // Account debt rounds up; the aggregate in totalAssets rounds down.
        assertEq(credit.debtOf(borrower), Math.mulDiv(100e18 + 1, i1, RAY, Math.Rounding.Ceil));
        assertEq(credit.totalDebt(), Math.mulDiv(100e18 + 1, i1, RAY));
        assertEq(credit.totalAssets(), credit.cash() + credit.totalDebt());
        assertGe(credit.debtOf(borrower), credit.totalDebt());

        _repay(borrower, 1e18); // stores i1
        vm.warp(SAT + 2000);
        uint256 i2 = Math.mulDiv(i1, RAY + rate * 1000, RAY, Math.Rounding.Ceil);
        assertEq(credit.borrowIndex(), i2);
    }

    function test_interest_zeroRateFreezesIndex() public {
        vm.prank(owner);
        credit.setBorrowRate(0);
        _open();
        _borrow(borrower, 100e18);
        vm.warp(SAT + 365 days);
        assertEq(credit.borrowIndex(), RAY);
        assertEq(credit.debtOf(borrower), 100e18);
    }

    // ================================================================== views

    function test_getAccountData() public {
        NightshiftCredit.AccountData memory d = credit.getAccountData(borrower);
        assertEq(d.debt, 0);
        assertEq(d.healthFactor, type(uint256).max);
        assertFalse(credit.isLiquidatable(borrower));

        _open();
        _borrow(borrower, 110e18);
        d = credit.getAccountData(borrower);
        assertEq(d.debt, 110e18);
        assertEq(d.borrowPower, 110e18);
        assertEq(d.liquidationValue, 143e18); // 1 * 220 * 65%
        assertEq(d.healthFactor, Math.mulDiv(143e18, 1e18, 110e18));
        assertEq(d.collateralMask, 1);
        assertFalse(credit.isLiquidatable(borrower));
    }

    // ================================================================== maxBorrow

    function test_maxBorrow_exactWhenIndexAboveRay() public {
        _open();
        vm.warp(SAT + 1 days + 7); // the index grows from deployment, even before any debt exists
        _post(address(nvda), FAIR, LOWER, UPPER);
        assertGt(credit.borrowIndex(), RAY);
        uint256 max = credit.maxBorrow(borrower);
        assertLe(max, 110e18);
        assertGe(max + 2, 110e18); // at most 2 wei below the nominal power (scaled-debt rounding)

        vm.prank(borrower);
        vm.expectPartialRevert(NightshiftCredit.InsufficientCollateral.selector);
        credit.borrow(max + 1, borrower);
        _borrow(borrower, max);
        assertEq(credit.maxBorrow(borrower), 0);
    }

    function test_maxBorrow_zeroWhenGatedPausedOrEmpty() public {
        assertEq(credit.maxBorrow(borrower), 0); // no collateral
        _open();
        assertEq(credit.maxBorrow(borrower), 110e18);
        vm.warp(SAT + 3601);
        assertEq(credit.maxBorrow(borrower), 0); // stale report
        _post(address(nvda), FAIR, LOWER, UPPER);
        assertGt(credit.maxBorrow(borrower), 0);
        vm.prank(owner);
        credit.pause();
        assertEq(credit.maxBorrow(borrower), 0);
    }

    function test_maxBorrow_cappedByCash() public {
        _lend(lender, 50e18);
        _depositCollateral(borrower, nvda, 1e18);
        _post(address(nvda), FAIR, LOWER, UPPER);
        assertEq(credit.maxBorrow(borrower), 50e18);
        _borrow(borrower, 50e18);
        assertEq(credit.maxBorrow(borrower), 0);
    }

    // ================================================================== reentrancy

    function test_reentrancy_blockedOnCollateralHooks() public {
        ReentrantToken re = new ReentrantToken();
        _list(re, _defaultParams());
        _lend(lender, 1000e18);
        re.mint(borrower, 2e18);
        vm.prank(borrower);
        re.approve(address(credit), type(uint256).max);

        // Re-entering borrow() from inside depositCollateral's transferFrom.
        re.arm(address(credit), abi.encodeCall(NightshiftCredit.borrow, (1, borrower)));
        vm.prank(borrower);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        credit.depositCollateral(address(re), 1e18, borrower);

        // Re-entering withdrawCollateral() from inside withdrawCollateral's transfer. (The failed call above rolled
        // back the token's self-disarm, so disarm explicitly before the plain deposit.)
        re.arm(address(0), "");
        vm.prank(borrower);
        credit.depositCollateral(address(re), 1e18, borrower);
        re.arm(address(credit), abi.encodeCall(NightshiftCredit.withdrawCollateral, (address(re), 1, borrower)));
        vm.prank(borrower);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        credit.withdrawCollateral(address(re), 1e18, borrower);
        assertEq(credit.collateralOf(borrower, address(re)), 1e18);
    }
}
