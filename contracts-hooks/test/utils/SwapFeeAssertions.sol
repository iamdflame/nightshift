// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ICLPoolManager} from "infinity-core/src/pool-cl/interfaces/ICLPoolManager.sol";
import {PoolKey} from "infinity-core/src/types/PoolKey.sol";
import {PoolId} from "infinity-core/src/types/PoolId.sol";
import {SqrtPriceMath} from "infinity-core/src/pool-cl/libraries/SqrtPriceMath.sol";
import {ProtocolFeeLibrary} from "infinity-core/src/libraries/ProtocolFeeLibrary.sol";

/// @notice Recovers the fee a swap actually paid from token amounts and pool state alone, and checks it against the
///         fee the hook asked for. Shared by the local and the BSC-fork suites.
/// @dev For a swap that stays inside one liquidity range, the input that moved the price is
///      getAmount{0,1}Delta(sqrtBefore, sqrtAfter, L): everything the trader paid beyond that is fee. PancakeSwap
///      charges swapFee = protocolFee + lpFee - protocolFee * lpFee / 1e6 on the input, so
///      realizedFee == amountIn * swapFee / 1e6 up to a few wei of per-step rounding.
abstract contract SwapFeeAssertions is Test {
    struct PoolState {
        uint160 sqrtPriceX96;
        uint24 protocolFee;
        uint128 liquidity;
        uint256 feeGrowth0X128;
        uint256 feeGrowth1X128;
        uint256 protocolAccrued0;
        uint256 protocolAccrued1;
    }

    struct FeeCheck {
        uint256 amountIn;
        uint256 realizedFee;
        uint256 lpFee;
        uint256 protocolCut;
        uint24 expectedSwapFee;
        uint24 eventSwapFee;
    }

    function _poolState(ICLPoolManager pm, PoolKey memory key) internal view returns (PoolState memory s) {
        PoolId id = key.toId();
        (s.sqrtPriceX96,, s.protocolFee,) = pm.getSlot0(id);
        s.liquidity = pm.getLiquidity(id);
        (s.feeGrowth0X128, s.feeGrowth1X128) = pm.getFeeGrowthGlobals(id);
        s.protocolAccrued0 = pm.protocolFeesAccrued(key.currency0);
        s.protocolAccrued1 = pm.protocolFeesAccrued(key.currency1);
    }

    /// @notice The total fee PancakeSwap charges for an LP fee chosen by the hook.
    function _swapFeeFor(uint24 protocolFee, bool zeroForOne, uint24 lpFee) internal pure returns (uint24) {
        uint16 pf = zeroForOne ? uint16(protocolFee & 0xfff) : uint16(protocolFee >> 12);
        return pf == 0 ? lpFee : ProtocolFeeLibrary.calculateSwapFee(pf, lpFee);
    }

    /// @notice Fee field of the last CLPoolManager Swap event in `logs`.
    function _swapEventFee(Vm.Log[] memory logs, address pm) internal pure returns (uint24 fee) {
        for (uint256 i = logs.length; i > 0; --i) {
            Vm.Log memory l = logs[i - 1];
            if (l.emitter == pm && l.topics[0] == ICLPoolManager.Swap.selector) {
                (,,,,, fee,) = abi.decode(l.data, (int128, int128, uint160, uint128, int24, uint24, uint16));
                return fee;
            }
        }
        revert("no Swap event");
    }

    /// @notice Asserts, from amounts, that a swap of `amountIn` paid the hook's `lpFee` plus the protocol fee, and
    ///         that LPs (fee growth) received everything but the protocol cut.
    function _assertRealizedFee(
        ICLPoolManager pm,
        PoolKey memory key,
        bool zeroForOne,
        PoolState memory pre,
        uint256 amountIn,
        uint24 lpFee
    ) internal view returns (FeeCheck memory c) {
        PoolState memory post = _poolState(pm, key);
        assertEq(post.liquidity, pre.liquidity, "swap left the liquidity range");
        c.amountIn = amountIn;
        c.realizedFee = amountIn - _netInput(zeroForOne, pre, post);
        c.expectedSwapFee = _swapFeeFor(pre.protocolFee, zeroForOne, lpFee);
        assertApproxEqAbs(c.realizedFee, (amountIn * c.expectedSwapFee) / 1e6, 10, "realized fee != hook fee");
        _checkFeeSplit(c, zeroForOne, pre, post);
    }

    /// Input that moved the price from pre to post (rounded up, as the pool charges it).
    function _netInput(bool zeroForOne, PoolState memory pre, PoolState memory post) private pure returns (uint256) {
        return zeroForOne
            ? SqrtPriceMath.getAmount0Delta(post.sqrtPriceX96, pre.sqrtPriceX96, pre.liquidity, true)
            : SqrtPriceMath.getAmount1Delta(pre.sqrtPriceX96, post.sqrtPriceX96, pre.liquidity, true);
    }

    /// Every wei of fee lands with LPs (fee growth) or the protocol, and the protocol takes only its own rate.
    function _checkFeeSplit(FeeCheck memory c, bool zeroForOne, PoolState memory pre, PoolState memory post)
        private
        pure
    {
        unchecked {
            uint256 growth =
                zeroForOne ? post.feeGrowth0X128 - pre.feeGrowth0X128 : post.feeGrowth1X128 - pre.feeGrowth1X128;
            c.lpFee = Math.mulDiv(growth, pre.liquidity, 1 << 128);
            c.protocolCut = zeroForOne
                ? post.protocolAccrued0 - pre.protocolAccrued0
                : post.protocolAccrued1 - pre.protocolAccrued1;
        }
        assertApproxEqAbs(c.lpFee + c.protocolCut, c.realizedFee, 10, "fee not credited");
        uint256 pf = zeroForOne ? pre.protocolFee & 0xfff : pre.protocolFee >> 12;
        assertApproxEqAbs(c.protocolCut, (c.amountIn * pf) / 1e6, 10, "protocol cut");
    }
}
