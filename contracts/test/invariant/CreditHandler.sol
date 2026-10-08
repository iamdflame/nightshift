// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin-contracts/utils/math/Math.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";

import {NightshiftCredit} from "../../src/NightshiftCredit.sol";
import {NightshiftOracle} from "../../src/NightshiftOracle.sol";
import {INightshiftOracle} from "../../src/interfaces/INightshiftOracle.sol";
import {MockERC20} from "../mocks/Mocks.sol";

/// @notice Drives the credit market through random lender, borrower, liquidator, reporter and clock actions.
/// @dev Two regimes:
///      - in-band: every posted fair value is at or above `floor[token]`, the highest `lower` any successful borrow
///        check (borrow or collateral withdrawal with debt) has relied on. This is the "realized next-open price is
///        inside the band" world in which the protocol claims to have no bad debt.
///      - gap: fair values jump anywhere, so liquidations and bad-debt write-offs happen.
contract CreditHandler is CommonBase, StdCheats, StdUtils {
    NightshiftCredit public immutable credit;
    NightshiftOracle public immutable oracle;
    MockERC20 public immutable usdt;
    address public immutable reporter;
    bool public immutable inBand;

    MockERC20[] public tokens;
    uint256[] internal basePrice; // 1e8 USD, a token's typical price
    address[] public lenders;
    address[] public borrowers;
    address public liquidator = address(0x11C0);

    mapping(address token => uint64) public round;
    mapping(address token => uint256) public floor; // in-band: minimum fair value allowed from now on

    // Ghost accounting
    uint256 public ghostDonations;
    uint256 public ghostBadDebtEvents;
    bool public ghostSharePriceDecreased;
    uint256 internal lastAssetsPlusOne;
    uint256 internal lastSupplyPlusOne;

    // Coverage counters
    mapping(bytes32 => uint256) public calls;

    constructor(
        NightshiftCredit credit_,
        NightshiftOracle oracle_,
        MockERC20 usdt_,
        MockERC20[] memory tokens_,
        uint256[] memory basePrice_,
        address reporter_,
        bool inBand_
    ) {
        credit = credit_;
        oracle = oracle_;
        usdt = usdt_;
        reporter = reporter_;
        inBand = inBand_;
        for (uint256 i; i < tokens_.length; ++i) {
            tokens.push(tokens_[i]);
            basePrice.push(basePrice_[i]);
        }
        for (uint256 i; i < 3; ++i) {
            lenders.push(address(uint160(0x1E0D0 + i)));
            borrowers.push(address(uint160(0xB0B0 + i)));
        }
        lastAssetsPlusOne = 1;
        lastSupplyPlusOne = 1;
    }

    // ------------------------------------------------------------------ helpers

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function lenderAt(uint256 i) external view returns (address) {
        return lenders[i];
    }

    function borrowerAt(uint256 i) external view returns (address) {
        return borrowers[i];
    }

    function actorCount() external view returns (uint256) {
        return lenders.length;
    }

    /// @dev Records whether the action moved the share price down (only allowed when bad debt was written off).
    modifier tracked(bytes32 name) {
        calls[name]++;
        _;
        uint256 a = credit.totalAssets() + 1;
        uint256 s = credit.totalSupply() + 1;
        // a / s < lastA / lastS  <=>  a * lastS < lastA * s
        if (a * lastSupplyPlusOne < lastAssetsPlusOne * s && !_badDebtThisCall) ghostSharePriceDecreased = true;
        lastAssetsPlusOne = a;
        lastSupplyPlusOne = s;
        _badDebtThisCall = false;
    }

    bool internal _badDebtThisCall;

    function _token(uint256 seed) internal view returns (MockERC20 t, uint256 i) {
        i = seed % tokens.length;
        t = tokens[i];
    }

    /// @dev After a successful borrow check by `account`, the realized price must stay at or above each relied-on
    ///      `lower` for the in-band claim to apply.
    function _raiseFloors(address account) internal {
        if (credit.debtOf(account) == 0) return;
        for (uint256 i; i < tokens.length; ++i) {
            address t = address(tokens[i]);
            if (credit.collateralOf(account, t) == 0) continue;
            (, INightshiftOracle.Report memory r) = oracle.tryGetReport(t);
            if (r.lower > floor[t]) floor[t] = r.lower;
        }
    }

    // ------------------------------------------------------------------ lenders

    function deposit(uint256 actorSeed, uint256 assets) external tracked("deposit") {
        address l = lenders[actorSeed % lenders.length];
        assets = bound(assets, 1, 1e24);
        usdt.mint(l, assets);
        vm.startPrank(l);
        usdt.approve(address(credit), assets);
        credit.deposit(assets, l);
        vm.stopPrank();
    }

    function mint(uint256 actorSeed, uint256 shares) external tracked("mint") {
        address l = lenders[actorSeed % lenders.length];
        shares = bound(shares, 1, 1e24);
        uint256 assets = credit.previewMint(shares);
        usdt.mint(l, assets);
        vm.startPrank(l);
        usdt.approve(address(credit), assets);
        credit.mint(shares, l);
        vm.stopPrank();
    }

    function withdraw(uint256 actorSeed, uint256 assets) external tracked("withdraw") {
        address l = lenders[actorSeed % lenders.length];
        uint256 max = credit.maxWithdraw(l);
        if (max == 0) return;
        assets = bound(assets, 1, max);
        vm.prank(l);
        credit.withdraw(assets, l, l);
    }

    function redeem(uint256 actorSeed, uint256 shares) external tracked("redeem") {
        address l = lenders[actorSeed % lenders.length];
        uint256 max = credit.maxRedeem(l);
        if (max == 0) return;
        shares = bound(shares, 1, max);
        vm.prank(l);
        credit.redeem(shares, l, l);
    }

    function donate(uint256 assets) external tracked("donate") {
        assets = bound(assets, 1, 1e21);
        usdt.mint(address(credit), assets);
        ghostDonations += assets;
    }

    // ------------------------------------------------------------------ borrowers

    function depositCollateral(uint256 actorSeed, uint256 tokenSeed, uint256 wholeTokens)
        external
        tracked("depositCollateral")
    {
        address b = borrowers[actorSeed % borrowers.length];
        (MockERC20 t,) = _token(tokenSeed);
        uint256 amount = bound(wholeTokens, 1, 10_000 * 10 ** t.decimals());
        t.mint(b, amount);
        vm.startPrank(b);
        t.approve(address(credit), amount);
        credit.depositCollateral(address(t), amount, b);
        vm.stopPrank();
    }

    function withdrawCollateral(uint256 actorSeed, uint256 tokenSeed, uint256 amount)
        external
        tracked("withdrawCollateral")
    {
        address b = borrowers[actorSeed % borrowers.length];
        (MockERC20 t,) = _token(tokenSeed);
        uint256 bal = credit.collateralOf(b, address(t));
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(b);
        try credit.withdrawCollateral(address(t), amount, b) {
            calls["withdrawCollateralOk"]++;
            _raiseFloors(b);
        } catch {}
    }

    function borrow(uint256 actorSeed, uint256 amount) external tracked("borrow") {
        address b = borrowers[actorSeed % borrowers.length];
        NightshiftCredit.AccountData memory d = credit.getAccountData(b);
        uint256 headroom = d.borrowPower > d.debt ? d.borrowPower - d.debt : 0;
        uint256 cap = Math.min(headroom, credit.cash());
        // Mostly within headroom, sometimes just beyond it to exercise the rejection path.
        amount = bound(amount, 1, cap + cap / 50 + 1);
        vm.prank(b);
        try credit.borrow(amount, b) {
            calls["borrowOk"]++;
            _raiseFloors(b);
        } catch {}
    }

    /// @dev `maxBorrow` must always be exactly borrowable; any failure is recorded as a violation.
    function borrowMax(uint256 actorSeed) external tracked("borrowMax") {
        address b = borrowers[actorSeed % borrowers.length];
        uint256 amount = credit.maxBorrow(b);
        if (amount == 0) return;
        vm.prank(b);
        try credit.borrow(amount, b) {
            calls["borrowOk"]++;
            _raiseFloors(b);
            if (credit.maxBorrow(b) != 0) ghostMaxBorrowNotExact = true;
        } catch {
            ghostMaxBorrowNotExact = true;
        }
    }

    bool public ghostMaxBorrowNotExact;

    function repay(uint256 actorSeed, uint256 amount) external tracked("repay") {
        address b = borrowers[actorSeed % borrowers.length];
        uint256 debt = credit.debtOf(b);
        if (debt == 0) return;
        amount = bound(amount, 1, debt + 1);
        usdt.mint(b, amount);
        vm.startPrank(b);
        usdt.approve(address(credit), amount);
        try credit.repay(amount, b) {
            calls["repayOk"]++;
        } catch {}
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ liquidators

    function liquidate(uint256 actorSeed, uint256 tokenSeed, uint256 repayAmount) external tracked("liquidate") {
        // Search from the seeds for a liquidatable borrower and a collateral it actually holds.
        address b;
        for (uint256 k; k < borrowers.length; ++k) {
            address candidate = borrowers[(actorSeed + k) % borrowers.length];
            if (credit.isLiquidatable(candidate)) {
                b = candidate;
                break;
            }
        }
        if (b == address(0)) return;
        MockERC20 t;
        for (uint256 k; k < tokens.length; ++k) {
            (MockERC20 candidate,) = _token(tokenSeed + k);
            if (credit.collateralOf(b, address(candidate)) != 0) {
                t = candidate;
                break;
            }
        }
        uint256 debtBefore = credit.debtOf(b);
        repayAmount = bound(repayAmount, 1, debtBefore);
        usdt.mint(liquidator, repayAmount);
        vm.startPrank(liquidator);
        usdt.approve(address(credit), repayAmount);
        try credit.liquidate(b, address(t), repayAmount, 0, liquidator) returns (uint256 repaid, uint256) {
            calls["liquidateOk"]++;
            if (credit.getAccountData(b).collateralMask == 0 && debtBefore > repaid) {
                ghostBadDebtEvents++;
                _badDebtThisCall = true;
            }
        } catch {}
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ world

    function postReport(uint256 tokenSeed, uint256 priceSeed, uint256 bandSeed, uint256 skewSeed, uint256 flagSeed)
        external
        tracked("postReport")
    {
        (MockERC20 t, uint256 i) = _token(tokenSeed);
        uint256 base = basePrice[i];
        uint256 fair;
        if (inBand) {
            // Realized prices stay at or above every lower edge relied on so far (the in-band world).
            uint256 lo = Math.max(floor[address(t)], base / 2);
            fair = bound(priceSeed, lo, Math.max(lo, base * 2));
        } else {
            fair = bound(priceSeed, base / 50, base * 2); // gaps of up to -98%
        }
        uint256 width = fair * bound(bandSeed, 0, 3000) / 1e4; // up to 30% wide (beyond the 15% borrow gate)
        uint256 lower = fair - width * bound(skewSeed, 0, 100) / 100;
        if (lower == 0) lower = 1;
        uint256 upper = lower + width < fair ? fair : lower + width;
        uint256 f = flagSeed % 32;
        uint8 flags = f == 0 ? 1 : (f == 1 ? 8 : (f == 2 ? 6 : 0));

        INightshiftOracle.Report[] memory rs = new INightshiftOracle.Report[](1);
        rs[0] = INightshiftOracle.Report({
            fairValue: uint128(fair),
            lower: uint128(lower),
            upper: uint128(upper),
            anchorTime: uint64(block.timestamp + 2 days),
            updatedAt: uint64(block.timestamp),
            round: ++round[address(t)],
            session: 4,
            flags: flags
        });
        address[] memory ts = new address[](1);
        ts[0] = address(t);
        vm.prank(reporter);
        oracle.postReports(ts, rs);
    }

    function warp(uint256 secondsForward) external tracked("warp") {
        vm.warp(block.timestamp + bound(secondsForward, 1, 20 minutes));
    }
}
