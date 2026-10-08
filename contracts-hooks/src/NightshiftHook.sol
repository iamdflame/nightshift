// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {
    ICLHooks,
    HOOKS_BEFORE_INITIALIZE_OFFSET,
    HOOKS_BEFORE_SWAP_OFFSET
} from "infinity-core/src/pool-cl/interfaces/ICLHooks.sol";
import {ICLPoolManager} from "infinity-core/src/pool-cl/interfaces/ICLPoolManager.sol";
import {PoolKey} from "infinity-core/src/types/PoolKey.sol";
import {PoolId} from "infinity-core/src/types/PoolId.sol";
import {Currency} from "infinity-core/src/types/Currency.sol";
import {BalanceDelta} from "infinity-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "infinity-core/src/types/BeforeSwapDelta.sol";
import {INightshiftOracle} from "./interfaces/INightshiftOracle.sol";
import {NightshiftFeeMath} from "./libraries/NightshiftFeeMath.sol";

/// @title NightshiftHook
/// @author Nightshift
/// @notice PancakeSwap Infinity concentrated-liquidity hook for tokenized-stock / USD pools. Every swap is priced against
///         the Nightshift fair-value oracle, so liquidity providers earn the market-reopen gap instead of donating it.
///
/// @dev ECONOMICS. Tokenized US stocks trade around the clock on-chain, but price discovery for the underlying happens
///      in a 32.5 hour/week regular session. At every reopen (each morning, and above all on Monday after the 48 hour
///      dark period) the fair price jumps and a plain AMM is stale: the first arbitrageurs buy or sell the whole gap
///      from LPs. That transfer is loss-versus-rebalancing (LVR, Milionis-Moallemi-Roughgarden-Zhang 2022), realized
///      in one burst. A static fee f only protects the first f of the gap; the rest goes to whoever trades first.
///
///      The oracle publishes a fair value FV and a 5%-95% band [lower, upper] for the next open. The hook uses it to
///      tell two kinds of flow apart:
///       - Informed flow moves the pool price toward FV (buying while pool < FV, selling while pool > FV) and pays
///         baseFee + informedSlope * |pool - FV| / FV. An arbitrageur who closes the gap in small steps pays, on every
///         step, informedSlope times the remaining gap, so LPs keep about informedSlope of the LVR instead of nothing,
///         and arbitrage stops within baseFee / (1 - informedSlope) of FV. Because informedSlope <= 1, a trader moving
///         the price toward FV never pays (to first order) more than FV * (1 + baseFee): the hook only takes back the
///         mispricing, it never makes a trade worse than an uninformed trade at fair value.
///       - Uninformed flow moves the price away from FV and pays baseFee: minFee in the regular session, plus
///         uncertaintyCoef * (upper - lower) / FV outside it, when LPs may face traders who know more than the
///         oracle (Glosten-Milgrom: the spread grows with the risk of trading against better information).
///      When the oracle cannot be trusted (stale, corporate action, degraded model, invalid report, or the call fails)
///      the hook charges maxFee: LPs are protected and swaps never revert because of the oracle.
///
///      MECHANICS. Pools must be initialized with fee = LPFeeLibrary.DYNAMIC_FEE_FLAG and parameters carrying this
///      hook's registration bitmap (beforeInitialize | beforeSwap). beforeSwap returns the fee with
///      LPFeeLibrary.OVERRIDE_FEE_FLAG set, which the CLPoolManager applies to that swap only (no storage write). The
///      PancakeSwap protocol fee (3 bps by default on BSC dynamic-fee pools) is charged on top by the PoolManager.
///      The hot path makes two calls: a warm STATICCALL to the PoolManager (its caller) for slot0, and the oracle read.
contract NightshiftHook is ICLHooks, Ownable2Step {
    // ---------------------------------------------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------------------------------------------

    /// @notice Same value as LPFeeLibrary.DYNAMIC_FEE_FLAG: PoolKey.fee of a dynamic-fee pool.
    uint24 public constant DYNAMIC_FEE_FLAG = 0x800000;
    /// @notice Same value as LPFeeLibrary.OVERRIDE_FEE_FLAG: set on beforeSwap's fee to override the LP fee for a swap.
    uint24 public constant OVERRIDE_FEE_FLAG = 0x400000;

    /// @notice Callbacks this hook registers: beforeInitialize (bit 0) and beforeSwap (bit 6) = 0x41.
    uint16 public constant HOOKS_BITMAP = (uint16(1) << HOOKS_BEFORE_INITIALIZE_OFFSET) | (uint16(1) << HOOKS_BEFORE_SWAP_OFFSET);

    /// @notice Hard cap on maxFee: 50%. Far below the CL limit (100%, where exact-output swaps revert).
    uint24 public constant MAX_FEE_CAP = 500_000;
    /// @notice Hard cap on informedSlope: 1.0x. Above 1 a trader moving the price toward FV would pay more than the gap
    ///         itself, so the pool could never converge to fair value.
    uint24 public constant MAX_INFORMED_SLOPE = 1_000_000;
    /// @notice Hard cap on uncertaintyCoef: 1.0x the relative band width.
    uint24 public constant MAX_UNCERTAINTY_COEF = 1_000_000;
    /// @notice Bounds on maxAge (staleness budget).
    uint32 public constant MIN_MAX_AGE = 60;
    uint32 public constant MAX_MAX_AGE = 1 days;
    /// @notice Largest supported token decimals (keeps price math far from overflow).
    uint8 public constant MAX_TOKEN_DECIMALS = 18;
    /// @notice Gas forwarded to the oracle: a hostile or broken oracle cannot burn the swap's gas.
    uint256 public constant ORACLE_GAS_LIMIT = 100_000;
    /// @notice Decimals the Fair Value Feed v1 must report.
    uint8 public constant ORACLE_DECIMALS = 8;

    // ---------------------------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------------------------

    /// @notice Per-pool configuration. Two storage slots: (oracle, side, decimals) and FeeParams.
    struct PoolConfig {
        INightshiftOracle oracle;
        bool stockIsCurrency0;
        uint8 stockDecimals;
        uint8 quoteDecimals;
        NightshiftFeeMath.FeeParams params;
    }

    /// @notice The CLPoolManager this hook serves.
    ICLPoolManager public immutable poolManager;

    mapping(PoolId id => PoolConfig) internal _pools;

    // ---------------------------------------------------------------------------------------------------------------
    // Events and errors
    // ---------------------------------------------------------------------------------------------------------------

    event PoolConfigured(
        PoolId indexed id,
        address indexed stock,
        address indexed quote,
        INightshiftOracle oracle,
        bool stockIsCurrency0,
        uint8 stockDecimals,
        uint8 quoteDecimals
    );
    event FeeParamsUpdated(PoolId indexed id, NightshiftFeeMath.FeeParams params);
    event OracleUpdated(PoolId indexed id, INightshiftOracle indexed oldOracle, INightshiftOracle indexed newOracle);

    error NotPoolManager();
    error HookNotImplemented();
    error NotDynamicFeePool(uint24 fee);
    error WrongHook(address hooks);
    error WrongPoolManager(address poolManager);
    error WrongHooksBitmap(uint16 bitmap);
    error PoolNotConfigured(PoolId id);
    error PoolAlreadyConfigured(PoolId id);
    error NativeCurrencyUnsupported();
    error UnsupportedDecimals(address token, uint8 decimals);
    error ZeroOracle();
    error OracleDecimalsMismatch(uint8 decimals);
    error OracleUnusable(NightshiftFeeMath.Regime regime);
    error InitialPriceOutsideBand(uint256 priceE8, uint128 lower, uint128 upper);
    error MaxFeeAboveCap(uint24 maxFee);
    error MinFeeAboveMaxFee(uint24 minFee, uint24 maxFee);
    error SlopeAboveCap(uint24 informedSlope);
    error UncertaintyCoefAboveCap(uint24 uncertaintyCoef);
    error MaxAgeOutOfBounds(uint32 maxAge);

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /// @param _poolManager The CLPoolManager (BSC: 0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b).
    /// @param initialOwner Admin allowed to configure pools and tune parameters within the hard caps.
    constructor(ICLPoolManager _poolManager, address initialOwner) Ownable(initialOwner) {
        poolManager = _poolManager;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Hook callbacks
    // ---------------------------------------------------------------------------------------------------------------

    /// @inheritdoc ICLHooks
    /// @dev Only owner-configured, dynamic-fee pools can be created, and only at a price inside the oracle's current
    ///      band: nobody (including a fat-fingered owner) can initialize the pool at a stale or off-market price.
    function beforeInitialize(address, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (key.fee != DYNAMIC_FEE_FLAG) revert NotDynamicFeePool(key.fee);
        PoolId id = _toId(key);
        PoolConfig memory cfg = _pools[id];
        if (address(cfg.oracle) == address(0)) revert PoolNotConfigured(id);

        (bool success, INightshiftOracle.Report memory r) = _readReport(cfg.oracle, _stock(key, cfg.stockIsCurrency0));
        if (!success) revert OracleUnusable(NightshiftFeeMath.Regime.OracleFailure);
        (bool ok, NightshiftFeeMath.Regime regime) = NightshiftFeeMath.checkReport(cfg.params, r, block.timestamp);
        if (!ok) revert OracleUnusable(regime);

        uint256 priceE8 =
            NightshiftFeeMath.poolPriceE8(sqrtPriceX96, cfg.stockIsCurrency0, cfg.stockDecimals, cfg.quoteDecimals);
        if (priceE8 < r.lower || priceE8 > r.upper) revert InitialPriceOutsideBand(priceE8, r.lower, r.upper);
        return ICLHooks.beforeInitialize.selector;
    }

    /// @inheritdoc ICLHooks
    /// @dev Never reverts for a configured pool: every oracle failure mode maps to maxFee.
    function beforeSwap(address, PoolKey calldata key, ICLPoolManager.SwapParams calldata params, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        (uint24 fee,,,) = _quote(key, params.zeroForOne);
        return (ICLHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | OVERRIDE_FEE_FLAG);
    }

    /// @inheritdoc ICLHooks
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    /// @inheritdoc ICLHooks
    function beforeAddLiquidity(address, PoolKey calldata, ICLPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    /// @inheritdoc ICLHooks
    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ICLPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    /// @inheritdoc ICLHooks
    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        ICLPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    /// @inheritdoc ICLHooks
    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ICLPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    /// @inheritdoc ICLHooks
    function afterSwap(address, PoolKey calldata, ICLPoolManager.SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        revert HookNotImplemented();
    }

    /// @inheritdoc ICLHooks
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    /// @inheritdoc ICLHooks
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    /// @notice Registration bitmap the PoolManager checks against PoolKey.parameters at initialization.
    function getHooksRegistrationBitmap() external pure returns (uint16) {
        return HOOKS_BITMAP;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------------------------

    /// @notice The LP fee (pips, without the override flag) the next swap in `zeroForOne` direction would pay, and why.
    /// @return fee LP fee in pips. The PoolManager adds the protocol fee on top.
    /// @return regime Which branch of the schedule applied.
    /// @return poolPriceE8 Pool price in USD per stock token (8 decimals); 0 when the oracle was unusable.
    /// @return fairValueE8 Oracle fair value (8 decimals); 0 when the oracle call failed.
    function quoteFee(PoolKey calldata key, bool zeroForOne)
        external
        view
        returns (uint24 fee, NightshiftFeeMath.Regime regime, uint256 poolPriceE8, uint256 fairValueE8)
    {
        return _quote(key, zeroForOne);
    }

    /// @notice Stored configuration of a pool.
    function getPoolConfig(PoolId id) external view returns (PoolConfig memory) {
        return _pools[id];
    }

    /// @notice PoolKey.parameters for a pool using this hook: registration bitmap in bits 0-15, tickSpacing in 16-39.
    function poolParameters(int24 tickSpacing) external pure returns (bytes32) {
        // casting int24 -> uint24 is safe because the PoolManager only accepts tickSpacing in [1, 32767]
        // forge-lint: disable-next-line(unsafe-typecast)
        return bytes32(uint256(HOOKS_BITMAP) | (uint256(uint24(tickSpacing)) << 16));
    }

    /// @notice Recommended launch parameters (see docs/hook.md for the reasoning).
    /// @dev minFee 5 bps; maxFee 10%; informedSlope 0.5x (LPs keep ~half the reopen gap, arbitrage still closes it);
    ///      uncertaintyCoef 0.05x (a 6% overnight band adds 30 bps); maxAge 15 minutes.
    function defaultFeeParams() public pure returns (NightshiftFeeMath.FeeParams memory) {
        return NightshiftFeeMath.FeeParams({
            minFee: 500, maxFee: 100_000, informedSlope: 500_000, uncertaintyCoef: 50_000, maxAge: 900
        });
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------------------------------------------------

    /// @notice Registers a pool before it is initialized. The quote token is the other currency of the key and is
    ///         treated as 1 USD (USDT on BSC).
    /// @param key Pool key: hooks = this, poolManager = this hook's manager, fee = DYNAMIC_FEE_FLAG, parameters carrying
    ///        HOOKS_BITMAP (see poolParameters).
    /// @param stockIsCurrency0 True when the stock token sorts first (e.g. NVDAB 0x02fc... < USDT 0x55d3...).
    /// @param oracle Nightshift fair-value oracle (Fair Value Feed v1, 8 decimals).
    /// @param params Fee parameters, validated against the hard caps.
    function configurePool(
        PoolKey calldata key,
        bool stockIsCurrency0,
        INightshiftOracle oracle,
        NightshiftFeeMath.FeeParams calldata params
    ) external onlyOwner {
        if (address(key.hooks) != address(this)) revert WrongHook(address(key.hooks));
        if (address(key.poolManager) != address(poolManager)) revert WrongPoolManager(address(key.poolManager));
        if (key.fee != DYNAMIC_FEE_FLAG) revert NotDynamicFeePool(key.fee);
        // casting to 'uint16' is safe because it deliberately keeps only the bitmap bits 0-15
        // forge-lint: disable-next-line(unsafe-typecast)
        uint16 bitmap = uint16(uint256(key.parameters));
        if (bitmap != HOOKS_BITMAP) revert WrongHooksBitmap(bitmap);

        PoolId id = _toId(key);
        if (address(_pools[id].oracle) != address(0)) revert PoolAlreadyConfigured(id);

        address stock = _stock(key, stockIsCurrency0);
        address quote = Currency.unwrap(stockIsCurrency0 ? key.currency1 : key.currency0);
        if (stock == address(0) || quote == address(0)) revert NativeCurrencyUnsupported();
        uint8 stockDecimals = _decimals(stock);
        uint8 quoteDecimals = _decimals(quote);
        _checkOracle(oracle);
        _validate(params);

        _pools[id] = PoolConfig({
            oracle: oracle,
            stockIsCurrency0: stockIsCurrency0,
            stockDecimals: stockDecimals,
            quoteDecimals: quoteDecimals,
            params: params
        });
        // The only external calls above are view functions (STATICCALL): nothing can re-enter and reorder these logs.
        // forge-lint: disable-next-line(reentrancy-events)
        emit PoolConfigured(id, stock, quote, oracle, stockIsCurrency0, stockDecimals, quoteDecimals);
        // forge-lint: disable-next-line(reentrancy-events)
        emit FeeParamsUpdated(id, params);
    }

    /// @notice Updates the fee parameters of a configured pool (takes effect on the next swap).
    function setFeeParams(PoolId id, NightshiftFeeMath.FeeParams calldata params) external onlyOwner {
        _requireConfigured(id);
        _validate(params);
        _pools[id].params = params;
        emit FeeParamsUpdated(id, params);
    }

    /// @notice Points a configured pool at a new oracle (e.g. a migrated feed).
    function setOracle(PoolId id, INightshiftOracle oracle) external onlyOwner {
        _requireConfigured(id);
        _checkOracle(oracle);
        INightshiftOracle old = _pools[id].oracle;
        _pools[id].oracle = oracle;
        emit OracleUpdated(id, old, oracle);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------------------------

    /// @dev Shared by beforeSwap and quoteFee so the quote is, by construction, the fee the swap will pay.
    function _quote(PoolKey calldata key, bool zeroForOne)
        internal
        view
        returns (uint24 fee, NightshiftFeeMath.Regime regime, uint256 poolPriceE8, uint256 fairValueE8)
    {
        PoolId id = _toId(key);
        PoolConfig memory cfg = _pools[id];
        if (address(cfg.oracle) == address(0)) revert PoolNotConfigured(id);

        (bool success, INightshiftOracle.Report memory r) = _readReport(cfg.oracle, _stock(key, cfg.stockIsCurrency0));
        if (!success) return (cfg.params.maxFee, NightshiftFeeMath.Regime.OracleFailure, 0, 0);
        fairValueE8 = r.fairValue;

        bool ok;
        (ok, regime) = NightshiftFeeMath.checkReport(cfg.params, r, block.timestamp);
        if (!ok) return (cfg.params.maxFee, regime, 0, fairValueE8);

        // Only the price matters here; tick, protocol fee and stored LP fee are irrelevant to the schedule.
        // forge-lint: disable-next-line(unused-return)
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        poolPriceE8 =
            NightshiftFeeMath.poolPriceE8(sqrtPriceX96, cfg.stockIsCurrency0, cfg.stockDecimals, cfg.quoteDecimals);
        (fee, regime) = NightshiftFeeMath.feeForUsableReport(
            cfg.params, r, poolPriceE8, NightshiftFeeMath.isBuyingStock(zeroForOne, cfg.stockIsCurrency0)
        );
    }

    /// @dev Reads the report with a bounded-gas STATICCALL and decodes it by hand, so that a reverting oracle, an
    ///      empty account, short return data or out-of-range words all yield success = false instead of a revert
    ///      (abi.decode inside try/catch would still revert on malformed data).
    function _readReport(INightshiftOracle oracle, address token)
        internal
        view
        returns (bool success, INightshiftOracle.Report memory r)
    {
        bytes4 selector = INightshiftOracle.getReport.selector;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, selector)
            mstore(add(ptr, 0x04), token)
            // Report is 8 static words: 3 x uint128, 3 x uint64, 2 x uint8.
            if staticcall(ORACLE_GAS_LIMIT, oracle, ptr, 0x24, ptr, 0x100) {
                if iszero(lt(returndatasize(), 0x100)) {
                    let w0 := mload(ptr)
                    let w1 := mload(add(ptr, 0x20))
                    let w2 := mload(add(ptr, 0x40))
                    let w3 := mload(add(ptr, 0x60))
                    let w4 := mload(add(ptr, 0x80))
                    let w5 := mload(add(ptr, 0xa0))
                    let w6 := mload(add(ptr, 0xc0))
                    let w7 := mload(add(ptr, 0xe0))
                    let dirty := or(or(shr(128, w0), shr(128, w1)), shr(128, w2))
                    dirty := or(dirty, or(or(shr(64, w3), shr(64, w4)), shr(64, w5)))
                    dirty := or(dirty, or(shr(8, w6), shr(8, w7)))
                    if iszero(dirty) {
                        mstore(r, w0)
                        mstore(add(r, 0x20), w1)
                        mstore(add(r, 0x40), w2)
                        mstore(add(r, 0x60), w3)
                        mstore(add(r, 0x80), w4)
                        mstore(add(r, 0xa0), w5)
                        mstore(add(r, 0xc0), w6)
                        mstore(add(r, 0xe0), w7)
                        success := 1
                    }
                }
            }
        }
    }

    /// @dev keccak256 of the 6-word calldata PoolKey (same as PoolIdLibrary.toId without the memory copy).
    function _toId(PoolKey calldata key) internal pure returns (PoolId id) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            calldatacopy(ptr, key, 0xc0)
            id := keccak256(ptr, 0xc0)
        }
    }

    function _stock(PoolKey calldata key, bool stockIsCurrency0) internal pure returns (address) {
        return Currency.unwrap(stockIsCurrency0 ? key.currency0 : key.currency1);
    }

    function _decimals(address token) internal view returns (uint8 d) {
        d = IERC20Metadata(token).decimals();
        if (d > MAX_TOKEN_DECIMALS) revert UnsupportedDecimals(token, d);
    }

    function _checkOracle(INightshiftOracle oracle) internal view {
        if (address(oracle) == address(0)) revert ZeroOracle();
        uint8 d = oracle.decimals();
        if (d != ORACLE_DECIMALS) revert OracleDecimalsMismatch(d);
    }

    function _requireConfigured(PoolId id) internal view {
        if (address(_pools[id].oracle) == address(0)) revert PoolNotConfigured(id);
    }

    function _validate(NightshiftFeeMath.FeeParams calldata p) internal pure {
        if (p.maxFee > MAX_FEE_CAP) revert MaxFeeAboveCap(p.maxFee);
        if (p.minFee > p.maxFee) revert MinFeeAboveMaxFee(p.minFee, p.maxFee);
        if (p.informedSlope > MAX_INFORMED_SLOPE) revert SlopeAboveCap(p.informedSlope);
        if (p.uncertaintyCoef > MAX_UNCERTAINTY_COEF) revert UncertaintyCoefAboveCap(p.uncertaintyCoef);
        if (p.maxAge < MIN_MAX_AGE || p.maxAge > MAX_MAX_AGE) revert MaxAgeOutOfBounds(p.maxAge);
    }
}
