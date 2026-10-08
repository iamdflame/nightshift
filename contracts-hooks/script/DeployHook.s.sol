// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IHooks} from "infinity-core/src/interfaces/IHooks.sol";
import {ICLPoolManager} from "infinity-core/src/pool-cl/interfaces/ICLPoolManager.sol";
import {PoolKey} from "infinity-core/src/types/PoolKey.sol";
import {PoolId} from "infinity-core/src/types/PoolId.sol";
import {Currency} from "infinity-core/src/types/Currency.sol";
import {NightshiftHook} from "../src/NightshiftHook.sol";
import {NightshiftFeeMath} from "../src/libraries/NightshiftFeeMath.sol";
import {INightshiftOracle} from "../src/interfaces/INightshiftOracle.sol";

/// @notice Stand-in Fair Value Feed for dry runs before the Nightshift oracle is deployed: always-fresh report with a
///         fixed fair value and a symmetric band. Never use it for a real pool.
contract DryRunFairValueOracle is INightshiftOracle {
    address public immutable token;
    uint128 public immutable fairValue;
    uint128 public immutable halfBand;

    constructor(address token_, uint128 fairValue_, uint128 halfBand_) {
        token = token_;
        fairValue = fairValue_;
        halfBand = halfBand_;
    }

    function getReport(address t) external view returns (Report memory r) {
        if (t != token) return r;
        r = Report({
            fairValue: fairValue,
            lower: fairValue - halfBand,
            upper: fairValue + halfBand,
            anchorTime: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            round: 1,
            session: 0,
            flags: 0
        });
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }
}

