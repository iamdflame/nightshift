// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Test.sol";
import {Vault} from "infinity-core/src/Vault.sol";
import {CLPoolManager} from "infinity-core/src/pool-cl/CLPoolManager.sol";
import {ProtocolFeeController} from "infinity-core/src/ProtocolFeeController.sol";
import {IVault} from "infinity-core/src/interfaces/IVault.sol";
import {IHooks} from "infinity-core/src/interfaces/IHooks.sol";
import {IProtocolFeeController} from "infinity-core/src/interfaces/IProtocolFeeController.sol";
import {ICLPoolManager} from "infinity-core/src/pool-cl/interfaces/ICLPoolManager.sol";
import {ICLHooks} from "infinity-core/src/pool-cl/interfaces/ICLHooks.sol";
import {PoolKey} from "infinity-core/src/types/PoolKey.sol";
import {PoolId} from "infinity-core/src/types/PoolId.sol";
import {Currency} from "infinity-core/src/types/Currency.sol";
import {BalanceDelta} from "infinity-core/src/types/BalanceDelta.sol";
import {LPFeeLibrary} from "infinity-core/src/libraries/LPFeeLibrary.sol";
import {CustomRevert} from "infinity-core/src/libraries/CustomRevert.sol";
import {Hooks} from "infinity-core/src/libraries/Hooks.sol";
import {TickMath} from "infinity-core/src/pool-cl/libraries/TickMath.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {NightshiftHook} from "../src/NightshiftHook.sol";
import {NightshiftFeeMath} from "../src/libraries/NightshiftFeeMath.sol";
import {INightshiftOracle} from "../src/interfaces/INightshiftOracle.sol";
import {MockNightshiftOracle, WrongDecimalsOracle} from "./mocks/MockNightshiftOracle.sol";
import {TestToken} from "./mocks/TestToken.sol";
import {TestRouter} from "./utils/TestRouter.sol";
import {SwapFeeAssertions} from "./utils/SwapFeeAssertions.sol";

