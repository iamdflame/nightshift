// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin-contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin-contracts/utils/math/Math.sol";

import {NightshiftCredit} from "../../src/NightshiftCredit.sol";
import {NightshiftFeed} from "../../src/NightshiftFeed.sol";
import {NightshiftOracle} from "../../src/NightshiftOracle.sol";
import {NightshiftVenusOracle} from "../../src/NightshiftVenusOracle.sol";
import {INightshiftOracle} from "../../src/interfaces/INightshiftOracle.sol";
import {Fixtures} from "../utils/Fixtures.sol";

interface IPancakeV3PoolLike {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint32, bool);
}

/// @notice BSC mainnet fork: real USDT, real NVDAB (OZ beacon proxy with a compliance module), real PancakeSwap V3
///         NVDAB/USDT pool for a realistic price. Runs against the latest block of `BSC_RPC_URL`
///         (default https://bsc-dataseed.bnbchain.org). Set `SKIP_FORK_TESTS=true` to skip offline.
contract BscForkTest is Fixtures {
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address internal constant POOL = 0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C; // PancakeSwap V3 NVDAB/USDT

    NightshiftCredit internal credit;
    NightshiftFeed internal feed;
    NightshiftVenusOracle internal venus;
    bool internal skipped;

    uint64 internal saturday; // next Saturday 16:00 UTC (12:00 EDT), US market dark
    uint64 internal mondayOpen; // following Monday 13:30 UTC (09:30 EDT)

    modifier onlyFork() {
        if (skipped) {
            vm.skip(true);
            return;
        }
        _;
    }

    function setUp() public {
        if (vm.envOr("SKIP_FORK_TESTS", false)) {
            skipped = true;
            return;
        }
        vm.createSelectFork(vm.envOr("BSC_RPC_URL", string("https://bsc-dataseed.bnbchain.org")));

        _deployOracle();
        credit = new NightshiftCredit(IERC20(USDT), oracle, owner, 800, "Nightshift USDT", "nsUSDT");
        venus = new NightshiftVenusOracle(oracle, owner, 1 hours);
        vm.startPrank(owner);
        credit.setCollateral(NVDAB, _defaultParams());
        feed = NightshiftFeed(oracle.createFeed(NVDAB));
        vm.stopPrank();

        // Next Saturday 16:00 UTC strictly after the fork's timestamp, and the Monday open after it.
        uint256 day = block.timestamp / 1 days;
        uint256 weekday = (day + 4) % 7; // 0 = Sunday (1970-01-01 was a Thursday)
        uint256 satDay = day + ((6 + 7 - weekday) % 7);
        if (satDay * 1 days + 16 hours <= block.timestamp) satDay += 7;
        saturday = uint64(satDay * 1 days + 16 hours);
        mondayOpen = uint64((satDay + 2) * 1 days + 13 hours + 30 minutes);
    }

    // ------------------------------------------------------------------ helpers

    /// NVDAB price in USD (1e8) from the PancakeSwap V3 pool's current sqrt price.
    function _poolPrice() internal view returns (uint128) {
        IPancakeV3PoolLike pool = IPancakeV3PoolLike(POOL);
        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        uint256 sq = uint256(sqrtPriceX96) * uint256(sqrtPriceX96); // < 2^256 for any uint160
        // Both tokens have 18 decimals, so the raw ratio is the human price.
        uint256 price = pool.token0() == NVDAB
            ? Math.mulDiv(sq, 1e8, 1 << 192) // USDT per NVDAB
            : Math.mulDiv(1 << 192, 1e8, sq);
        assertGt(price, 1e8, "pool price below $1");
        assertLt(price, 100_000e8, "pool price above $100k");
        return uint128(price);
    }

    /// `deal` first; if the proxy's storage layout ever defeats stdStorage, fall back to the pool's balance.
    function _fundNvdab(address to, uint256 amount) internal {
        try this.dealExternal(NVDAB, to, amount) {}
        catch {
            vm.prank(POOL);
            IERC20(NVDAB).transfer(to, amount);
        }
        assertEq(IERC20(NVDAB).balanceOf(to), amount);
    }

    function dealExternal(address token, address to, uint256 amount) external {
        deal(token, to, amount);
    }

    function _saturdayReport(uint128 fair) internal view returns (INightshiftOracle.Report memory r) {
        r = INightshiftOracle.Report({
            fairValue: fair,
            lower: fair * 93 / 100,
            upper: fair * 107 / 100, // 14% band: inside the 15% borrow gate
            anchorTime: mondayOpen,
            updatedAt: uint64(block.timestamp),
            round: 0,
            session: SESSION_CLOSED,
            flags: 0
        });
    }

    // ------------------------------------------------------------------ the weekend loan, end to end

    function test_fork_weekendLoanLifecycle() public onlyFork {
        // Lender deposits 1000 real USDT.
        deal(USDT, lender, 1000e18);
        vm.startPrank(lender);
        IERC20(USDT).approve(address(credit), 1000e18);
        uint256 shares = credit.deposit(1000e18, lender);
        vm.stopPrank();
        assertEq(shares, 1000e18);

        // Borrower posts 1 real NVDAB.
        _fundNvdab(borrower, 1e18);
        vm.startPrank(borrower);
        IERC20(NVDAB).approve(address(credit), 1e18);
        credit.depositCollateral(NVDAB, 1e18, borrower);
        vm.stopPrank();
        assertEq(IERC20(NVDAB).balanceOf(address(credit)), 1e18);

        // Saturday: the reporter posts a dark-session report centred on the pool's price.
        uint128 fair = _poolPrice();
        vm.warp(saturday);
        INightshiftOracle.Report memory sat = _saturdayReport(fair);
        _post(NVDAB, sat);

        // Borrow up to the limit (1 NVDAB * lower * 50%); one wei more is refused.
        uint256 limit = uint256(sat.lower) * 1e18 * 5000 / (1e8 * 1e4);
        assertEq(credit.getAccountData(borrower).borrowPower, limit);
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftCredit.InsufficientCollateral.selector, borrower, limit + 1, limit)
        );
        credit.borrow(limit + 1, borrower);
        vm.prank(borrower);
        credit.borrow(limit, borrower);
        assertEq(IERC20(USDT).balanceOf(borrower), limit);

        // A stale report blocks new borrowing. The staleness gate runs before the power comparison, so even this
        // at-limit account gets StaleReport rather than InsufficientCollateral.
        vm.warp(saturday + 3601);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(NightshiftCredit.StaleReport.selector, NVDAB, saturday, 3600));
        credit.borrow(1e18, borrower);

        // Monday: the open gaps far below Saturday's lower edge.
        vm.warp(mondayOpen + 60);
        uint128 mondayFair = sat.lower * 72 / 100;
        INightshiftOracle.Report memory mon = INightshiftOracle.Report({
            fairValue: mondayFair,
            lower: mondayFair * 995 / 1000,
            upper: mondayFair * 1005 / 1000,
            anchorTime: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            round: 0,
            session: SESSION_REGULAR,
            flags: 0
        });
        _post(NVDAB, mon);
        assertTrue(credit.isLiquidatable(borrower));

        // A liquidator repays half the debt with real USDT and receives real NVDAB at fair value + 5%.
        uint256 debtBefore = credit.debtOf(borrower);
        deal(USDT, liquidator, debtBefore);
        vm.startPrank(liquidator);
        IERC20(USDT).approve(address(credit), debtBefore);
        (uint256 repaid, uint256 seized) = credit.liquidate(borrower, NVDAB, type(uint256).max, 1, liquidator);
        vm.stopPrank();
        assertEq(IERC20(NVDAB).balanceOf(liquidator), seized);
        assertLe(seized * mondayFair * 1e4, repaid * 10_500 * 1e8); // never more than 105% of the repayment
        assertFalse(credit.isLiquidatable(borrower));

        // Lenders are whole: no loss of principal, and what is still lent is fully collateralized at the gap price.
        assertGe(credit.totalAssets(), 1000e18);
        assertGe(credit.convertToAssets(credit.balanceOf(lender)), 1000e18);
        assertGe(credit.collateralOf(borrower, NVDAB) * mondayFair / 1e8, credit.debtOf(borrower));

        // The borrower settles; the lender exits with principal plus interest in real USDT.
        deal(USDT, borrower, limit); // loan proceeds, enough for the remaining half plus interest
        vm.startPrank(borrower);
        IERC20(USDT).approve(address(credit), type(uint256).max);
        credit.repay(type(uint256).max, borrower);
        vm.stopPrank();
        uint256 lenderShares = credit.balanceOf(lender);
        vm.prank(lender);
        uint256 out = credit.redeem(lenderShares, lender, lender);
        assertGt(out, 1000e18);
        assertEq(IERC20(USDT).balanceOf(lender), out);
    }

    // ------------------------------------------------------------------ adapters on real tokens

    function test_fork_feedAdapter() public onlyFork {
        assertEq(feed.description(), "NVDAB / USD (Nightshift)");
        assertEq(feed.decimals(), 8);
        assertEq(feed.version(), 1);
        assertEq(address(feed), oracle.predictFeed(NVDAB));

        uint128 fair = _poolPrice();
        vm.warp(saturday);
        INightshiftOracle.Report memory r = _saturdayReport(fair);
        _post(NVDAB, r);

        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();
        assertEq(roundId, 1);
        assertEq(answer, int256(uint256(fair)));
        assertEq(startedAt, saturday);
        assertEq(updatedAt, saturday);
        assertEq(answeredInRound, 1);
        (uint128 lower, uint128 upper, uint64 anchorTime, uint8 session, uint8 flags) = feed.band();
        assertEq(lower, r.lower);
        assertEq(upper, r.upper);
        assertEq(anchorTime, mondayOpen);
        assertEq(session, SESSION_CLOSED);
        assertEq(flags, 0);
    }

    function test_fork_venusAdapter() public onlyFork {
        uint128 fair = _poolPrice();
        vm.warp(saturday);
        _post(NVDAB, _saturdayReport(fair));
        // NVDAB has 18 decimals: Venus scale 1e(36-18) = 1e18 => fairValue (1e8) * 1e10.
        assertEq(venus.getPrice(NVDAB), uint256(fair) * 1e10);

        INightshiftOracle.Report memory flagged = _saturdayReport(fair);
        flagged.flags = 1;
        _post(NVDAB, flagged);
        vm.expectRevert(abi.encodeWithSelector(NightshiftVenusOracle.CorporateActionPaused.selector, NVDAB));
        venus.getPrice(NVDAB);

        vm.warp(saturday + 1 hours + 1);
        INightshiftOracle.Report memory old = _saturdayReport(fair);
        old.updatedAt = saturday; // last report is from Saturday 16:00
        _post(NVDAB, old);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftVenusOracle.StalePrice.selector, NVDAB, saturday, uint256(1 hours))
        );
        venus.getPrice(NVDAB);
    }
}
