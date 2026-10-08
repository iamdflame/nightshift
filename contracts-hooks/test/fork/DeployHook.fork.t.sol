// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ICLPoolManager} from "infinity-core/src/pool-cl/interfaces/ICLPoolManager.sol";
import {Currency} from "infinity-core/src/types/Currency.sol";
import {DeployHook} from "../../script/DeployHook.s.sol";
import {NightshiftHook} from "../../src/NightshiftHook.sol";
import {NightshiftFeeMath} from "../../src/libraries/NightshiftFeeMath.sol";

/// @notice Runs script/DeployHook.s.sol end to end on a BSC fork (the same code path as `forge script` dry runs).
contract DeployHookForkTest is Test {
    address internal constant CL_POOL_MANAGER = 0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b;
    address internal constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;

    function setUp() public {
        vm.createSelectFork(vm.envOr("BSC_RPC_URL", string("https://bsc-dataseed.bnbchain.org")));
    }

    function test_fork_deployScript_initializesNvdabUsdtPool() public {
        DeployHook.Deployment memory d = new DeployHook().run();

        assertEq(Currency.unwrap(d.key.currency0), NVDAB);
        assertEq(Currency.unwrap(d.key.currency1), USDT);
        assertEq(d.key.fee, 0x800000);
        assertEq(d.key.parameters, bytes32(uint256(0x0a0041)));

        (uint160 sqrtP,,,) = ICLPoolManager(CL_POOL_MANAGER).getSlot0(d.id);
        assertEq(sqrtP, d.sqrtPriceX96);
        assertApproxEqAbs(NightshiftFeeMath.poolPriceE8(sqrtP, true, 18, 18), 236e8, 1);

        NightshiftHook.PoolConfig memory cfg = d.hook.getPoolConfig(d.id);
        assertEq(address(cfg.oracle), address(d.oracle));
        assertTrue(cfg.stockIsCurrency0);
        assertEq(cfg.params.maxFee, d.hook.defaultFeeParams().maxFee);
        // at fair value in the regular session every trade pays minFee
        (uint24 fee,,,) = d.hook.quoteFee(d.key, false);
        assertEq(fee, 500);
    }
}