/// @title DeployHook
/// @notice Deploys NightshiftHook on BSC, registers a stock/USDT dynamic-fee pool and initializes it at the oracle's
///         fair value. DRY-RUN ONLY: this repository holds no keys, and the script refuses to broadcast unless
///         NIGHTSHIFT_ALLOW_BROADCAST=true is set deliberately.
///
///   forge script script/DeployHook.s.sol --fork-url $BSC_RPC_URL -vv
///
/// Environment (all optional; defaults target BSC mainnet and NVDAB/USDT):
///   CL_POOL_MANAGER    PancakeSwap Infinity CLPoolManager    (0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b)
///   STOCK_TOKEN        tokenized stock                       (NVDAB 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436)
///   QUOTE_TOKEN        USD stablecoin, valued at 1 USD       (USDT 0x55d398326f99059fF775485246999027B3197955)
///   NIGHTSHIFT_ORACLE  Fair Value Feed v1; unset = deploy DryRunFairValueOracle at DRY_RUN_FAIR_VALUE_E8 (236e8)
///   INIT_PRICE_E8      initial pool price, USD per stock, 8 decimals (default: the oracle's fair value)
///   TICK_SPACING       pool tick spacing (10)
///   HOOK_OWNER         final owner; ownership is offered via Ownable2Step (default: the deployer)
///   FEE_MIN, FEE_MAX, INFORMED_SLOPE, UNCERTAINTY_COEF, MAX_AGE   fee parameters (defaults: hook.defaultFeeParams())
contract DeployHook is Script {
    address internal constant BSC_CL_POOL_MANAGER = 0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b;
    address internal constant BSC_NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address internal constant BSC_USDT = 0x55d398326f99059fF775485246999027B3197955;

    struct Deployment {
        NightshiftHook hook;
        INightshiftOracle oracle;
        PoolKey key;
        PoolId id;
        uint160 sqrtPriceX96;
    }

    function run() external returns (Deployment memory d) {
        bool broadcasting =
            vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        require(
            !broadcasting || vm.envOr("NIGHTSHIFT_ALLOW_BROADCAST", false),
            "DeployHook: dry-run only. Run with --fork-url and without --broadcast."
        );

        ICLPoolManager pm = ICLPoolManager(vm.envOr("CL_POOL_MANAGER", BSC_CL_POOL_MANAGER));
        address stock = vm.envOr("STOCK_TOKEN", BSC_NVDAB);
        address quote = vm.envOr("QUOTE_TOKEN", BSC_USDT);
        int24 tickSpacing = int24(vm.envOr("TICK_SPACING", int256(10)));
        address deployer = msg.sender;
        address finalOwner = vm.envOr("HOOK_OWNER", deployer);
        d.oracle = INightshiftOracle(vm.envOr("NIGHTSHIFT_ORACLE", address(0)));
        bool stockIsCurrency0 = stock < quote;

        vm.startBroadcast(deployer);
        if (address(d.oracle) == address(0)) {
            uint128 fv = uint128(vm.envOr("DRY_RUN_FAIR_VALUE_E8", uint256(236e8)));
            d.oracle = new DryRunFairValueOracle(stock, fv, fv / 33); // ~3% each side
            console2.log("WARNING: no NIGHTSHIFT_ORACLE given; deployed a DryRunFairValueOracle (dry runs only)");
        }
        d.hook = new NightshiftHook(pm, deployer);
        d.key = PoolKey({
            currency0: Currency.wrap(stockIsCurrency0 ? stock : quote),
            currency1: Currency.wrap(stockIsCurrency0 ? quote : stock),
            hooks: IHooks(address(d.hook)),
            poolManager: pm,
            fee: d.hook.DYNAMIC_FEE_FLAG(),
            parameters: d.hook.poolParameters(tickSpacing)
        });
        d.id = d.key.toId();
        d.hook.configurePool(d.key, stockIsCurrency0, d.oracle, _feeParams(d.hook));

        uint256 priceE8 = vm.envOr("INIT_PRICE_E8", uint256(0));
        if (priceE8 == 0) priceE8 = d.oracle.getReport(stock).fairValue;
        d.sqrtPriceX96 = NightshiftFeeMath.sqrtPriceX96FromPriceE8(
            priceE8, stockIsCurrency0, IERC20Metadata(stock).decimals(), IERC20Metadata(quote).decimals()
        );
        pm.initialize(d.key, d.sqrtPriceX96);
        if (finalOwner != deployer) d.hook.transferOwnership(finalOwner);
        vm.stopBroadcast();

        _log(d, pm, stock, quote, priceE8, finalOwner);
    }

    function _feeParams(NightshiftHook hook) internal view returns (NightshiftFeeMath.FeeParams memory p) {
        p = hook.defaultFeeParams();
        p.minFee = uint24(vm.envOr("FEE_MIN", uint256(p.minFee)));
        p.maxFee = uint24(vm.envOr("FEE_MAX", uint256(p.maxFee)));
        p.informedSlope = uint24(vm.envOr("INFORMED_SLOPE", uint256(p.informedSlope)));
        p.uncertaintyCoef = uint24(vm.envOr("UNCERTAINTY_COEF", uint256(p.uncertaintyCoef)));
        p.maxAge = uint32(vm.envOr("MAX_AGE", uint256(p.maxAge)));
    }

    function _log(
        Deployment memory d,
        ICLPoolManager pm,
        address stock,
        address quote,
        uint256 priceE8,
        address finalOwner
    ) internal view {
        (uint160 sqrtP, int24 tick, uint24 protocolFee,) = pm.getSlot0(d.id);
        console2.log("NightshiftHook        ", address(d.hook));
        console2.log("oracle                ", address(d.oracle));
        console2.log("CLPoolManager         ", address(pm));
        console2.log("stock / quote         ", stock, quote);
        console2.log("pool id");
        console2.logBytes32(PoolId.unwrap(d.id));
        console2.log("parameters (bitmap|tickSpacing)");
        console2.logBytes32(d.key.parameters);
        console2.log("init price (USD, 1e8) ", priceE8);
        console2.log("sqrtPriceX96 / tick   ", sqrtP, vm.toString(tick));
        console2.log("protocol fee (pips, both directions packed)", protocolFee);
        console2.log("owner (pending if different from deployer)", finalOwner);
        (uint24 buyFee,,,) = d.hook.quoteFee(d.key, Currency.unwrap(d.key.currency0) == quote);
        console2.log("LP fee for a buy right now (pips)", buyFee);
    }
}
