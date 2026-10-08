// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IHooks} from "infinity-core/src/interfaces/IHooks.sol";
import {ICLPoolManager} from "infinity-core/src/pool-cl/interfaces/ICLPoolManager.sol";
import {PoolKey} from "infinity-core/src/types/PoolKey.sol";
import {Currency} from "infinity-core/src/types/Currency.sol";
import {LPFeeLibrary} from "infinity-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "infinity-core/src/pool-cl/libraries/TickMath.sol";
import {Actions} from "infinity-periphery/src/libraries/Actions.sol";
import {ICLRouterBase} from "infinity-periphery/src/pool-cl/interfaces/ICLRouterBase.sol";
import {IQuoter} from "infinity-periphery/src/interfaces/IQuoter.sol";
import {ICLQuoter} from "infinity-periphery/src/pool-cl/interfaces/ICLQuoter.sol";
import {IPositionManager} from "infinity-periphery/src/interfaces/IPositionManager.sol";

import {NightshiftHook} from "../../src/NightshiftHook.sol";
import {NightshiftFeeMath} from "../../src/libraries/NightshiftFeeMath.sol";
import {MockNightshiftOracle} from "../mocks/MockNightshiftOracle.sol";
import {TestToken} from "../mocks/TestToken.sol";
import {SwapFeeAssertions} from "../utils/SwapFeeAssertions.sol";

/// @dev infinity-universal-router src/interfaces/IUniversalRouter.sol (deployed BSC router).
interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IProtocolFeeControllerView {
    function defaultProtocolFeeForDynamicFeePool() external view returns (uint24);
}

