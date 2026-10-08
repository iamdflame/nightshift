// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";

import {NightshiftOracle} from "../src/NightshiftOracle.sol";
import {NightshiftVenusOracle} from "../src/NightshiftVenusOracle.sol";
import {INightshiftOracle} from "../src/interfaces/INightshiftOracle.sol";
import {MockERC20, MockNightshiftOracle, NoDecimalsToken} from "./mocks/Mocks.sol";
import {Fixtures} from "./utils/Fixtures.sol";

contract NightshiftVenusOracleTest is Fixtures {
    NightshiftVenusOracle internal venus;
    MockERC20 internal nvda;

    event MaxAgeUpdated(uint256 previousMaxAge, uint256 newMaxAge);

    function setUp() public {
        vm.warp(SAT);
        _deployOracle();
        nvda = new MockERC20("NVIDIA Corp", "NVDAB", 18);
        venus = new NightshiftVenusOracle(oracle, owner, 1 hours);
    }

    function test_constructor() public {
        assertEq(address(venus.nightshift()), address(oracle));
        assertEq(venus.maxAge(), 1 hours);
        assertEq(venus.owner(), owner);

        vm.expectRevert(NightshiftVenusOracle.ZeroAddress.selector);
        new NightshiftVenusOracle(INightshiftOracle(address(0)), owner, 1 hours);
        vm.expectRevert(abi.encodeWithSelector(NightshiftVenusOracle.InvalidMaxAge.selector, 0));
        new NightshiftVenusOracle(oracle, owner, 0);
        vm.expectRevert(abi.encodeWithSelector(NightshiftVenusOracle.InvalidMaxAge.selector, 7 days + 1));
        new NightshiftVenusOracle(oracle, owner, 7 days + 1);
    }

    function test_getPrice_18Decimals() public {
        _post(address(nvda), 236.12345678e8, 220e8, 250e8);
        assertEq(venus.getPrice(address(nvda)), 236.12345678e18);
    }

    function test_getPrice_scalesByAssetDecimals() public {
        uint8[5] memory decs = [uint8(0), 6, 8, 18, 28];
        for (uint256 i; i < decs.length; ++i) {
            MockERC20 t = new MockERC20("T", "T", decs[i]);
            _post(address(t), 100e8, 90e8, 110e8);
            // One whole token = $100; Venus wants 1e(36 - decimals) precision per smallest unit.
            assertEq(venus.getPrice(address(t)), 100 * 10 ** (36 - uint256(decs[i])));
        }
    }

    function test_getPrice_unsupportedDecimals() public {
        MockERC20 t = new MockERC20("T", "T", 29);
        _post(address(t), 100e8, 90e8, 110e8);
        vm.expectRevert(abi.encodeWithSelector(NightshiftVenusOracle.UnsupportedDecimals.selector, address(t), 29));
        venus.getPrice(address(t));

        NoDecimalsToken nd = new NoDecimalsToken();
        _post(address(nd), 100e8, 90e8, 110e8);
        vm.expectRevert();
        venus.getPrice(address(nd));
    }

    function test_getPrice_noReport() public {
        vm.expectRevert(abi.encodeWithSelector(NightshiftOracle.NoReport.selector, address(nvda)));
        venus.getPrice(address(nvda));
    }

    function test_getPrice_staleness() public {
        _post(address(nvda), 236e8, 220e8, 250e8);
        vm.warp(SAT + 1 hours);
        assertEq(venus.getPrice(address(nvda)), 236e18); // exactly maxAge old: fresh
        vm.warp(SAT + 1 hours + 1);
        vm.expectRevert(
            abi.encodeWithSelector(NightshiftVenusOracle.StalePrice.selector, address(nvda), SAT, uint256(1 hours))
        );
        venus.getPrice(address(nvda));
    }

    function test_getPrice_flags() public {
        uint8[4] memory blocking = [uint8(1), 8, 9, 255];
        for (uint256 i; i < blocking.length; ++i) {
            _postFlags(address(nvda), 236e8, 220e8, 250e8, blocking[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    blocking[i] & 1 != 0
                        ? NightshiftVenusOracle.CorporateActionPaused.selector
                        : NightshiftVenusOracle.ModelDegraded.selector,
                    address(nvda)
                )
            );
            venus.getPrice(address(nvda));
        }
        // Informational flags (reference stale, thin liquidity) do not block pricing.
        _postFlags(address(nvda), 236e8, 220e8, 250e8, 2 | 4);
        assertEq(venus.getPrice(address(nvda)), 236e18);
    }

    function test_getPrice_malformedReportFromFaultyOracle() public {
        MockNightshiftOracle bad = new MockNightshiftOracle();
        NightshiftVenusOracle v = new NightshiftVenusOracle(bad, owner, 1 hours);
        INightshiftOracle.Report memory r = _report(0, 0, 0);
        bad.set(address(nvda), r);
        vm.expectRevert(abi.encodeWithSelector(NightshiftVenusOracle.MalformedReport.selector, address(nvda)));
        v.getPrice(address(nvda));
    }

    function test_setMaxAge() public {
        vm.expectEmit(address(venus));
        emit MaxAgeUpdated(1 hours, 2 hours);
        vm.prank(owner);
        venus.setMaxAge(2 hours);
        assertEq(venus.maxAge(), 2 hours);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(NightshiftVenusOracle.InvalidMaxAge.selector, 0));
        venus.setMaxAge(0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        venus.setMaxAge(1);
    }

    function test_noRenounce() public {
        vm.prank(owner);
        vm.expectRevert(NightshiftVenusOracle.RenounceDisabled.selector);
        venus.renounceOwnership();
    }

    function testFuzz_priceIsScaledFairValue(uint128 fair, uint8 dec) public {
        fair = uint128(bound(fair, 1, type(uint128).max));
        dec = uint8(bound(dec, 0, 28));
        MockERC20 t = new MockERC20("T", "T", dec);
        _post(address(t), fair, fair, fair);
        assertEq(venus.getPrice(address(t)), uint256(fair) * 10 ** (28 - uint256(dec)));
    }
}