/// @title NightshiftHook against the real PancakeSwap Infinity core, compiled from source and deployed locally
///        (Vault + CLPoolManager + ProtocolFeeController with BSC's 3 bps default for dynamic-fee pools).
contract NightshiftHookTest is SwapFeeAssertions {
    uint256 internal constant NOW = 1_760_000_000;
    // Fixed addresses so both token orders are exercised: STOCK_LO < QUOTE < STOCK_HI.
    address internal constant STOCK_LO = 0x1111111111111111111111111111111111111111;
    address internal constant QUOTE = 0x5555555555555555555555555555555555555555;
    address internal constant STOCK_HI = 0x9999999999999999999999999999999999999999;
    int24 internal constant TICK_SPACING = 10;
    int256 internal constant LIQUIDITY = 1e23;

    Vault internal vault;
    CLPoolManager internal pm;
    NightshiftHook internal hook;
    MockNightshiftOracle internal oracle;
    TestRouter internal router;
    PoolKey internal keyLo; // stock = currency0 (like NVDAB/USDT on BSC)
    PoolKey internal keyHi; // stock = currency1
    bytes32 internal hookParams; // PoolKey.parameters: bitmap 0x41, tickSpacing 10

    address internal trader = makeAddr("trader");
    address internal lp = makeAddr("lp");

    function setUp() public {
        vm.warp(NOW);
        vault = new Vault();
        pm = new CLPoolManager(IVault(address(vault)));
        vault.registerApp(address(pm));
        ProtocolFeeController controller = new ProtocolFeeController(address(pm));
        pm.setProtocolFeeController(IProtocolFeeController(address(controller)));

        deployCodeTo("TestToken.sol:TestToken", abi.encode("Tether USD", "USDT", uint8(18)), QUOTE);
        deployCodeTo("TestToken.sol:TestToken", abi.encode("NVIDIA bStock", "NVDAB", uint8(18)), STOCK_LO);
        deployCodeTo("TestToken.sol:TestToken", abi.encode("Stock Hi", "STKH", uint8(18)), STOCK_HI);

        oracle = new MockNightshiftOracle();
        hook = new NightshiftHook(ICLPoolManager(address(pm)), address(this));
        router = new TestRouter(ICLPoolManager(address(pm)));
        hookParams = hook.poolParameters(TICK_SPACING);

        keyLo = _key(STOCK_LO, QUOTE);
        keyHi = _key(QUOTE, STOCK_HI);
        _postMonday(STOCK_LO);
        _postMonday(STOCK_HI);
        hook.configurePool(keyLo, true, oracle, hook.defaultFeeParams());
        hook.configurePool(keyHi, false, oracle, hook.defaultFeeParams());
        pm.initialize(keyLo, NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, true, 18, 18));
        pm.initialize(keyHi, NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, false, 18, 18));

        address[3] memory tokens = [STOCK_LO, QUOTE, STOCK_HI];
        for (uint256 i; i < 3; ++i) {
            TestToken(tokens[i]).mint(lp, 1e24);
            TestToken(tokens[i]).mint(trader, 1e24);
            vm.prank(lp);
            TestToken(tokens[i]).approve(address(router), type(uint256).max);
            vm.prank(trader);
            TestToken(tokens[i]).approve(address(router), type(uint256).max);
        }
        _addLiquidity(keyLo);
        _addLiquidity(keyHi);
    }

    // ------------------------------------------------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------------------------------------------------

    function _key(address c0, address c1) internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            hooks: IHooks(address(hook)),
            poolManager: pm,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            parameters: hookParams
        });
    }

    /// Sunday night before a Monday gap: FV $236, next-open band $229-$243, overnight session.
    function _postMonday(address stock) internal {
        oracle.post(stock, 236e8, 229e8, 243e8, 3, 0);
    }

    function _addLiquidity(PoolKey memory key) internal {
        (uint160 sqrtP,,,) = pm.getSlot0(key.toId());
        int24 tick = TickMath.getTickAtSqrtRatio(sqrtP);
        int24 base = tick - (((tick % TICK_SPACING) + TICK_SPACING) % TICK_SPACING);
        vm.prank(lp);
        router.modifyLiquidity(key, base - 2000, base + 2000, LIQUIDITY);
    }

    function _keys() internal view returns (PoolKey[2] memory ks) {
        ks[0] = keyLo;
        ks[1] = keyHi;
    }

    function _stockIsCurrency0(PoolKey memory key) internal pure returns (bool) {
        return Currency.unwrap(key.currency0) != QUOTE;
    }

    /// zeroForOne flag that buys (true) or sells (false) the stock in `key`.
    function _dir(PoolKey memory key, bool buying) internal pure returns (bool zeroForOne) {
        // stock = currency0: buying sends currency1 in (oneForZero). stock = currency1: buying is zeroForOne.
        return _stockIsCurrency0(key) ? !buying : buying;
    }

    /// Executes a swap and checks, from amounts, that it paid exactly the fee the hook quoted beforehand.
    function _swapAndCheck(PoolKey memory key, bool zeroForOne, bool exactIn, uint256 amount)
        internal
        returns (uint24 lpFee, NightshiftFeeMath.Regime regime, FeeCheck memory c)
    {
        (lpFee, regime,,) = hook.quoteFee(key, zeroForOne);
        PoolState memory pre = _poolState(pm, key);
        vm.recordLogs();
        vm.prank(trader);
        BalanceDelta d = router.swap(key, zeroForOne, exactIn ? -int256(amount) : int256(amount));
        uint24 eventFee = _swapEventFee(vm.getRecordedLogs(), address(pm));
        int128 inDelta = zeroForOne ? d.amount0() : d.amount1();
        assertLt(inDelta, 0, "input must be paid");
        // forge-lint: disable-next-line(unsafe-typecast)
        c = _assertRealizedFee(pm, key, zeroForOne, pre, uint256(uint128(-inDelta)), lpFee);
        c.eventSwapFee = eventFee;
        assertEq(eventFee, c.expectedSwapFee, "Swap event fee != hook fee + protocol fee");
    }

    function _wrapped(bytes4 callbackSelector, bytes memory reason) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            CustomRevert.WrappedError.selector,
            address(hook),
            callbackSelector,
            reason,
            abi.encodePacked(Hooks.HookCallFailed.selector)
        );
    }

    function _freshKey(address c0, address c1, uint24 fee, bytes32 parameters) internal view returns (PoolKey memory k) {
        k = _key(c0, c1);
        k.fee = fee;
        k.parameters = parameters;
    }

    // ------------------------------------------------------------------------------------------------------------
    // wiring
    // ------------------------------------------------------------------------------------------------------------

    function test_constants_matchPancakeSwap() public view {
        assertEq(hook.DYNAMIC_FEE_FLAG(), LPFeeLibrary.DYNAMIC_FEE_FLAG);
        assertEq(hook.OVERRIDE_FEE_FLAG(), LPFeeLibrary.OVERRIDE_FEE_FLAG);
        assertEq(hook.getHooksRegistrationBitmap(), 0x41); // beforeInitialize (bit 0) | beforeSwap (bit 6)
        assertEq(hook.poolParameters(10), bytes32(uint256(0x0a0041))); // tickSpacing 10 in bits 16-39
        assertEq(hook.MAX_FEE_CAP(), 500_000);
        assertLt(hook.MAX_FEE_CAP(), LPFeeLibrary.ONE_HUNDRED_PERCENT_FEE);
    }

    function test_setUp_poolsLive() public view {
        (uint160 sqrtP0,, uint24 protocolFee0, uint24 lpFee0) = pm.getSlot0(keyLo.toId());
        (uint160 sqrtP1,, uint24 protocolFee1,) = pm.getSlot0(keyHi.toId());
        assertGt(sqrtP0, 0);
        assertGt(sqrtP1, 0);
        // BSC's controller gives dynamic-fee pools a 3 bps protocol fee in both directions.
        assertEq(protocolFee0, 300 | (300 << 12));
        assertEq(protocolFee1, 300 | (300 << 12));
        assertEq(lpFee0, 0); // the stored dynamic LP fee is never used: every swap overrides it
        assertEq(pm.getLiquidity(keyLo.toId()), uint128(uint256(LIQUIDITY)));
    }

    // ------------------------------------------------------------------------------------------------------------
    // swaps: fee charged by the real CLPoolManager equals the hook's schedule
    // ------------------------------------------------------------------------------------------------------------

    function test_mondayGap_informedBuy_bothTokenOrders() public {
        PoolKey[2] memory keys = _keys();
        for (uint256 i; i < 2; ++i) {
            (uint24 fee, NightshiftFeeMath.Regime regime, FeeCheck memory c) =
                _swapAndCheck(keys[i], _dir(keys[i], true), true, 5000e18);
            assertEq(fee, 16_177, "informed fee");
            assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Informed));
            // total = 300 + 16_177 - 300 * 16_177 / 1e6
            assertEq(c.expectedSwapFee, 16_473);
            // LPs keep everything but the 3 bps protocol cut
            assertApproxEqRel(c.lpFee, (c.amountIn * (16_473 - 300)) / 1e6, 1e15);
        }
    }

    function test_mondayGap_uninformedSell_bothTokenOrders() public {
        PoolKey[2] memory keys = _keys();
        for (uint256 i; i < 2; ++i) {
            (uint24 fee, NightshiftFeeMath.Regime regime, FeeCheck memory c) =
                _swapAndCheck(keys[i], _dir(keys[i], false), true, 20e18);
            assertEq(fee, 3466, "uninformed fee");
            assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Uninformed));
            assertEq(c.expectedSwapFee, 3765);
        }
    }

    function test_exactOutput_paysTheSameSchedule() public {
        PoolKey[2] memory keys = _keys();
        for (uint256 i; i < 2; ++i) {
            (uint24 buyFee,,) = _swapAndCheck(keys[i], _dir(keys[i], true), false, 10e18); // receive 10 stock
            assertEq(buyFee, 16_177, "exact-out informed");
            (uint24 sellFee,,) = _swapAndCheck(keys[i], _dir(keys[i], false), false, 1000e18); // receive 1000 USDT
            assertEq(sellFee, 3466, "exact-out uninformed");
        }
    }

    function test_poolAboveFairValue_sellsAreInformed() public {
        PoolKey[2] memory keys = _keys();
        for (uint256 i; i < 2; ++i) {
            address stock = Currency.unwrap(_stockIsCurrency0(keys[i]) ? keys[i].currency0 : keys[i].currency1);
            oracle.post(stock, 225e8, 220e8, 231e8, 4, 0); // FV $225 while the pool sits at $230
            // base = 500 + 50_000 * 11 / 225 = 2_944 ; sell = base + 500_000 * 5 / 225 = base + 11_111
            (uint24 sellFee, NightshiftFeeMath.Regime r1,) = _swapAndCheck(keys[i], _dir(keys[i], false), true, 20e18);
            assertEq(sellFee, 14_055);
            assertEq(uint8(r1), uint8(NightshiftFeeMath.Regime.Informed));
            (uint24 buyFee, NightshiftFeeMath.Regime r2,) = _swapAndCheck(keys[i], _dir(keys[i], true), true, 1000e18);
            assertEq(buyFee, 2944);
            assertEq(uint8(r2), uint8(NightshiftFeeMath.Regime.Uninformed));
        }
    }

    function test_regularSession_minFeeForUninformed() public {
        oracle.post(STOCK_LO, 230e8 + 5e7, 228e8, 233e8, 0, 0); // FV $230.50, regular session
        (uint24 sellFee, NightshiftFeeMath.Regime regime,) = _swapAndCheck(keyLo, _dir(keyLo, false), true, 20e18);
        assertEq(sellFee, 500);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Uninformed));
    }

    function test_staleReport_chargesMaxFee() public {
        vm.warp(NOW + 901);
        PoolKey[2] memory keys = _keys();
        for (uint256 i; i < 2; ++i) {
            for (uint256 b; b < 2; ++b) {
                (uint24 fee, NightshiftFeeMath.Regime regime,) =
                    _swapAndCheck(keys[i], _dir(keys[i], b == 0), true, b == 0 ? 1000e18 : 5e18);
                assertEq(fee, 100_000);
                assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Stale));
            }
        }
    }

    function test_corporateActionAndDegraded_chargeMaxFee() public {
        uint8[2] memory flags = [uint8(1), 8];
        for (uint256 f; f < 2; ++f) {
            oracle.post(STOCK_LO, 236e8, 229e8, 243e8, 0, flags[f]);
            (uint24 fee, NightshiftFeeMath.Regime regime,) = _swapAndCheck(keyLo, _dir(keyLo, true), true, 1000e18);
            assertEq(fee, 100_000);
            assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.Flagged));
        }
    }

    function test_oracleFailureModes_neverRevertSwaps() public {
        MockNightshiftOracle.Mode[4] memory modes = [
            MockNightshiftOracle.Mode.Revert,
            MockNightshiftOracle.Mode.ShortData,
            MockNightshiftOracle.Mode.DirtyData,
            MockNightshiftOracle.Mode.BurnGas
        ];
        for (uint256 m; m < modes.length; ++m) {
            oracle.setMode(modes[m]);
            (uint24 fee, NightshiftFeeMath.Regime regime,) = _swapAndCheck(keyLo, _dir(keyLo, true), true, 1000e18);
            assertEq(fee, 100_000);
            assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.OracleFailure));
        }
        // An oracle account without code (self-destructed / wrong address) is also survivable.
        vm.etch(address(oracle), "");
        (uint24 f2, NightshiftFeeMath.Regime r2,) = _swapAndCheck(keyHi, _dir(keyHi, false), true, 5e18);
        assertEq(f2, 100_000);
        assertEq(uint8(r2), uint8(NightshiftFeeMath.Regime.OracleFailure));
    }

    function test_burnGasOracle_boundedCost() public {
        oracle.setMode(MockNightshiftOracle.Mode.BurnGas);
        vm.prank(trader);
        uint256 g = gasleft();
        router.swap(keyLo, _dir(keyLo, true), -1000e18);
        // the oracle can burn at most ORACLE_GAS_LIMIT: the swap stays a normal-sized transaction
        assertLt(g - gasleft(), 400_000);
    }

    function test_feeParamsUpdate_appliesToNextSwap() public {
        NightshiftFeeMath.FeeParams memory p = hook.defaultFeeParams();
        p.informedSlope = 1_000_000; // LPs keep the whole gap
        hook.setFeeParams(keyLo.toId(), p);
        (uint24 fee,,) = _swapAndCheck(keyLo, _dir(keyLo, true), true, 1000e18);
        assertEq(fee, 3466 + 25_423); // 1_000_000 * 6e8 / 236e8 (pool at 229.99999999)
    }

    /// Property: whatever the oracle says, the CLPoolManager charges exactly the fee quoteFee announced.
    function testFuzz_chargedFeeEqualsQuote(
        int256 fvBps,
        uint256 bandBps,
        uint8 session,
        uint8 flags,
        uint256 age,
        bool hi,
        bool buying,
        bool exactIn,
        uint256 amountSeed
    ) public {
        PoolKey memory key = hi ? keyHi : keyLo;
        address stock = hi ? STOCK_HI : STOCK_LO;
        uint256 fv = (230e8 * uint256(int256(10_000) + bound(fvBps, -2000, 2000))) / 10_000;
        uint256 half = (fv * bound(bandBps, 0, 3000)) / 20_000;
        INightshiftOracle.Report memory r = INightshiftOracle.Report({
            fairValue: uint128(fv),
            lower: uint128(fv - half),
            upper: uint128(fv + half),
            anchorTime: uint64(NOW + 1 hours),
            updatedAt: uint64(NOW - bound(age, 0, 1800)),
            round: 7,
            session: uint8(bound(session, 0, 5)),
            flags: flags
        });
        oracle.setReport(stock, r);
        // amounts small enough to stay inside the liquidity range in every direction
        uint256 amount = buying
            ? (exactIn ? bound(amountSeed, 1e18, 20_000e18) : bound(amountSeed, 1e16, 80e18))
            : (exactIn ? bound(amountSeed, 1e16, 80e18) : bound(amountSeed, 1e18, 20_000e18));
        (uint24 fee, NightshiftFeeMath.Regime regime,) = _swapAndCheck(key, _dir(key, buying), exactIn, amount);
        assertLe(fee, 100_000);
        if (uint8(regime) >= uint8(NightshiftFeeMath.Regime.Stale)) assertEq(fee, 100_000);
    }

    // ------------------------------------------------------------------------------------------------------------
    // initialization guards
    // ------------------------------------------------------------------------------------------------------------

    function test_initialize_rejectsStaticFeePool() public {
        PoolKey memory k = _freshKey(STOCK_LO, STOCK_HI, 3000, hook.poolParameters(TICK_SPACING));
        vm.expectRevert(
            _wrapped(
                ICLHooks.beforeInitialize.selector,
                abi.encodeWithSelector(NightshiftHook.NotDynamicFeePool.selector, uint24(3000))
            )
        );
        pm.initialize(k, NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, true, 18, 18));
    }

    function test_initialize_rejectsUnconfiguredPool() public {
        PoolKey memory k = _freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, hook.poolParameters(60));
        vm.expectRevert(
            _wrapped(
                ICLHooks.beforeInitialize.selector,
                abi.encodeWithSelector(NightshiftHook.PoolNotConfigured.selector, k.toId())
            )
        );
        pm.initialize(k, NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, true, 18, 18));
    }

    function test_initialize_rejectsPriceOutsideBand() public {
        PoolKey memory k = _freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, hook.poolParameters(60));
        hook.configurePool(k, true, oracle, hook.defaultFeeParams());
        uint160 sqrtP = NightshiftFeeMath.sqrtPriceX96FromPriceE8(250e8, true, 18, 18);
        uint256 priceE8 = NightshiftFeeMath.poolPriceE8(sqrtP, true, 18, 18);
        vm.expectRevert(
            _wrapped(
                ICLHooks.beforeInitialize.selector,
                abi.encodeWithSelector(
                    NightshiftHook.InitialPriceOutsideBand.selector, priceE8, uint128(229e8), uint128(243e8)
                )
            )
        );
        pm.initialize(k, sqrtP);
    }

    function test_initialize_rejectsUnusableOracle() public {
        PoolKey memory k = _freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, hook.poolParameters(60));
        hook.configurePool(k, true, oracle, hook.defaultFeeParams());
        uint160 sqrtP = NightshiftFeeMath.sqrtPriceX96FromPriceE8(236e8, true, 18, 18);

        oracle.post(STOCK_LO, 236e8, 229e8, 243e8, 0, 1); // corporate action
        vm.expectRevert(
            _wrapped(
                ICLHooks.beforeInitialize.selector,
                abi.encodeWithSelector(NightshiftHook.OracleUnusable.selector, NightshiftFeeMath.Regime.Flagged)
            )
        );
        pm.initialize(k, sqrtP);

        oracle.setMode(MockNightshiftOracle.Mode.Revert);
        vm.expectRevert(
            _wrapped(
                ICLHooks.beforeInitialize.selector,
                abi.encodeWithSelector(NightshiftHook.OracleUnusable.selector, NightshiftFeeMath.Regime.OracleFailure)
            )
        );
        pm.initialize(k, sqrtP);

        oracle.setMode(MockNightshiftOracle.Mode.Normal);
        oracle.post(STOCK_LO, 236e8, 229e8, 243e8, 0, 0);
        vm.warp(block.timestamp + 901);
        vm.expectRevert(
            _wrapped(
                ICLHooks.beforeInitialize.selector,
                abi.encodeWithSelector(NightshiftHook.OracleUnusable.selector, NightshiftFeeMath.Regime.Stale)
            )
        );
        pm.initialize(k, sqrtP);
    }

    function test_callbacks_onlyPoolManager() public {
        ICLPoolManager.SwapParams memory sp;
        vm.expectRevert(NightshiftHook.NotPoolManager.selector);
        hook.beforeSwap(address(this), keyLo, sp, "");
        vm.expectRevert(NightshiftHook.NotPoolManager.selector);
        hook.beforeInitialize(address(this), keyLo, 1 << 96);
    }

    function test_unregisteredCallbacks_revert() public {
        ICLPoolManager.ModifyLiquidityParams memory mp;
        ICLPoolManager.SwapParams memory sp;
        BalanceDelta zero;
        vm.expectRevert(NightshiftHook.HookNotImplemented.selector);
        hook.afterInitialize(address(0), keyLo, 0, 0);
        vm.expectRevert(NightshiftHook.HookNotImplemented.selector);
        hook.beforeAddLiquidity(address(0), keyLo, mp, "");
        vm.expectRevert(NightshiftHook.HookNotImplemented.selector);
        hook.afterAddLiquidity(address(0), keyLo, mp, zero, zero, "");
        vm.expectRevert(NightshiftHook.HookNotImplemented.selector);
        hook.beforeRemoveLiquidity(address(0), keyLo, mp, "");
        vm.expectRevert(NightshiftHook.HookNotImplemented.selector);
        hook.afterRemoveLiquidity(address(0), keyLo, mp, zero, zero, "");
        vm.expectRevert(NightshiftHook.HookNotImplemented.selector);
        hook.afterSwap(address(0), keyLo, sp, zero, "");
        vm.expectRevert(NightshiftHook.HookNotImplemented.selector);
        hook.beforeDonate(address(0), keyLo, 0, 0, "");
        vm.expectRevert(NightshiftHook.HookNotImplemented.selector);
        hook.afterDonate(address(0), keyLo, 0, 0, "");
    }

    function test_liquidityAddAndRemove_unaffectedByHook() public {
        (uint160 sqrtP,,,) = pm.getSlot0(keyLo.toId());
        int24 tick = TickMath.getTickAtSqrtRatio(sqrtP);
        int24 base = tick - (((tick % TICK_SPACING) + TICK_SPACING) % TICK_SPACING);
        vm.startPrank(lp);
        router.modifyLiquidity(keyLo, base - 100, base + 100, 1e20);
        router.modifyLiquidity(keyLo, base - 100, base + 100, -1e20);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------------------------------------------------
    // admin
    // ------------------------------------------------------------------------------------------------------------

    function test_configurePool_storesAndEmits() public {
        PoolKey memory k = _freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, hook.poolParameters(1));
        NightshiftFeeMath.FeeParams memory p = hook.defaultFeeParams();
        vm.expectEmit(true, true, true, true, address(hook));
        emit NightshiftHook.PoolConfigured(k.toId(), STOCK_LO, QUOTE, oracle, true, 18, 18);
        vm.expectEmit(true, false, false, true, address(hook));
        emit NightshiftHook.FeeParamsUpdated(k.toId(), p);
        hook.configurePool(k, true, oracle, p);

        NightshiftHook.PoolConfig memory cfg = hook.getPoolConfig(k.toId());
        assertEq(address(cfg.oracle), address(oracle));
        assertTrue(cfg.stockIsCurrency0);
        assertEq(cfg.stockDecimals, 18);
        assertEq(cfg.quoteDecimals, 18);
        assertEq(cfg.params.maxFee, p.maxFee);
    }

    function test_configurePool_validation() public {
        NightshiftFeeMath.FeeParams memory p = hook.defaultFeeParams();
        bytes32 params = hook.poolParameters(1);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, trader));
        hook.configurePool(_freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, params), true, oracle, p);

        PoolKey memory k = _freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, params);
        k.hooks = IHooks(address(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.WrongHook.selector, address(0xBEEF)));
        hook.configurePool(k, true, oracle, p);

        k = _freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, params);
        k.poolManager = ICLPoolManager(address(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.WrongPoolManager.selector, address(0xBEEF)));
        hook.configurePool(k, true, oracle, p);

        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.NotDynamicFeePool.selector, uint24(500)));
        hook.configurePool(_freshKey(STOCK_LO, QUOTE, 500, params), true, oracle, p);

        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.WrongHooksBitmap.selector, uint16(0x40)));
        hook.configurePool(_freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, bytes32(uint256(0x10040))), true, oracle, p);

        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.PoolAlreadyConfigured.selector, keyLo.toId()));
        hook.configurePool(keyLo, true, oracle, p);

        vm.expectRevert(NightshiftHook.NativeCurrencyUnsupported.selector);
        hook.configurePool(_freshKey(address(0), QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, params), false, oracle, p);

        TestToken fat = new TestToken("Fat", "FAT", 24);
        (address a, address b) = address(fat) < QUOTE ? (address(fat), QUOTE) : (QUOTE, address(fat));
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.UnsupportedDecimals.selector, address(fat), uint8(24)));
        hook.configurePool(_freshKey(a, b, LPFeeLibrary.DYNAMIC_FEE_FLAG, params), a == address(fat), oracle, p);

        k = _freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, params);
        vm.expectRevert(NightshiftHook.ZeroOracle.selector);
        hook.configurePool(k, true, INightshiftOracle(address(0)), p);

        WrongDecimalsOracle wrong = new WrongDecimalsOracle();
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.OracleDecimalsMismatch.selector, uint8(18)));
        hook.configurePool(k, true, INightshiftOracle(address(wrong)), p);
    }

    function test_feeParams_hardCaps() public {
        PoolId id = keyLo.toId();
        NightshiftFeeMath.FeeParams memory p = hook.defaultFeeParams();

        p.maxFee = 500_001;
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.MaxFeeAboveCap.selector, uint24(500_001)));
        hook.setFeeParams(id, p);

        p = hook.defaultFeeParams();
        p.minFee = p.maxFee + 1;
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.MinFeeAboveMaxFee.selector, p.minFee, p.maxFee));
        hook.setFeeParams(id, p);

        p = hook.defaultFeeParams();
        p.informedSlope = 1_000_001;
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.SlopeAboveCap.selector, uint24(1_000_001)));
        hook.setFeeParams(id, p);

        p = hook.defaultFeeParams();
        p.uncertaintyCoef = 1_000_001;
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.UncertaintyCoefAboveCap.selector, uint24(1_000_001)));
        hook.setFeeParams(id, p);

        p = hook.defaultFeeParams();
        p.maxAge = 59;
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.MaxAgeOutOfBounds.selector, uint32(59)));
        hook.setFeeParams(id, p);
        p.maxAge = 1 days + 1;
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.MaxAgeOutOfBounds.selector, uint32(1 days + 1)));
        hook.setFeeParams(id, p);

        // the caps themselves are accepted
        p = NightshiftFeeMath.FeeParams({
            minFee: 500_000, maxFee: 500_000, informedSlope: 1_000_000, uncertaintyCoef: 1_000_000, maxAge: 1 days
        });
        hook.setFeeParams(id, p);
        assertEq(hook.getPoolConfig(id).params.minFee, 500_000);
    }

    function test_setFeeParams_and_setOracle() public {
        PoolId id = keyLo.toId();
        NightshiftFeeMath.FeeParams memory p = hook.defaultFeeParams();
        p.minFee = 1000;
        vm.expectEmit(true, false, false, true, address(hook));
        emit NightshiftHook.FeeParamsUpdated(id, p);
        hook.setFeeParams(id, p);
        assertEq(hook.getPoolConfig(id).params.minFee, 1000);

        MockNightshiftOracle next = new MockNightshiftOracle();
        vm.expectEmit(true, true, true, true, address(hook));
        emit NightshiftHook.OracleUpdated(id, oracle, next);
        hook.setOracle(id, next);
        assertEq(address(hook.getPoolConfig(id).oracle), address(next));
        // the new oracle has no report for the stock yet: invalid report -> maxFee, swap still works
        (uint24 fee, NightshiftFeeMath.Regime regime,) = _swapAndCheck(keyLo, _dir(keyLo, true), true, 100e18);
        assertEq(fee, 100_000);
        assertEq(uint8(regime), uint8(NightshiftFeeMath.Regime.InvalidReport));

        PoolId unknown = PoolId.wrap(bytes32(uint256(1)));
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.PoolNotConfigured.selector, unknown));
        hook.setFeeParams(unknown, p);
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.PoolNotConfigured.selector, unknown));
        hook.setOracle(unknown, next);
        vm.expectRevert(NightshiftHook.ZeroOracle.selector);
        hook.setOracle(id, INightshiftOracle(address(0)));

        vm.startPrank(trader);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, trader));
        hook.setFeeParams(id, p);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, trader));
        hook.setOracle(id, next);
        vm.stopPrank();
    }

    function test_ownership_twoStep() public {
        hook.transferOwnership(trader);
        assertEq(hook.owner(), address(this));
        vm.prank(trader);
        hook.acceptOwnership();
        assertEq(hook.owner(), trader);
    }

    function test_quoteFee_unknownPoolReverts() public {
        PoolKey memory k = _freshKey(STOCK_LO, QUOTE, LPFeeLibrary.DYNAMIC_FEE_FLAG, hook.poolParameters(7));
        vm.expectRevert(abi.encodeWithSelector(NightshiftHook.PoolNotConfigured.selector, k.toId()));
        hook.quoteFee(k, true);
    }

    // ------------------------------------------------------------------------------------------------------------
    // gas
    // ------------------------------------------------------------------------------------------------------------

    /// beforeSwap as the PoolManager calls it, measured on the callee frame (vm.lastCallGas) with the hook, the oracle
    /// and the PoolManager all cold: an upper bound for a lone swap (inside a real swap the PoolManager account and
    /// slot0 are already warm, which saves ~4.6k; the trace of test_mondayGap_* shows ~22.7k).
    function test_gas_beforeSwap() public {
        ICLPoolManager.SwapParams memory sp =
            ICLPoolManager.SwapParams({zeroForOne: false, amountSpecified: -1e18, sqrtPriceLimitX96: 0});
        vm.cool(address(hook));
        vm.cool(address(oracle));
        vm.cool(address(pm));
        vm.prank(address(pm));
        (,, uint24 fee) = hook.beforeSwap(trader, keyLo, sp, "");
        uint256 cold = vm.lastCallGas().gasTotalUsed;
        assertEq(fee, 16_177 | LPFeeLibrary.OVERRIDE_FEE_FLAG);
        emit log_named_uint("beforeSwap gas, all cold", cold);
        assertLt(cold, 30_000);
    }
}