/// @title NightshiftHook on a BSC mainnet fork, against the deployed PancakeSwap Infinity contracts.
/// @notice Pools are created on the live CLPoolManager (protocol fee from the live controller), liquidity is minted
///         through the live CLPositionManager (Permit2), swaps go through the live Universal Router and are
///         pre-quoted by the live CLQuoter. Every swap's fee is recovered from token amounts and compared with the
///         hook's schedule. Run: BSC_RPC_URL=<rpc> forge test --match-path 'test/fork/*' (defaults to the public
///         BNB Chain RPC; set BSC_FORK_BLOCK to pin a block on an archive node).
contract NightshiftHookForkTest is SwapFeeAssertions {
    // Addresses (BSC mainnet, chain id 56). Sources: developer.pancakeswap.finance "Infinity addresses";
    // infinity-core script/config/bsc-mainnet.json; infinity-periphery script/config/bsc-mainnet.json;
    // infinity-universal-router deploy-addresses/bsc-mainnet.json. Each verified on-chain (vault(), permit2(), ...).
    address internal constant VAULT = 0x238a358808379702088667322f80aC48bAd5e6c4;
    address internal constant CL_POOL_MANAGER = 0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b;
    address internal constant CL_POSITION_MANAGER = 0x55f4c8abA71A1e923edC303eb4fEfF14608cC226;
    address internal constant UNIVERSAL_ROUTER = 0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB;
    address internal constant CL_QUOTER = 0xd0737C9762912dD34c3271197E362Aa736Df0926;
    address internal constant PERMIT2 = 0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768;
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955; // BEP-20 USDT, 18 decimals
    address internal constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436; // NVIDIA bStock, 18 decimals
    /// Stand-in stock deployed above USDT so the stock sorts as currency1 (NVDAB sorts as currency0).
    address internal constant STOCK_HI = 0xfFFfFfFffFFfFFFffFFffffFfFFfFfFfffff0001;

    uint256 internal constant INFI_SWAP = 0x10; // infinity-universal-router src/libraries/Commands.sol
    int24 internal constant TICK_SPACING = 10;
    uint128 internal constant LIQUIDITY = 1e23;

    ICLPoolManager internal pm = ICLPoolManager(CL_POOL_MANAGER);
    NightshiftHook internal hook;
    MockNightshiftOracle internal oracle;
    PoolKey internal keyNvda; // NVDAB/USDT: stock = currency0
    PoolKey internal keyHi; // USDT/STOCK_HI: stock = currency1

    address internal lp = makeAddr("lp");
    address internal trader = makeAddr("trader");

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string("https://bsc-dataseed.bnbchain.org"));
        uint256 forkBlock = vm.envOr("BSC_FORK_BLOCK", uint256(0));
        if (forkBlock == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, forkBlock);
        assertEq(block.chainid, 56);

        oracle = new MockNightshiftOracle();
        hook = new NightshiftHook(pm, address(this));
        deployCodeTo("TestToken.sol:TestToken", abi.encode("Stock Hi", "STKH", uint8(18)), STOCK_HI);

        keyNvda = _key(NVDAB, USDT);
        keyHi = _key(USDT, STOCK_HI);
        oracle.post(NVDAB, 236e8, 229e8, 243e8, 3, 0);
        oracle.post(STOCK_HI, 236e8, 229e8, 243e8, 3, 0);
        hook.configurePool(keyNvda, true, oracle, hook.defaultFeeParams());
        hook.configurePool(keyHi, false, oracle, hook.defaultFeeParams());
        pm.initialize(keyNvda, NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, true, 18, 18));
        pm.initialize(keyHi, NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, false, 18, 18));

        address[3] memory tokens = [NVDAB, USDT, STOCK_HI];
        for (uint256 i; i < 3; ++i) {
            deal(tokens[i], lp, 1_000_000e18);
            deal(tokens[i], trader, 1_000_000e18);
            _approveViaPermit2(lp, tokens[i], CL_POSITION_MANAGER);
            _approveViaPermit2(trader, tokens[i], UNIVERSAL_ROUTER);
        }
        _mintPosition(keyNvda);
        _mintPosition(keyHi);
    }

    // ------------------------------------------------------------------------------------------------------------
    // helpers: live periphery
    // ------------------------------------------------------------------------------------------------------------

    function _key(address c0, address c1) internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            hooks: IHooks(address(hook)),
            poolManager: pm,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            parameters: hook.poolParameters(TICK_SPACING)
        });
    }

    function _approveViaPermit2(address owner, address token, address spender) internal {
        vm.startPrank(owner);
        IERC20(token).approve(PERMIT2, type(uint256).max);
        IAllowanceTransfer(PERMIT2).approve(token, spender, type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    /// Mints a +-23% range position (2100 ticks each side) around the current price through the live
    /// CLPositionManager.
    function _mintPosition(PoolKey memory key) internal {
        _mintPosition(key, TICK_SPACING);
    }

    function _mintPosition(PoolKey memory key, int24 spacing) internal {
        (uint160 sqrtP,,,) = pm.getSlot0(key.toId());
        int24 tick = TickMath.getTickAtSqrtRatio(sqrtP);
        int24 base = tick - (((tick % spacing) + spacing) % spacing);
        bytes memory actions = abi.encodePacked(uint8(Actions.CL_MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key, base - 2100, base + 2100, uint256(LIQUIDITY), type(uint128).max, type(uint128).max, lp, bytes("")
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        vm.prank(lp);
        IPositionManager(CL_POSITION_MANAGER).modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    function _io(PoolKey memory key, bool zeroForOne) internal pure returns (address tin, address tout) {
        (tin, tout) = zeroForOne
            ? (Currency.unwrap(key.currency0), Currency.unwrap(key.currency1))
            : (Currency.unwrap(key.currency1), Currency.unwrap(key.currency0));
    }

    /// Swaps through the live Universal Router (INFI_SWAP: CL single swap + SETTLE_ALL + TAKE_ALL).
    function _routerSwap(PoolKey memory key, bool zeroForOne, bool exactIn, uint128 amount)
        internal
        returns (uint256 amountIn, uint256 amountOut)
    {
        (address tin, address tout) = _io(key, zeroForOne);
        bytes[] memory params = new bytes[](3);
        bytes memory actions;
        if (exactIn) {
            actions = abi.encodePacked(
                uint8(Actions.CL_SWAP_EXACT_IN_SINGLE), uint8(Actions.SETTLE_ALL), uint8(Actions.TAKE_ALL)
            );
            params[0] = abi.encode(
                ICLRouterBase.CLSwapExactInputSingleParams({
                    poolKey: key, zeroForOne: zeroForOne, amountIn: amount, amountOutMinimum: 0, hookData: ""
                })
            );
            params[1] = abi.encode(Currency.wrap(tin), uint256(amount));
            params[2] = abi.encode(Currency.wrap(tout), uint256(0));
        } else {
            actions = abi.encodePacked(
                uint8(Actions.CL_SWAP_EXACT_OUT_SINGLE), uint8(Actions.SETTLE_ALL), uint8(Actions.TAKE_ALL)
            );
            params[0] = abi.encode(
                ICLRouterBase.CLSwapExactOutputSingleParams({
                    poolKey: key,
                    zeroForOne: zeroForOne,
                    amountOut: amount,
                    amountInMaximum: type(uint128).max,
                    hookData: ""
                })
            );
            params[1] = abi.encode(Currency.wrap(tin), type(uint256).max);
            params[2] = abi.encode(Currency.wrap(tout), uint256(amount));
        }
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        uint256 inBefore = IERC20(tin).balanceOf(trader);
        uint256 outBefore = IERC20(tout).balanceOf(trader);
        vm.prank(trader);
        IUniversalRouter(UNIVERSAL_ROUTER).execute(abi.encodePacked(uint8(INFI_SWAP)), inputs, block.timestamp);
        amountIn = inBefore - IERC20(tin).balanceOf(trader);
        amountOut = IERC20(tout).balanceOf(trader) - outBefore;
    }

    /// Quote with the live CLQuoter, swap with the live router, then prove from amounts that the swap paid exactly
    /// the hook's LP fee (plus the live protocol fee) and that the quoter saw the same fee.
    function _quoteSwapCheck(PoolKey memory key, bool zeroForOne, bool exactIn, uint128 amount)
        internal
        returns (uint24 lpFee, NightshiftFeeMath.Regime regime, FeeCheck memory c)
    {
        (lpFee, regime,,) = hook.quoteFee(key, zeroForOne);
        IQuoter.QuoteExactSingleParams memory q =
            IQuoter.QuoteExactSingleParams({poolKey: key, zeroForOne: zeroForOne, exactAmount: amount, hookData: ""});
        (uint256 quoted,) = exactIn
            ? ICLQuoter(CL_QUOTER).quoteExactInputSingle(q)
            : ICLQuoter(CL_QUOTER).quoteExactOutputSingle(q);

        PoolState memory pre = _poolState(pm, key);
        vm.recordLogs();
        (uint256 amountIn, uint256 amountOut) = _routerSwap(key, zeroForOne, exactIn, amount);
        uint24 eventFee = _swapEventFee(vm.getRecordedLogs(), CL_POOL_MANAGER);

        assertEq(exactIn ? amountOut : amountIn, quoted, "live quoter disagrees with the executed swap");
        assertEq(exactIn ? amountIn : amountOut, amount, "router amount");
        c = _assertRealizedFee(pm, key, zeroForOne, pre, amountIn, lpFee);
        c.eventSwapFee = eventFee;
        assertEq(eventFee, c.expectedSwapFee, "Swap event fee");
    }

    function _dir(PoolKey memory key, bool buying) internal pure returns (bool) {
        bool stockIsCurrency0 = Currency.unwrap(key.currency0) != USDT;
        return stockIsCurrency0 ? !buying : buying;
    }

    function _stockOf(PoolKey memory key) internal pure returns (address) {
        return Currency.unwrap(key.currency0) == USDT ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0);
    }

    function _keys() internal view returns (PoolKey[2] memory ks) {
        ks[0] = keyNvda;
        ks[1] = keyHi;
    }

    // ------------------------------------------------------------------------------------------------------------
    // tests
    // ------------------------------------------------------------------------------------------------------------

    function test_fork_liveWiring() public view {
        assertEq(address(pm.vault()), VAULT);
        (uint160 sqrtP,, uint24 protocolFee, uint24 lpFee) = pm.getSlot0(keyNvda.toId());
        assertGt(sqrtP, 0);
        assertEq(lpFee, 0);
        // the live controller's dynamic-pool default (3 bps at the time of writing), applied both ways
        uint24 dflt =
            IProtocolFeeControllerView(address(pm.protocolFeeController())).defaultProtocolFeeForDynamicFeePool();
        assertEq(protocolFee, dflt | (dflt << 12));
        assertEq(pm.getLiquidity(keyNvda.toId()), LIQUIDITY);
        assertEq(pm.getLiquidity(keyHi.toId()), LIQUIDITY);
        assertGt(IERC20(NVDAB).balanceOf(VAULT), 0);
    }

    /// Monday gap, pool $230 vs FV $236 (band $229-$243, overnight): the arbitrage buy pays the gap, the seller
    /// pays the base fee. Real NVDAB (stock = currency0) and a stand-in stock that sorts as currency1.
    function test_fork_mondayGap_bothTokenOrders() public {
        PoolKey[2] memory keys = _keys();
        for (uint256 i; i < 2; ++i) {
            (uint24 buyFee, NightshiftFeeMath.Regime r1, FeeCheck memory c1) =
                _quoteSwapCheck(keys[i], _dir(keys[i], true), true, 5000e18);
            assertEq(buyFee, 16_177);
            assertEq(uint8(r1), uint8(NightshiftFeeMath.Regime.Informed));
            assertGt(c1.lpFee, (5000e18 * 16_000) / 1e6); // > $80 of the $5,000 trade stays with LPs

            (uint24 sellFee, NightshiftFeeMath.Regime r2,) =
                _quoteSwapCheck(keys[i], _dir(keys[i], false), true, 20e18);
            assertEq(sellFee, 3466);
            assertEq(uint8(r2), uint8(NightshiftFeeMath.Regime.Uninformed));
        }
    }

    function test_fork_exactOutput_bothDirections() public {
        PoolKey[2] memory keys = _keys();
        for (uint256 i; i < 2; ++i) {
            (uint24 buyFee,,) = _quoteSwapCheck(keys[i], _dir(keys[i], true), false, 10e18); // receive 10 stock
            assertEq(buyFee, 16_177);
            (uint24 sellFee,,) = _quoteSwapCheck(keys[i], _dir(keys[i], false), false, 1000e18); // receive 1000 USDT
            assertEq(sellFee, 3466);
        }
    }

    /// Every oracle state from the spec, both directions, both token orders, through the live router.
    function test_fork_oracleStates() public {
        uint256 base = vm.snapshotState();
        PoolKey[2] memory keys = _keys();
        for (uint256 i; i < 2; ++i) {
            address stock = _stockOf(keys[i]);

            // regular session, FV slightly above the pool: buy is informed, sell pays minFee
            vm.revertToState(base);
            oracle.post(stock, 230e8 + 5e7, 228e8, 233e8, 0, 0);
            (uint24 f,,) = _quoteSwapCheck(keys[i], _dir(keys[i], false), true, 20e18);
            assertEq(f, 500, "regular uninformed");
            (f,,) = _quoteSwapCheck(keys[i], _dir(keys[i], true), true, 1000e18);
            assertGt(f, 500, "regular informed");

            // pool above FV (FV $225, closed): selling is the informed side
            vm.revertToState(base);
            oracle.post(stock, 225e8, 220e8, 231e8, 4, 0);
            (f,,) = _quoteSwapCheck(keys[i], _dir(keys[i], false), true, 20e18);
            assertEq(f, 14_055, "informed sell");
            (f,,) = _quoteSwapCheck(keys[i], _dir(keys[i], true), true, 1000e18);
            assertEq(f, 2944, "uninformed buy");

            // stale report, corporate action, degraded model, oracle down: maxFee both ways, swaps still settle
            for (uint256 s; s < 4; ++s) {
                vm.revertToState(base);
                if (s == 0) vm.warp(block.timestamp + 901);
                if (s == 1) oracle.post(stock, 236e8, 229e8, 243e8, 0, 1);
                if (s == 2) oracle.post(stock, 236e8, 229e8, 243e8, 3, 8);
                if (s == 3) oracle.setMode(MockNightshiftOracle.Mode.Revert);
                NightshiftFeeMath.Regime expected = s == 0
                    ? NightshiftFeeMath.Regime.Stale
                    : (s == 3 ? NightshiftFeeMath.Regime.OracleFailure : NightshiftFeeMath.Regime.Flagged);
                (uint24 fb, NightshiftFeeMath.Regime rb,) = _quoteSwapCheck(keys[i], _dir(keys[i], true), true, 1000e18);
                (uint24 fs, NightshiftFeeMath.Regime rs,) = _quoteSwapCheck(keys[i], _dir(keys[i], false), true, 5e18);
                assertEq(fb, 100_000);
                assertEq(fs, 100_000);
                assertEq(uint8(rb), uint8(expected));
                assertEq(uint8(rs), uint8(expected));
            }
        }
    }

    /// The reopen in miniature: an arbitrageur walks the pool from $230 toward FV $236 in ten clips. Each clip pays
    /// base + 0.5 * remaining gap, so the fee falls as the gap closes, and LPs collect the fees on the live pool.
    function test_fork_reopenArbitrage_lpsCaptureTheGap() public {
        uint256 lpFees;
        uint24 lastFee = type(uint24).max;
        for (uint256 k; k < 10; ++k) {
            (uint24 fee, NightshiftFeeMath.Regime regime, FeeCheck memory c) =
                _quoteSwapCheck(keyNvda, _dir(keyNvda, true), true, 2000e18);
            if (regime != NightshiftFeeMath.Regime.Informed) break;
            assertLt(fee, lastFee, "fee must fall as the gap closes");
            lastFee = fee;
            lpFees += c.lpFee;
        }
        (,, uint256 priceE8,) = hook.quoteFee(keyNvda, true);
        emit log_named_decimal_uint("pool price after the clips (USD)", priceE8, 8);
        emit log_named_decimal_uint("fees kept by LPs (USDT)", lpFees, 18);
        assertGt(priceE8, 230e8);
        assertGt(lpFees, 0);
    }

    /// LP outcome of the Monday reopen. A rational arbitrageur buys NVDAB in 1,000 USDT clips for as long as the live
    /// CLQuoter says a clip is profitable at FV ($236), starting from a pool at $230: first on Sunday night (overnight
    /// report, band $229-$243), then again after the open (regular session, band $235.50-$236.50). Same liquidity,
    /// same protocol fee; only the LP-fee schedule differs. LP P&L at fair value = -(arbitrage profit) - protocol fees.
    function test_fork_reopen_lpOutcome_vsFlatFeePools() public {
        PoolKey[3] memory keys = [keyNvda, _flatPool(20, 500), _flatPool(30, 2500)];
        string[3] memory names = ["Nightshift defaults", "flat 0.05%", "flat 0.25%"];
        address[3] memory arbs = [makeAddr("arb0"), makeAddr("arb1"), makeAddr("arb2")];
        uint256[3] memory clips;
        uint256[3] memory protocolFees;
        for (uint256 phase; phase < 2; ++phase) {
            if (phase == 1) oracle.post(NVDAB, 236e8, 2355e7, 2365e7, 0, 0); // the open
            for (uint256 i; i < 3; ++i) {
                if (phase == 0) {
                    deal(USDT, arbs[i], 1_000_000e18);
                    _approveViaPermit2(arbs[i], USDT, UNIVERSAL_ROUTER);
                }
                (uint256 c, uint256 pf) = _arbPhase(keys[i], arbs[i]);
                clips[i] += c;
                protocolFees[i] += pf;
            }
        }
        int256[3] memory lpPnl;
        for (uint256 i; i < 3; ++i) {
            int256 arbProfit = int256(IERC20(NVDAB).balanceOf(arbs[i]) * 236)
                - int256(1_000_000e18 - IERC20(USDT).balanceOf(arbs[i]));
            lpPnl[i] = -arbProfit - int256(protocolFees[i]);
            (uint160 sqrtP,,,) = pm.getSlot0(keys[i].toId());
            emit log_string(names[i]);
            emit log_named_decimal_int("  LP P&L at fair value (USDT)", lpPnl[i], 18);
            emit log_named_decimal_int("  arbitrage profit (USDT)", arbProfit, 18);
            emit log_named_decimal_uint("  protocol fees (USDT)", protocolFees[i], 18);
            emit log_named_uint("  clips", clips[i]);
            emit log_named_decimal_uint("  final pool price", NightshiftFeeMath.poolPriceE8(sqrtP, true, 18, 18), 8);
        }
        assertGt(lpPnl[0], lpPnl[1]);
        assertGt(lpPnl[0], lpPnl[2]);
    }

    function _flatPool(int24 spacing, uint24 fee) internal returns (PoolKey memory k) {
        k = _key(NVDAB, USDT);
        k.parameters = hook.poolParameters(spacing);
        hook.configurePool(
            k,
            true,
            oracle,
            NightshiftFeeMath.FeeParams({minFee: fee, maxFee: fee, informedSlope: 0, uncertaintyCoef: 0, maxAge: 900})
        );
        pm.initialize(k, NightshiftFeeMath.sqrtPriceX96FromPriceE8(230e8, true, 18, 18));
        _mintPosition(k, spacing);
    }

    /// Buys 1,000 USDT clips while profitable at FV $236. Returns the clips taken and the protocol fees they paid.
    function _arbPhase(PoolKey memory key, address arb) internal returns (uint256 clips, uint256 protocolFees) {
        uint256 protocol0 = pm.protocolFeesAccrued(key.currency1);
        IQuoter.QuoteExactSingleParams memory q =
            IQuoter.QuoteExactSingleParams({poolKey: key, zeroForOne: false, exactAmount: 1000e18, hookData: ""});
        address saved = trader;
        trader = arb;
        for (; clips < 100; ++clips) {
            (uint256 stockOut,) = ICLQuoter(CL_QUOTER).quoteExactInputSingle(q);
            if (stockOut * 236 <= 1000e18) break; // no longer profitable at fair value
            _routerSwap(key, false, true, 1000e18);
        }
        trader = saved;
        protocolFees = pm.protocolFeesAccrued(key.currency1) - protocol0;
    }
}
