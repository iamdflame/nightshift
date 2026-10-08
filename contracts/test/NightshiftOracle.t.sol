// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";

import {NightshiftFeed} from "../src/NightshiftFeed.sol";
import {NightshiftOracle} from "../src/NightshiftOracle.sol";
import {INightshiftOracle} from "../src/interfaces/INightshiftOracle.sol";
import {MockERC20} from "./mocks/Mocks.sol";
import {Fixtures} from "./utils/Fixtures.sol";

contract NightshiftOracleTest is Fixtures {
    MockERC20 internal nvda;
    MockERC20 internal tsla;

    event ReportPosted(
        address indexed token,
        uint64 indexed round,
        uint128 fairValue,
        uint128 lower,
        uint128 upper,
        uint8 session,
        uint8 flags
    );
    event ReporterUpdated(address indexed reporter, bool enabled);
    event FeedCreated(address indexed token, address indexed feed);

    function setUp() public {
        vm.warp(SAT);
        _deployOracle();
        nvda = new MockERC20("NVIDIA Corp", "NVDAB", 18);
        tsla = new MockERC20("Tesla, Inc.", "TSLAB", 18);
    }

    function _batch(address token, INightshiftOracle.Report memory r)
        internal
        pure
        returns (address[] memory tokens, INightshiftOracle.Report[] memory reports)
    {
        tokens = new address[](1);
        tokens[0] = token;
        reports = new INightshiftOracle.Report[](1);
        reports[0] = r;
    }

    function _valid(uint64 round) internal view returns (INightshiftOracle.Report memory r) {
        r = _report(236e8, 220e8, 250e8);
        r.round = round;
    }

    function _expectPostRevert(address token, INightshiftOracle.Report memory r, bytes memory err) internal {
        (address[] memory t, INightshiftOracle.Report[] memory rs) = _batch(token, r);
        vm.expectRevert(err);
        vm.prank(reporter);
        oracle.postReports(t, rs);
    }

    // ------------------------------------------------------------------ construction & reporters

    function test_constructor() public view {
        assertEq(oracle.owner(), owner);
        assertEq(oracle.decimals(), 8);
        assertTrue(oracle.isReporter(reporter));
        assertEq(oracle.reporters().length, 1);
    }

    function test_setReporter_addAndRemove() public {
        address r2 = makeAddr("r2");
        vm.expectEmit(address(oracle));
        emit ReporterUpdated(r2, true);
        vm.prank(owner);
        oracle.setReporter(r2, true);
        assertTrue(oracle.isReporter(r2));
        assertEq(oracle.reporters().length, 2);

        vm.expectEmit(address(oracle));
        emit ReporterUpdated(r2, false);
        vm.prank(owner);
        oracle.setReporter(r2, false);
        assertFalse(oracle.isReporter(r2));
    }

    function test_setReporter_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        oracle.setReporter(address(1), true);

        vm.startPrank(owner);
        vm.expectRevert(NightshiftOracle.ZeroAddress.selector);
        oracle.setReporter(address(0), true);
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.ReporterUnchanged.selector, reporter, true));
        oracle.setReporter(reporter, true);
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.ReporterUnchanged.selector, address(7), false));
        oracle.setReporter(address(7), false);
        vm.stopPrank();
    }

    function test_removedReporterCannotPost() public {
        vm.prank(owner);
        oracle.setReporter(reporter, false);
        _expectPostRevert(
            address(nvda), _valid(1), abi.encodeWithSelector(NightshiftOracle.NotReporter.selector, reporter)
        );
    }

    function test_ownership_twoStep_andNoRenounce() public {
        address next = makeAddr("next");
        vm.prank(owner);
        oracle.transferOwnership(next);
        assertEq(oracle.owner(), owner);
        assertEq(oracle.pendingOwner(), next);
        vm.prank(next);
        oracle.acceptOwnership();
        assertEq(oracle.owner(), next);

        vm.expectRevert(NightshiftOracle.RenounceDisabled.selector);
        vm.prank(next);
        oracle.renounceOwnership();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vm.prank(owner);
        oracle.renounceOwnership();
    }

    // ------------------------------------------------------------------ postReports

    function test_postReports_storesAndEmits() public {
        INightshiftOracle.Report memory r = _valid(1);
        r.flags = 4;
        (address[] memory t, INightshiftOracle.Report[] memory rs) = _batch(address(nvda), r);
        vm.expectEmit(address(oracle));
        emit ReportPosted(address(nvda), 1, 236e8, 220e8, 250e8, SESSION_CLOSED, 4);
        vm.prank(reporter);
        oracle.postReports(t, rs);

        INightshiftOracle.Report memory got = oracle.getReport(address(nvda));
        assertEq(keccak256(abi.encode(got)), keccak256(abi.encode(r)));
        (bool exists, INightshiftOracle.Report memory got2) = oracle.tryGetReport(address(nvda));
        assertTrue(exists);
        assertEq(keccak256(abi.encode(got2)), keccak256(abi.encode(r)));
    }

    function test_postReports_multiTokenBatch() public {
        address[] memory t = new address[](2);
        t[0] = address(nvda);
        t[1] = address(tsla);
        INightshiftOracle.Report[] memory rs = new INightshiftOracle.Report[](2);
        rs[0] = _valid(7);
        rs[1] = _report(430e8, 400e8, 460e8);
        rs[1].round = 3;
        vm.prank(reporter);
        oracle.postReports(t, rs);
        assertEq(oracle.getReport(address(nvda)).round, 7);
        assertEq(oracle.getReport(address(tsla)).fairValue, 430e8);
    }

    function test_postReports_sameTokenTwiceInBatch() public {
        address[] memory t = new address[](2);
        t[0] = address(nvda);
        t[1] = address(nvda);
        INightshiftOracle.Report[] memory rs = new INightshiftOracle.Report[](2);
        rs[0] = _valid(1);
        rs[1] = _valid(2);
        rs[1].fairValue = 240e8;
        vm.prank(reporter);
        oracle.postReports(t, rs);
        assertEq(oracle.getReport(address(nvda)).fairValue, 240e8);

        // Same round twice in one batch is rejected (and the batch is atomic).
        rs[0] = _valid(3);
        rs[1] = _valid(3);
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.NonMonotonicRound.selector, address(nvda), 3, 3));
        vm.prank(reporter);
        oracle.postReports(t, rs);
        assertEq(oracle.getReport(address(nvda)).round, 2);
    }

    function test_postReports_batchShapeReverts() public {
        vm.startPrank(reporter);
        vm.expectRevert(NightshiftOracle.EmptyBatch.selector);
        oracle.postReports(new address[](0), new INightshiftOracle.Report[](0));
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.LengthMismatch.selector, 1, 2));
        oracle.postReports(new address[](1), new INightshiftOracle.Report[](2));
        vm.stopPrank();

        (address[] memory t, INightshiftOracle.Report[] memory rs) = _batch(address(nvda), _valid(1));
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.NotReporter.selector, address(this)));
        oracle.postReports(t, rs);
    }

    function test_postReports_validation() public {
        address tok = address(nvda);
        INightshiftOracle.Report memory r;

        _expectPostRevert(address(0), _valid(1), abi.encodeWithSelector(NightshiftOracle.ZeroAddress.selector));

        r = _valid(1);
        r.lower = 0;
        r.fairValue = 0;
        r.upper = 0;
        _expectPostRevert(tok, r, abi.encodeWithSelector(NightshiftOracle.InvalidPrices.selector, tok, 0, 0, 0));

        r = _valid(1);
        r.lower = 237e8; // lower > fair
        _expectPostRevert(
            tok, r, abi.encodeWithSelector(NightshiftOracle.InvalidPrices.selector, tok, 237e8, 236e8, 250e8)
        );

        r = _valid(1);
        r.upper = 235e8; // fair > upper
        _expectPostRevert(
            tok, r, abi.encodeWithSelector(NightshiftOracle.InvalidPrices.selector, tok, 220e8, 236e8, 235e8)
        );

        r = _valid(1);
        r.updatedAt = SAT + 1;
        r.anchorTime = MON_OPEN;
        _expectPostRevert(
            tok, r, abi.encodeWithSelector(NightshiftOracle.FutureReport.selector, tok, SAT + 1, uint256(SAT))
        );

        r = _valid(1);
        r.anchorTime = SAT - 1;
        _expectPostRevert(
            tok, r, abi.encodeWithSelector(NightshiftOracle.AnchorBeforeUpdate.selector, tok, SAT - 1, SAT)
        );

        r = _valid(1);
        r.session = 6;
        _expectPostRevert(tok, r, abi.encodeWithSelector(NightshiftOracle.InvalidSession.selector, tok, 6));

        r = _valid(0); // round 0 is reserved for "no report"
        _expectPostRevert(tok, r, abi.encodeWithSelector(NightshiftOracle.NonMonotonicRound.selector, tok, 0, 0));
    }

    function test_postReports_boundariesAccepted() public {
        INightshiftOracle.Report memory r = _valid(1);
        r.lower = 1;
        r.fairValue = 1;
        r.upper = 1; // degenerate band, lower == fair == upper
        r.anchorTime = r.updatedAt; // regular session: anchor == updatedAt
        r.session = 5;
        r.flags = 255;
        (address[] memory t, INightshiftOracle.Report[] memory rs) = _batch(address(nvda), r);
        vm.prank(reporter);
        oracle.postReports(t, rs);
        assertEq(oracle.getReport(address(nvda)).session, 5);
    }

    function test_postReports_roundAndTimeMonotonic() public {
        address tok = address(nvda);
        (address[] memory t, INightshiftOracle.Report[] memory rs) = _batch(tok, _valid(5));
        vm.prank(reporter);
        oracle.postReports(t, rs);

        _expectPostRevert(
            tok, _valid(5), abi.encodeWithSelector(NightshiftOracle.NonMonotonicRound.selector, tok, 5, 5)
        );
        _expectPostRevert(
            tok, _valid(4), abi.encodeWithSelector(NightshiftOracle.NonMonotonicRound.selector, tok, 4, 5)
        );

        vm.warp(SAT + 100);
        INightshiftOracle.Report memory older = _valid(6);
        older.updatedAt = SAT - 1;
        _expectPostRevert(
            tok, older, abi.encodeWithSelector(NightshiftOracle.NonMonotonicTimestamp.selector, tok, SAT - 1, SAT)
        );

        // Equal timestamp with a higher round is fine (two aggregation cycles in one block).
        INightshiftOracle.Report memory same = _valid(6);
        same.updatedAt = SAT;
        (t, rs) = _batch(tok, same);
        vm.prank(reporter);
        oracle.postReports(t, rs);
        assertEq(oracle.getReport(tok).round, 6);
    }

    // ------------------------------------------------------------------ views

    function test_getReport_noReport() public {
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.NoReport.selector, address(nvda)));
        oracle.getReport(address(nvda));
        (bool exists, INightshiftOracle.Report memory r) = oracle.tryGetReport(address(nvda));
        assertFalse(exists);
        assertEq(r.round, 0);
        assertFalse(oracle.isFresh(address(nvda), type(uint256).max));
    }

    function test_isFresh_boundaries() public {
        _post(address(nvda), 236e8, 220e8, 250e8);
        assertTrue(oracle.isFresh(address(nvda), 0));
        vm.warp(SAT + 3600);
        assertTrue(oracle.isFresh(address(nvda), 3600));
        assertFalse(oracle.isFresh(address(nvda), 3599));
        assertTrue(oracle.isFresh(address(nvda), type(uint256).max)); // no overflow
        vm.warp(SAT - 10); // rewound clock: a report "from the future" is fresh, never an underflow
        assertTrue(oracle.isFresh(address(nvda), 0));
    }

    // ------------------------------------------------------------------ feed factory

    function test_createFeed() public {
        address predicted = oracle.predictFeed(address(nvda));
        vm.expectEmit(address(oracle));
        emit FeedCreated(address(nvda), predicted);
        vm.prank(owner);
        address feed = oracle.createFeed(address(nvda));
        assertEq(feed, predicted);
        assertEq(oracle.feedOf(address(nvda)), feed);
        assertEq(oracle.feedTokens().length, 1);
        assertEq(NightshiftFeed(feed).description(), "NVDAB / USD (Nightshift)");
        assertEq(address(NightshiftFeed(feed).oracle()), address(oracle));
        assertEq(NightshiftFeed(feed).token(), address(nvda));
    }

    function test_createFeed_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        oracle.createFeed(address(nvda));

        vm.startPrank(owner);
        vm.expectRevert(NightshiftOracle.ZeroAddress.selector);
        oracle.createFeed(address(0));
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.NotAContract.selector, address(0xBEEF)));
        oracle.createFeed(address(0xBEEF));
        address feed = oracle.createFeed(address(nvda));
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.FeedExists.selector, address(nvda), feed));
        oracle.createFeed(address(nvda));
        vm.stopPrank();
    }

    function test_createFeed_isDeterministicPerOracle() public {
        NightshiftOracle other = new NightshiftOracle(owner);
        assertTrue(other.predictFeed(address(nvda)) != oracle.predictFeed(address(nvda)));
        assertTrue(oracle.predictFeed(address(tsla)) != oracle.predictFeed(address(nvda)));
    }

    // ------------------------------------------------------------------ fuzz

    /// Any structurally valid report is accepted and stored bit-for-bit.
    function testFuzz_validReportRoundTrips(
        uint128 lower,
        uint128 fair,
        uint128 upper,
        uint64 age,
        uint64 horizon,
        uint64 round,
        uint8 session,
        uint8 flags
    ) public {
        lower = uint128(bound(lower, 1, type(uint128).max));
        fair = uint128(bound(fair, lower, type(uint128).max));
        upper = uint128(bound(upper, fair, type(uint128).max));
        uint64 updatedAt = uint64(bound(age, 0, SAT)); // any time up to now
        updatedAt = SAT - updatedAt;
        uint64 anchorTime = uint64(bound(horizon, updatedAt, type(uint64).max));
        round = uint64(bound(round, 1, type(uint64).max));
        session = uint8(bound(session, 0, 5));

        INightshiftOracle.Report memory r =
            INightshiftOracle.Report(fair, lower, upper, anchorTime, updatedAt, round, session, flags);
        (address[] memory t, INightshiftOracle.Report[] memory rs) = _batch(address(nvda), r);
        vm.prank(reporter);
        oracle.postReports(t, rs);
        assertEq(keccak256(abi.encode(oracle.getReport(address(nvda)))), keccak256(abi.encode(r)));
    }

    /// Any report violating `0 < lower <= fair <= upper` is rejected.
    function testFuzz_invalidPricesRejected(uint128 lower, uint128 fair, uint128 upper) public {
        vm.assume(lower == 0 || lower > fair || fair > upper);
        INightshiftOracle.Report memory r = _valid(1);
        r.lower = lower;
        r.fairValue = fair;
        r.upper = upper;
        _expectPostRevert(
            address(nvda),
            r,
            abi.encodeWithSelector(NightshiftOracle.InvalidPrices.selector, address(nvda), lower, fair, upper)
        );
    }

    /// The stored round only ever increases, whatever sequence of rounds a reporter tries.
    function testFuzz_roundStrictlyIncreases(uint64[8] memory rounds) public {
        uint64 last;
        for (uint256 i; i < rounds.length; ++i) {
            INightshiftOracle.Report memory r = _valid(rounds[i]);
            (address[] memory t, INightshiftOracle.Report[] memory rs) = _batch(address(nvda), r);
            vm.prank(reporter);
            if (rounds[i] > last) {
                oracle.postReports(t, rs);
                last = rounds[i];
            } else {
                vm.expectRevert(
                    abi.encodeWithSelector(NightshiftOracle.NonMonotonicRound.selector, address(nvda), rounds[i], last)
                );
                oracle.postReports(t, rs);
            }
            (, INightshiftOracle.Report memory stored) = oracle.tryGetReport(address(nvda));
            assertEq(stored.round, last);
        }
    }
}
