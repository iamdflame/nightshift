// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {NightshiftCredit} from "../../src/NightshiftCredit.sol";
import {NightshiftOracle} from "../../src/NightshiftOracle.sol";
import {INightshiftOracle} from "../../src/interfaces/INightshiftOracle.sol";
import {MockERC20} from "../mocks/Mocks.sol";

/// @dev Shared clock, actors and report helpers.
abstract contract Fixtures is Test {
    /// Saturday 2026-10-10 16:00:00 UTC (12:00 EDT): the US market is dark.
    uint64 internal constant SAT = 1_791_648_000;
    /// Monday 2026-10-12 13:30:00 UTC (09:30 EDT): next regular-session open.
    uint64 internal constant MON_OPEN = 1_791_811_800;

    uint8 internal constant SESSION_REGULAR = 0;
    uint8 internal constant SESSION_CLOSED = 4;

    address internal owner = makeAddr("owner");
    address internal reporter = makeAddr("reporter");
    address internal lender = makeAddr("lender");
    address internal borrower = makeAddr("borrower");
    address internal liquidator = makeAddr("liquidator");

    NightshiftOracle internal oracle;
    mapping(address token => uint64) internal lastRound;

    function _deployOracle() internal {
        oracle = new NightshiftOracle(owner);
        vm.prank(owner);
        oracle.setReporter(reporter, true);
    }

    function _report(uint128 fair, uint128 lower, uint128 upper)
        internal
        view
        returns (INightshiftOracle.Report memory r)
    {
        r = INightshiftOracle.Report({
            fairValue: fair,
            lower: lower,
            upper: upper,
            anchorTime: block.timestamp < MON_OPEN ? MON_OPEN : uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            round: 0,
            session: block.timestamp < MON_OPEN ? SESSION_CLOSED : SESSION_REGULAR,
            flags: 0
        });
    }

    /// @dev Posts `r` for `token` with the next round number.
    function _post(address token, INightshiftOracle.Report memory r) internal {
        r.round = ++lastRound[token];
        address[] memory tokens = new address[](1);
        tokens[0] = token;
        INightshiftOracle.Report[] memory reports = new INightshiftOracle.Report[](1);
        reports[0] = r;
        vm.prank(reporter);
        oracle.postReports(tokens, reports);
    }

    function _post(address token, uint128 fair, uint128 lower, uint128 upper) internal {
        _post(token, _report(fair, lower, upper));
    }

    function _postFlags(address token, uint128 fair, uint128 lower, uint128 upper, uint8 flags) internal {
        INightshiftOracle.Report memory r = _report(fair, lower, upper);
        r.flags = flags;
        _post(token, r);
    }

    function _defaultParams() internal pure returns (NightshiftCredit.CollateralParams memory) {
        return NightshiftCredit.CollateralParams({
            enabled: true, baseLtvBps: 5000, liqThresholdBps: 6500, liqBonusBps: 500, maxBandBps: 1500, maxAge: 3600
        });
    }

    function _one(address a) internal pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = a;
    }
}

/// @dev Credit market wired to a real oracle with one 18-decimal stock token (NVDA-like) and USDT.
abstract contract CreditFixture is Fixtures {
    NightshiftCredit internal credit;
    MockERC20 internal usdt;
    MockERC20 internal nvda;

    uint256 internal constant APR_BPS = 800; // 8%
    // NVDA-like weekend report: fair $236, 5-95% next-open band [$220, $250] (12.7% wide).
    uint128 internal constant FAIR = 236e8;
    uint128 internal constant LOWER = 220e8;
    uint128 internal constant UPPER = 250e8;

    function setUp() public virtual {
        vm.warp(SAT);
        _deployOracle();
        usdt = new MockERC20("Tether USD", "USDT", 18);
        nvda = new MockERC20("NVIDIA Corp", "NVDAB", 18);
        credit = new NightshiftCredit(usdt, oracle, owner, APR_BPS, "Nightshift USDT", "nsUSDT");
        vm.prank(owner);
        credit.setCollateral(address(nvda), _defaultParams());
    }

    function _lend(address who, uint256 assets) internal returns (uint256 shares) {
        usdt.mint(who, assets);
        vm.startPrank(who);
        usdt.approve(address(credit), assets);
        shares = credit.deposit(assets, who);
        vm.stopPrank();
    }

    function _depositCollateral(address who, MockERC20 token, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(credit), amount);
        credit.depositCollateral(address(token), amount, who);
        vm.stopPrank();
    }

    function _borrow(address who, uint256 amount) internal {
        vm.prank(who);
        credit.borrow(amount, who);
    }

    function _repay(address who, uint256 amount) internal returns (uint256 repaid) {
        usdt.mint(who, amount == type(uint256).max ? credit.debtOf(who) : amount);
        vm.startPrank(who);
        usdt.approve(address(credit), type(uint256).max);
        repaid = credit.repay(amount, who);
        vm.stopPrank();
    }

    /// @dev Expected borrowing power of `amount` 18-dec collateral at `price` (1e8) with `ltvBps`, in 18-dec USDT.
    function _power(uint256 amount, uint256 price, uint256 ltvBps) internal pure returns (uint256) {
        return amount * price * ltvBps / (1e8 * 1e4);
    }
}
