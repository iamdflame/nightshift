// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Strings} from "@openzeppelin-contracts/utils/Strings.sol";

import {NightshiftFeed} from "../src/NightshiftFeed.sol";
import {NightshiftOracle} from "../src/NightshiftOracle.sol";
import {INightshiftOracle} from "../src/interfaces/INightshiftOracle.sol";
import {Bytes32SymbolToken, MockERC20, NoDecimalsToken, RawSymbolToken, RevertingSymbolToken} from "./mocks/Mocks.sol";
import {Fixtures} from "./utils/Fixtures.sol";

contract NightshiftFeedTest is Fixtures {
    MockERC20 internal nvda;
    NightshiftFeed internal feed;

    function setUp() public {
        vm.warp(SAT);
        _deployOracle();
        nvda = new MockERC20("NVIDIA Corp", "NVDAB", 18);
        vm.prank(owner);
        feed = NightshiftFeed(oracle.createFeed(address(nvda)));
    }

    function _feedFor(address token) internal returns (NightshiftFeed) {
        vm.prank(owner);
        return NightshiftFeed(oracle.createFeed(token));
    }

    function test_metadata() public view {
        assertEq(feed.decimals(), 8);
        assertEq(feed.version(), 1);
        assertEq(feed.VERSION(), 1);
        assertEq(feed.description(), "NVDAB / USD (Nightshift)");
    }

    function test_latestRoundData_mapsReport() public {
        _post(address(nvda), 236e8, 220e8, 250e8);
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();
        assertEq(roundId, 1);
        assertEq(answer, int256(uint256(236e8)));
        assertEq(startedAt, SAT);
        assertEq(updatedAt, SAT);
        assertEq(answeredInRound, 1);
    }

    function test_getRoundData_latestOnly() public {
        _post(address(nvda), 236e8, 220e8, 250e8);
        vm.warp(SAT + 60);
        _post(address(nvda), 237e8, 221e8, 251e8);

        (uint80 roundId, int256 answer,, uint256 updatedAt,) = feed.getRoundData(2);
        assertEq(roundId, 2);
        assertEq(answer, int256(uint256(237e8)));
        assertEq(updatedAt, SAT + 60);

        vm.expectRevert(abi.encodeWithSelector(NightshiftFeed.RoundNotAvailable.selector, uint80(1), uint80(2)));
        feed.getRoundData(1);
        vm.expectRevert(abi.encodeWithSelector(NightshiftFeed.RoundNotAvailable.selector, uint80(3), uint80(2)));
        feed.getRoundData(3);
    }

    function test_band_andLatestReport() public {
        INightshiftOracle.Report memory r = _report(236e8, 220e8, 250e8);
        r.flags = 6;
        _post(address(nvda), r);
        (uint128 lower, uint128 upper, uint64 anchorTime, uint8 session, uint8 flags) = feed.band();
        assertEq(lower, 220e8);
        assertEq(upper, 250e8);
        assertEq(anchorTime, MON_OPEN);
        assertEq(session, SESSION_CLOSED);
        assertEq(flags, 6);
        assertEq(feed.latestReport().round, 1);
    }

    function test_noReport_reverts() public {
        bytes memory err = abi.encodeWithSelector(NightshiftOracle.NoReport.selector, address(nvda));
        vm.expectRevert(err);
        feed.latestRoundData();
        vm.expectRevert(err);
        feed.getRoundData(0);
        vm.expectRevert(err);
        feed.band();
        vm.expectRevert(err);
        feed.latestReport();
    }

    function test_constructor_zeroAddress() public {
        vm.expectRevert(NightshiftFeed.ZeroAddress.selector);
        new NightshiftFeed(INightshiftOracle(address(0)), address(nvda));
        vm.expectRevert(NightshiftFeed.ZeroAddress.selector);
        new NightshiftFeed(oracle, address(0));
    }

    // ------------------------------------------------------------------ defensive symbol() reads

    function test_description_bytes32Symbol() public {
        assertEq(_feedFor(address(new Bytes32SymbolToken())).description(), "MKR / USD (Nightshift)");
    }

    function test_description_fallsBackToAddress() public {
        address[5] memory weird = [
            address(new RevertingSymbolToken()),
            address(new RawSymbolToken("")), // empty return data
            address(new RawSymbolToken(abi.encode(uint256(64), uint256(3), bytes32("ABC")))), // bad offset
            address(new RawSymbolToken(abi.encode(uint256(32), uint256(500)))), // length beyond data
            address(new RawSymbolToken(abi.encode(bytes32(0)))) // all-zero bytes32
        ];
        for (uint256 i; i < weird.length; ++i) {
            string memory expected = string.concat(Strings.toHexString(weird[i]), " / USD (Nightshift)");
            assertEq(_feedFor(weird[i]).description(), expected);
        }
    }

    function test_description_rejectsOversizedSymbol() public {
        bytes memory long = new bytes(65);
        for (uint256 i; i < long.length; ++i) {
            long[i] = "A";
        }
        address tok = address(new RawSymbolToken(abi.encode(string(long))));
        assertEq(_feedFor(tok).description(), string.concat(Strings.toHexString(tok), " / USD (Nightshift)"));

        // Exactly 64 characters is accepted verbatim.
        bytes memory max = new bytes(64);
        for (uint256 i; i < max.length; ++i) {
            max[i] = "B";
        }
        address tok64 = address(new RawSymbolToken(abi.encode(string(max))));
        assertEq(_feedFor(tok64).description(), string.concat(string(max), " / USD (Nightshift)"));
    }

    function test_description_returnBombIsBounded() public {
        // 8 KB of return data: the feed copies at most 128 bytes and falls back to the address.
        address bomb = address(new RawSymbolToken(new bytes(8192)));
        uint256 gasBefore = gasleft();
        NightshiftFeed f = _feedFor(bomb);
        assertLt(gasBefore - gasleft(), 2_000_000);
        assertEq(f.description(), string.concat(Strings.toHexString(bomb), " / USD (Nightshift)"));
    }

    function test_description_contractWithoutSymbol() public {
        address tok = address(new NoDecimalsToken()); // has symbol() = "NODEC"
        assertEq(_feedFor(tok).description(), "NODEC / USD (Nightshift)");
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_answerIsFairValue(uint128 lower, uint128 fair, uint128 upper, uint8 flags) public {
        lower = uint128(bound(lower, 1, type(uint128).max));
        fair = uint128(bound(fair, lower, type(uint128).max));
        upper = uint128(bound(upper, fair, type(uint128).max));
        INightshiftOracle.Report memory r = _report(fair, lower, upper);
        r.flags = flags;
        _post(address(nvda), r);

        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();
        assertEq(answer, int256(uint256(fair)));
        assertGt(answer, 0);
        assertEq(roundId, answeredInRound);
        assertEq(updatedAt, block.timestamp);
        (uint128 l, uint128 u,,, uint8 f) = feed.band();
        assertEq(l, lower);
        assertEq(u, upper);
        assertEq(f, flags);
    }
}
