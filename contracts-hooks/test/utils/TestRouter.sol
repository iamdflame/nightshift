// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVault} from "infinity-core/src/interfaces/IVault.sol";
import {ILockCallback} from "infinity-core/src/interfaces/ILockCallback.sol";
import {ICLPoolManager} from "infinity-core/src/pool-cl/interfaces/ICLPoolManager.sol";
import {PoolKey} from "infinity-core/src/types/PoolKey.sol";
import {Currency} from "infinity-core/src/types/Currency.sol";
import {BalanceDelta} from "infinity-core/src/types/BalanceDelta.sol";

/// @notice Minimal Vault-lock router for local tests (the fork test uses the real Universal Router and
///         CLPositionManager instead). Pays from, and pays out to, the caller.
contract TestRouter is ILockCallback {
    uint160 internal constant MIN_SQRT_RATIO = 4_295_128_739;
    uint160 internal constant MAX_SQRT_RATIO = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342;

    IVault public immutable vault;
    ICLPoolManager public immutable poolManager;

    struct CallbackData {
        bool isSwap;
        address payer;
        PoolKey key;
        ICLPoolManager.SwapParams swapParams;
        ICLPoolManager.ModifyLiquidityParams liquidityParams;
    }

    constructor(ICLPoolManager _poolManager) {
        poolManager = _poolManager;
        vault = _poolManager.vault();
    }

    /// @param amountSpecified Negative for exact input, positive for exact output (PancakeSwap convention).
    function swap(PoolKey memory key, bool zeroForOne, int256 amountSpecified) external returns (BalanceDelta delta) {
        ICLPoolManager.SwapParams memory sp = ICLPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: amountSpecified,
            sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1
        });
        ICLPoolManager.ModifyLiquidityParams memory none;
        delta = abi.decode(vault.lock(abi.encode(CallbackData(true, msg.sender, key, sp, none))), (BalanceDelta));
    }

    function modifyLiquidity(PoolKey memory key, int24 tickLower, int24 tickUpper, int256 liquidityDelta)
        external
        returns (BalanceDelta delta)
    {
        ICLPoolManager.SwapParams memory none;
        ICLPoolManager.ModifyLiquidityParams memory lp = ICLPoolManager.ModifyLiquidityParams({
            tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: liquidityDelta, salt: bytes32(0)
        });
        delta = abi.decode(vault.lock(abi.encode(CallbackData(false, msg.sender, key, none, lp))), (BalanceDelta));
    }

    function lockAcquired(bytes calldata raw) external returns (bytes memory) {
        require(msg.sender == address(vault), "only vault");
        CallbackData memory d = abi.decode(raw, (CallbackData));
        BalanceDelta delta;
        if (d.isSwap) {
            delta = poolManager.swap(d.key, d.swapParams, "");
        } else {
            (delta,) = poolManager.modifyLiquidity(d.key, d.liquidityParams, "");
        }
        _resolve(d.key.currency0, d.payer, delta.amount0());
        _resolve(d.key.currency1, d.payer, delta.amount1());
        return abi.encode(delta);
    }

    function _resolve(Currency currency, address user, int128 amount) internal {
        if (amount < 0) {
            vault.sync(currency);
            // casting to 'uint256' is safe because amount < 0
            // forge-lint: disable-next-line(unsafe-typecast)
            require(IERC20(Currency.unwrap(currency)).transferFrom(user, address(vault), uint256(uint128(-amount))));
            vault.settle();
        } else if (amount > 0) {
            // forge-lint: disable-next-line(unsafe-typecast)
            vault.take(currency, user, uint256(uint128(amount)));
        }
    }
}
