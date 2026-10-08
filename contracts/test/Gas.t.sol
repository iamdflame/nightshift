// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {INightshiftOracle} from "../src/interfaces/INightshiftOracle.sol";
import {MockERC20} from "./mocks/Mocks.sol";
import {CreditFixture} from "./utils/Fixtures.sol";

/// Hot-path gas, recorded to snapshots/GasBenchmarks.json. Run with `forge test --mc GasBenchmarks --isolate` so each
/// call executes as its own transaction (cold storage, realistic numbers).
contract GasBenchmarks is CreditFixture {
    MockERC20 internal tsla;
    MockERC20 internal spy;

    function setUp() public override {
        super.setUp();
        tsla = new MockERC20("Tesla", "TSLAB", 18);
        spy = new MockERC20("SPY", "SPYB", 18);
        vm.startPrank(owner);
        credit.setCollateral(address(tsla), _defaultParams());
        credit.setCollateral(address(spy), _defaultParams());
        vm.stopPrank();
    }

    function _batch(uint256 n, uint64 round)
        internal
        view
        returns (address[] memory t, INightshiftOracle.Report[] memory rs)
    {
        address[3] memory all = [address(nvda), address(tsla), address(spy)];
        t = new address[](n);
        rs = new INightshiftOracle.Report[](n);
        for (uint256 i; i < n; ++i) {
            t[i] = all[i];
            rs[i] = _report(FAIR, LOWER, UPPER);
            rs[i].round = round;
        }
    }

    function test_gas_postReports() public {
        (address[] memory t1, INightshiftOracle.Report[] memory r1) = _batch(1, 1);
        vm.prank(reporter);
        oracle.postReports(t1, r1);
        vm.snapshotGasLastCall("postReports_1token_firstWrite");

        (t1, r1) = _batch(1, 2);
        vm.prank(reporter);
        oracle.postReports(t1, r1);
        vm.snapshotGasLastCall("postReports_1token_update");

        (address[] memory t3, INightshiftOracle.Report[] memory r3) = _batch(3, 3);
        vm.prank(reporter);
        oracle.postReports(t3, r3);
        vm.snapshotGasLastCall("postReports_3tokens_mixed");

        (t3, r3) = _batch(3, 4);
        vm.prank(reporter);
        oracle.postReports(t3, r3);
        vm.snapshotGasLastCall("postReports_3tokens_update");
    }

    function test_gas_borrowRepay() public {
        _lend(lender, 1000e18);
        _depositCollateral(borrower, nvda, 1e18);
        _post(address(nvda), FAIR, LOWER, UPPER);
        vm.prank(borrower);
        credit.borrow(50e18, borrower);
        vm.snapshotGasLastCall("borrow_1collateral_first");

        vm.warp(block.timestamp + 60);
        vm.prank(borrower);
        credit.borrow(10e18, borrower);
        vm.snapshotGasLastCall("borrow_1collateral_again");

        _depositCollateral(borrower, tsla, 1e18);
        _depositCollateral(borrower, spy, 1e18);
        _post(address(tsla), FAIR, LOWER, UPPER);
        _post(address(spy), FAIR, LOWER, UPPER);
        vm.prank(borrower);
        credit.borrow(10e18, borrower);
        vm.snapshotGasLastCall("borrow_3collaterals");

        usdt.mint(borrower, 100e18);
        vm.prank(borrower);
        usdt.approve(address(credit), type(uint256).max);
        vm.prank(borrower);
        credit.repay(type(uint256).max, borrower);
        vm.snapshotGasLastCall("repay_full");
    }

    function test_gas_collateralAndLender() public {
        nvda.mint(borrower, 2e18);
        vm.prank(borrower);
        nvda.approve(address(credit), 2e18);
        vm.prank(borrower);
        credit.depositCollateral(address(nvda), 1e18, borrower);
        vm.snapshotGasLastCall("depositCollateral_first");

        usdt.mint(lender, 1000e18);
        vm.prank(lender);
        usdt.approve(address(credit), 1000e18);
        vm.prank(lender);
        credit.deposit(1000e18, lender);
        vm.snapshotGasLastCall("lender_deposit_first");
    }

    function test_gas_liquidate() public {
        _lend(lender, 1000e18);
        _depositCollateral(borrower, nvda, 1e18);
        _post(address(nvda), FAIR, LOWER, UPPER);
        _borrow(borrower, 110e18);
        vm.warp(MON_OPEN + 60);
        _post(address(nvda), 150e8, 149e8, 151e8);
        usdt.mint(liquidator, 100e18);
        vm.prank(liquidator);
        usdt.approve(address(credit), type(uint256).max);
        vm.prank(liquidator);
        credit.liquidate(borrower, address(nvda), type(uint256).max, 0, liquidator);
        vm.snapshotGasLastCall("liquidate_partial");
    }
}
