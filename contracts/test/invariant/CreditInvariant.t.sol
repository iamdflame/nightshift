// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin-contracts/utils/math/Math.sol";
import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {NightshiftCredit} from "../../src/NightshiftCredit.sol";
import {NightshiftOracle} from "../../src/NightshiftOracle.sol";
import {INightshiftOracle} from "../../src/interfaces/INightshiftOracle.sol";
import {MockERC20} from "../mocks/Mocks.sol";
import {CreditHandler} from "./CreditHandler.sol";

/// @dev Accounting invariants that must hold in every regime.
abstract contract CreditInvariantBase is Test {
    NightshiftCredit internal credit;
    NightshiftOracle internal oracle;
    MockERC20 internal usdt;
    CreditHandler internal handler;
    address internal owner = address(0xA11CE);
    address internal reporter = address(0xBEEF);

    function _inBand() internal pure virtual returns (bool);

    function setUp() public {
        vm.warp(1_791_648_000); // Saturday 2026-10-10 16:00 UTC
        oracle = new NightshiftOracle(owner);
        vm.prank(owner);
        oracle.setReporter(reporter, true);
        usdt = new MockERC20("Tether USD", "USDT", 18);
        credit = new NightshiftCredit(usdt, oracle, owner, 800, "Nightshift USDT", "nsUSDT");

        MockERC20[] memory toks = new MockERC20[](2);
        toks[0] = new MockERC20("NVIDIA Corp", "NVDAB", 18);
        toks[1] = new MockERC20("Six Decimals", "SIX", 6); // exercises decimal scaling
        uint256[] memory prices = new uint256[](2);
        prices[0] = 236e8;
        prices[1] = 430e8;
        NightshiftCredit.CollateralParams memory p = NightshiftCredit.CollateralParams({
            enabled: true, baseLtvBps: 5000, liqThresholdBps: 6500, liqBonusBps: 500, maxBandBps: 1500, maxAge: 3600
        });
        vm.startPrank(owner);
        credit.setCollateral(address(toks[0]), p);
        credit.setCollateral(address(toks[1]), p);
        vm.stopPrank();

        handler = new CreditHandler(credit, oracle, usdt, toks, prices, reporter, _inBand());
        // Seed both tokens at their base price with a valid, unflagged 10% band centred on fair value.
        handler.postReport(0, 236e8, 1000, 50, 5);
        handler.postReport(1, 430e8, 1000, 50, 5);

        bytes4[] memory selectors = new bytes4[](13);
        selectors[0] = CreditHandler.deposit.selector;
        selectors[1] = CreditHandler.mint.selector;
        selectors[2] = CreditHandler.withdraw.selector;
        selectors[3] = CreditHandler.redeem.selector;
        selectors[4] = CreditHandler.donate.selector;
        selectors[5] = CreditHandler.depositCollateral.selector;
        selectors[6] = CreditHandler.withdrawCollateral.selector;
        selectors[7] = CreditHandler.borrow.selector;
        selectors[8] = CreditHandler.borrowMax.selector;
        selectors[9] = CreditHandler.repay.selector;
        selectors[10] = CreditHandler.liquidate.selector;
        selectors[11] = CreditHandler.postReport.selector;
        selectors[12] = CreditHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// Internal cash is fully backed by real tokens; donations never enter the accounting.
    function invariant_cashBackedDonationsIgnored() public view {
        assertEq(usdt.balanceOf(address(credit)), credit.cash() + handler.ghostDonations());
    }

    /// The aggregate scaled debt is exactly the sum of the accounts' scaled debts.
    function invariant_scaledDebtIsSumOfAccounts() public view {
        uint256 sum;
        for (uint256 i; i < handler.actorCount(); ++i) {
            sum += credit.scaledDebtOf(handler.borrowerAt(i));
        }
        assertEq(credit.totalScaledDebt(), sum);
    }

    /// Lenders are never credited with more than exists: totalAssets <= cash + what borrowers actually owe.
    function invariant_totalAssetsNeverExceedsWhatIsOwed() public view {
        uint256 owed = credit.cash();
        for (uint256 i; i < handler.actorCount(); ++i) {
            owed += credit.debtOf(handler.borrowerAt(i));
        }
        assertLe(credit.totalAssets(), owed);
    }

    /// The sum of every lender's redeemable claim never exceeds the vault's assets, and shares are fully attributed.
    function invariant_lenderClaimsWithinAssets() public view {
        uint256 claims;
        uint256 shares;
        for (uint256 i; i < handler.actorCount(); ++i) {
            address l = handler.lenderAt(i);
            claims += credit.previewRedeem(credit.balanceOf(l));
            shares += credit.balanceOf(l);
        }
        assertEq(shares, credit.totalSupply());
        assertLe(claims, credit.totalAssets());
    }

    /// No lender action, borrower action, liquidation or the passage of time lowers the share price; only an
    /// explicit bad-debt write-off may.
    function invariant_sharePriceNeverDecreasesExceptBadDebt() public view {
        assertFalse(handler.ghostSharePriceDecreased());
    }

    /// Per-token collateral: account balances sum to the tracked total, which equals the tokens actually held.
    function invariant_collateralAccounting() public view {
        for (uint256 t; t < handler.tokenCount(); ++t) {
            MockERC20 token = handler.tokens(t);
            uint256 sum;
            for (uint256 i; i < handler.actorCount(); ++i) {
                sum += credit.collateralOf(handler.borrowerAt(i), address(token));
            }
            assertEq(sum, credit.totalCollateral(address(token)));
            assertEq(token.balanceOf(address(credit)), credit.totalCollateral(address(token)));
        }
    }

    /// Masks mirror balances, and no account ever carries debt without collateral (bad debt is written off at once).
    function invariant_masksMatchBalancesAndNoNakedDebt() public view {
        for (uint256 i; i < handler.actorCount(); ++i) {
            address b = handler.borrowerAt(i);
            NightshiftCredit.AccountData memory d = credit.getAccountData(b);
            for (uint256 t; t < handler.tokenCount(); ++t) {
                bool held = credit.collateralOf(b, address(handler.tokens(t))) != 0;
                assertEq(d.collateralMask & (uint256(1) << t) != 0, held);
            }
            if (d.debt != 0) assertTrue(d.collateralMask != 0);
        }
    }

    function afterInvariant() external view {
        string[11] memory names = [
            "deposit",
            "withdraw",
            "redeem",
            "borrow",
            "borrowOk",
            "repayOk",
            "withdrawCollateralOk",
            "liquidate",
            "liquidateOk",
            "postReport",
            "warp"
        ];
        for (uint256 i; i < names.length; ++i) {
            console2.log(names[i], handler.calls(bytes32(bytes(names[i]))));
        }
        console2.log("badDebtEvents", handler.ghostBadDebtEvents());
    }
}

/// Realized prices never fall below the lower edge any loan relied on: there must be no bad debt at all.
contract CreditInvariantInBandTest is CreditInvariantBase {
    function _inBand() internal pure override returns (bool) {
        return true;
    }

    /// Every account that passed a borrow check is fully backed at the realized (fair) price, and no bad debt was
    /// ever realized.
    function invariant_noBadDebtInsideBand() public view {
        assertEq(handler.ghostBadDebtEvents(), 0);
        for (uint256 i; i < handler.actorCount(); ++i) {
            address b = handler.borrowerAt(i);
            uint256 debt = credit.debtOf(b);
            if (debt == 0) continue;
            uint256 value;
            for (uint256 t; t < handler.tokenCount(); ++t) {
                MockERC20 token = handler.tokens(t);
                uint256 amount = credit.collateralOf(b, address(token));
                if (amount == 0) continue;
                (, INightshiftOracle.Report memory r) = oracle.tryGetReport(address(token));
                value += Math.mulDiv(amount, uint256(r.fairValue) * 1e18, 10 ** (uint256(token.decimals()) + 8));
            }
            assertGe(value, debt, "bad debt inside the band");
        }
    }
}

/// Prices gap anywhere (down to -98%): liquidations and bad-debt write-offs happen; accounting must still hold.
/// (Coverage was verified by temporarily asserting `liquidateOk == 0` and `ghostBadDebtEvents == 0`: the campaign
/// falsifies both, and the in-band campaign also reaches liquidations through band widening without any bad debt.)
contract CreditInvariantGapTest is CreditInvariantBase {
    function _inBand() internal pure override returns (bool) {
        return false;
    }
}
