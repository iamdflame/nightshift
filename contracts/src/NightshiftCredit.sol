// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin-contracts/access/Ownable2Step.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin-contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin-contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin-contracts/utils/Pausable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin-contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin-contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin-contracts/utils/math/SafeCast.sol";

import {INightshiftOracle, INightshiftOracleExtended} from "./interfaces/INightshiftOracle.sol";
import {ReportLib} from "./libraries/ReportLib.sol";

/// @title NightshiftCredit
/// @author Nightshift
/// @notice Isolated lending market for tokenized US stocks that stays solvent through weekends.
///
///         Lenders deposit the debt asset (USDT) and receive ERC-4626 shares; `totalAssets = cash + accrued debt`.
///         Borrowers post allowlisted tokenized-stock collateral (several tokens per account), borrow USDT, repay and
///         withdraw.
///
///         Valuation rule (the core idea): collateral is valued at the report's `lower`, the 5th percentile of the
///         token's value at the next regular-session open, never at `fairValue`:
///
///           borrowing power   = sum(collateral_i * lower_i * baseLtv_i)          (new debt must fit under it)
///           liquidation value = sum(collateral_i * lower_i * liqThreshold_i)     (health factor = value / debt)
///
///         A Sunday loan is therefore sized against a Monday-open price that is exceeded 95% of the time, and its
///         `1 - baseLtv` haircut sits on top of that. Liquidation (close factor 50%) repays debt and seizes collateral
///         valued at `fairValue` plus a bonus.
///
///         Safety gates: {borrow} and {withdrawCollateral} (when the account has debt) revert unless every enabled
///         collateral of the account has a report that exists, is at most `maxAge` old, is not flagged corporate action
///         (`flags & 1`) or model degraded (`flags & 8`), and whose band `(upper - lower) / fairValue` is at most
///         `maxBandBps`. {repay} and {depositCollateral} are always allowed (even while paused). {liquidate} requires a
///         fresh, non-corporate-action report for the collateral it seizes.
///
///         Interest: owner-set fixed APR, accrued per second through a ray borrow index.
///
/// ## Rounding (always against the borrower / in favor of the protocol)
///
///         | quantity                                   | direction |
///         |--------------------------------------------|-----------|
///         | rate per second, borrow index growth       | up        |
///         | scaled debt added by a borrow              | up        |
///         | account debt (scaled -> assets)            | up        |
///         | scaled debt removed by a partial repay     | down      |
///         | total debt inside `totalAssets`            | down      |
///         | borrowing power, liquidation value         | down      |
///         | collateral seized by a liquidation         | down      |
///         | repay charged when a seizure is capped     | up        |
///         | ERC-4626 conversions                       | OZ (vault-favoring) |
///
///         Because each account's debt rounds up while `totalAssets` rounds the aggregate down, lenders are never
///         credited with more than borrowers actually owe.
///
/// @dev Units: debt-asset amounts in the asset's decimals (USDT on BSC: 18), collateral in each token's decimals,
///      prices in USD with 8 decimals. The debt asset is assumed to be worth 1 USD. Cash is tracked internally, so
///      tokens sent to the contract directly ("donations") never move the share price; the owner can {skim} them.
contract NightshiftCredit is ERC4626, Ownable2Step, Pausable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------------------------------------------------

    uint256 internal constant RAY = 1e27;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    /// @notice Seconds in the APR year (365 days).
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    /// @notice Share of an account's debt a single liquidation may repay.
    uint256 public constant CLOSE_FACTOR_BPS = 5000;
    /// @notice Maximum number of collateral tokens the market can ever list.
    uint256 public constant MAX_COLLATERALS = 16;
    /// @notice Highest configurable borrow APR (100%).
    uint256 public constant MAX_BORROW_APR_BPS = 10_000;
    /// @notice Highest configurable liquidation bonus (20%).
    uint256 public constant MAX_LIQ_BONUS_BPS = 2000;
    /// @notice Longest configurable staleness budget for a collateral report.
    uint256 public constant MAX_REPORT_MAX_AGE = 7 days;
    /// @notice Largest supported decimals for the debt asset (keeps every intermediate product far below 2^256).
    uint8 public constant MAX_ASSET_DECIMALS = 18;
    /// @notice Largest supported decimals for a collateral token.
    uint8 public constant MAX_COLLATERAL_DECIMALS = 36;

    // ------------------------------------------------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Owner-supplied risk parameters for one collateral token.
    /// @param enabled Accepts new deposits and counts toward borrowing power. Disabled collateral still counts
    ///        toward the liquidation value, so disabling never makes healthy positions liquidatable.
    /// @param baseLtvBps Borrowing power per unit of collateral value at `lower` (e.g. 5000 = 50%).
    /// @param liqThresholdBps Liquidation value per unit of collateral value at `lower` (e.g. 6500 = 65%).
    /// @param liqBonusBps Extra collateral, valued at `fairValue`, a liquidator receives (e.g. 500 = 5%).
    /// @param maxBandBps Widest band `(upper - lower) / fairValue` that still allows new borrows (e.g. 1500 = 15%).
    /// @param maxAge Oldest report (seconds) accepted for borrows, collateral withdrawals and seizures.
    struct CollateralParams {
        bool enabled;
        uint16 baseLtvBps;
        uint16 liqThresholdBps;
        uint16 liqBonusBps;
        uint16 maxBandBps;
        uint32 maxAge;
    }

    /// @notice Stored configuration of a collateral token (one storage slot).
    struct CollateralConfig {
        bool listed; // ever listed; listing is permanent (its bit index is stable)
        bool enabled;
        uint8 index; // bit position in every account's collateral mask
        uint8 decimals; // token decimals, read once at listing
        uint16 baseLtvBps;
        uint16 liqThresholdBps;
        uint16 liqBonusBps;
        uint16 maxBandBps;
        uint32 maxAge;
    }

    /// @notice An account's debt and the set of collateral tokens it holds (one storage slot).
    struct Position {
        uint240 scaledDebt; // debt / borrowIndex, in asset units * RAY / index
        uint16 collateralMask; // bit i set <=> non-zero balance of collateral with index i
    }

    /// @notice Snapshot of an account's risk, computed from the latest reports (staleness gates NOT applied).
    struct AccountData {
        uint256 debt; // asset units, rounded up
        uint256 borrowPower; // sum over enabled collateral of amount * lower * baseLtv, asset units
        uint256 liquidationValue; // sum over all collateral of amount * lower * liqThreshold, asset units
        uint256 healthFactor; // liquidationValue / debt, WAD; type(uint256).max without debt
        uint16 collateralMask;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Source of collateral prices.
    INightshiftOracleExtended public immutable oracle;
    uint8 private immutable _assetDecimals;

    uint192 private _borrowIndex; // ray
    uint64 private _lastAccrual; // unix seconds
    /// @notice Borrow APR in basis points.
    uint256 public borrowAprBps;
    /// @notice Per-second borrow rate in ray (`borrowAprBps * 1e27 / (1e4 * 365 days)`, rounded up).
    uint256 public borrowRatePerSecond;
    /// @notice Sum of all accounts' scaled debt.
    uint256 public totalScaledDebt;
    uint256 private _cash;

    address[] private _collateralTokens;
    mapping(address token => CollateralConfig) private _configs;
    /// @notice Collateral held for all accounts, per token (internal accounting; excludes donations).
    mapping(address token => uint256) public totalCollateral;
    mapping(address account => Position) private _positions;
    mapping(address account => mapping(address token => uint256)) private _collateral;

    // ------------------------------------------------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------------------------------------------------

    event CollateralConfigured(address indexed token, uint8 indexed index, uint8 decimals, CollateralParams params);
    event BorrowRateUpdated(uint256 previousAprBps, uint256 newAprBps, uint256 ratePerSecond);
    event InterestAccrued(uint256 borrowIndex, uint256 timestamp);
    event CollateralDeposited(address indexed caller, address indexed account, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed account, address indexed receiver, address indexed token, uint256 amount);
    event Borrowed(address indexed account, address indexed receiver, uint256 amount, uint256 debtAfter);
    event Repaid(address indexed payer, address indexed account, uint256 amount, uint256 debtAfter);
    event Liquidated(
        address indexed liquidator,
        address indexed borrower,
        address indexed collateralToken,
        uint256 repaid,
        uint256 seized,
        uint256 price,
        address receiver
    );
    event BadDebtRealized(address indexed borrower, uint256 amount);
    event Skimmed(address indexed token, address indexed to, uint256 amount);

    // ------------------------------------------------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error RenounceDisabled();
    error UnsupportedAsset(address asset);
    error InvalidBorrowRate(uint256 aprBps);
    error InvalidCollateral(address token);
    error TooManyCollaterals();
    error InvalidLtv(uint16 baseLtvBps, uint16 liqThresholdBps);
    error InvalidLiquidationBonus(uint16 liqBonusBps, uint16 liqThresholdBps);
    error InvalidMaxBand(uint16 maxBandBps);
    error InvalidMaxAge(uint32 maxAge);
    error CollateralNotEnabled(address token);
    error CollateralNotListed(address token);
    error CollateralNotOpened(address account, address token);
    error InsufficientCollateralBalance(address token, uint256 balance, uint256 requested);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error InsufficientCollateral(address account, uint256 debt, uint256 borrowPower);
    error MissingReport(address token);
    error MalformedReport(address token);
    error StaleReport(address token, uint64 updatedAt, uint32 maxAge);
    error CorporateAction(address token);
    error DegradedReport(address token);
    error BandTooWide(address token, uint256 bandBps, uint16 maxBandBps);
    error NoDebt(address account);
    error RepayTooSmall(uint256 amount);
    error SelfLiquidation();
    error PositionHealthy(address account, uint256 liquidationValue, uint256 debt);
    error NoCollateral(address account, address token);
    error LiquidationTooSmall();
    error SeizeBelowMinimum(uint256 seized, uint256 minSeized);
    error NothingToSkim(address token);

    // ------------------------------------------------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------------------------------------------------

    /// @param asset_ Debt asset lenders deposit (USDT on BSC); at most 18 decimals.
    /// @param oracle_ Nightshift oracle used to value collateral.
    /// @param initialOwner Risk admin (Ownable2Step): lists collateral, sets the APR, pauses, skims.
    /// @param borrowAprBps_ Initial fixed borrow APR in basis points (at most 100%).
    /// @param name_ ERC-20 name of the lender share.
    /// @param symbol_ ERC-20 symbol of the lender share.
    constructor(
        IERC20 asset_,
        INightshiftOracleExtended oracle_,
        address initialOwner,
        uint256 borrowAprBps_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC4626(asset_) Ownable(initialOwner) {
        if (address(asset_) == address(0) || address(oracle_) == address(0)) revert ZeroAddress();
        (bool ok, uint8 assetDecimals) = SafeERC20.tryGetDecimals(asset_);
        if (!ok || assetDecimals > MAX_ASSET_DECIMALS) revert UnsupportedAsset(address(asset_));
        _assetDecimals = assetDecimals;
        oracle = oracle_;
        _borrowIndex = SafeCast.toUint192(RAY);
        _lastAccrual = SafeCast.toUint64(block.timestamp);
        _setBorrowRate(borrowAprBps_);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Owner
    // ------------------------------------------------------------------------------------------------------------

    /// @notice List a new collateral token or update an existing one's parameters.
    /// @dev Requirements: `baseLtv < liqThreshold < 100%`, `liqBonus <= 20%`, `liqThreshold * (1 + liqBonus) <= 100%`
    ///      (a liquidation at the threshold never needs more collateral than exists), `0 < maxBand <= 100%`,
    ///      `0 < maxAge <= 7 days`. Lowering `liqThresholdBps` takes effect immediately and can make positions
    ///      liquidatable: production deployments should put the owner behind a timelock.
    function setCollateral(address token, CollateralParams calldata params) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (token == asset() || token == address(this)) revert InvalidCollateral(token);
        _validateParams(params);

        CollateralConfig storage cfg = _configs[token];
        if (!cfg.listed) {
            uint256 count = _collateralTokens.length;
            if (count >= MAX_COLLATERALS) revert TooManyCollaterals();
            (bool ok, uint8 tokenDecimals) = SafeERC20.tryGetDecimals(IERC20(token));
            if (!ok || tokenDecimals > MAX_COLLATERAL_DECIMALS) revert InvalidCollateral(token);
            cfg.listed = true;
            cfg.index = SafeCast.toUint8(count); // count < MAX_COLLATERALS = 16
            cfg.decimals = tokenDecimals;
            _collateralTokens.push(token);
        }
        cfg.enabled = params.enabled;
        cfg.baseLtvBps = params.baseLtvBps;
        cfg.liqThresholdBps = params.liqThresholdBps;
        cfg.liqBonusBps = params.liqBonusBps;
        cfg.maxBandBps = params.maxBandBps;
        cfg.maxAge = params.maxAge;
        emit CollateralConfigured(token, cfg.index, cfg.decimals, params);
    }

    /// @notice Set the fixed borrow APR (basis points, at most 100%). Interest up to now accrues at the old rate.
    function setBorrowRate(uint256 aprBps) external onlyOwner {
        _setBorrowRate(aprBps);
    }

    /// @notice Pause lender deposits/withdrawals, borrows, collateral withdrawals and liquidations.
    /// @dev {repay} and {depositCollateral} stay available so borrowers can always de-risk.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Lift a pause.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Send `token` held above the internally tracked amount (donations, mistaken transfers) to `to`.
    /// @dev Only the surplus over `cash` (debt asset) or `totalCollateral[token]` (collateral) can move, so lenders'
    ///      and borrowers' funds are untouchable.
    function skim(address token, address to) external nonReentrant onlyOwner returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        uint256 tracked = token == asset() ? _cash : totalCollateral[token];
        uint256 held = IERC20(token).balanceOf(address(this));
        if (held <= tracked) revert NothingToSkim(token);
        amount = held - tracked;
        emit Skimmed(token, to, amount);
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Ownership can only be transferred (two-step), never renounced: an ownerless market could not be paused.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------------------------------------------------------
    // Borrowers
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Deposit `amount` of collateral `token` for `onBehalfOf`. Always allowed, even while paused.
    /// @dev Credits the balance actually received (fee-on-transfer safe). A third party may top up a collateral the
    ///      account already holds (e.g. a keeper rescuing a position) but cannot introduce a new token into someone
    ///      else's account; otherwise anyone could attach a token with a stale report to a victim and freeze the
    ///      victim's borrows.
    /// @return received Collateral credited.
    function depositCollateral(address token, uint256 amount, address onBehalfOf)
        external
        nonReentrant
        returns (uint256 received)
    {
        if (amount == 0) revert ZeroAmount();
        if (onBehalfOf == address(0)) revert ZeroAddress();
        CollateralConfig memory cfg = _configs[token];
        if (!cfg.enabled) revert CollateralNotEnabled(token);
        uint256 balance = _collateral[onBehalfOf][token];
        if (balance == 0 && onBehalfOf != msg.sender) revert CollateralNotOpened(onBehalfOf, token);

        IERC20 t = IERC20(token);
        uint256 before = t.balanceOf(address(this));
        t.safeTransferFrom(msg.sender, address(this), amount);
        received = t.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();

        _collateral[onBehalfOf][token] = balance + received;
        totalCollateral[token] += received;
        if (balance == 0) _positions[onBehalfOf].collateralMask |= _bit(cfg.index);
        emit CollateralDeposited(msg.sender, onBehalfOf, token, received);
    }

    /// @notice Withdraw `amount` (or everything with `type(uint256).max`) of collateral `token` to `receiver`.
    /// @dev Without debt this never consults the oracle, so collateral is never held hostage by an oracle outage.
    ///      With debt, the remaining position must pass the full borrow check (gates + borrowing power).
    /// @return withdrawn Collateral sent.
    function withdrawCollateral(address token, uint256 amount, address receiver)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 withdrawn)
    {
        if (receiver == address(0)) revert ZeroAddress();
        uint256 balance = _collateral[msg.sender][token];
        withdrawn = amount == type(uint256).max ? balance : amount;
        if (withdrawn == 0) revert ZeroAmount();
        if (withdrawn > balance) revert InsufficientCollateralBalance(token, balance, withdrawn);

        uint256 remaining = balance - withdrawn;
        _collateral[msg.sender][token] = remaining;
        totalCollateral[token] -= withdrawn;
        Position memory pos = _positions[msg.sender];
        if (remaining == 0) {
            pos.collateralMask &= ~_bit(_configs[token].index);
            _positions[msg.sender].collateralMask = pos.collateralMask;
        }
        if (pos.scaledDebt != 0) {
            uint256 index = _accrue();
            _requireBorrowable(msg.sender, pos.collateralMask, _debt(pos.scaledDebt, index));
        }

        emit CollateralWithdrawn(msg.sender, receiver, token, withdrawn);
        IERC20(token).safeTransfer(receiver, withdrawn);
    }

    /// @notice Borrow `amount` of the debt asset to `receiver` against the caller's collateral.
    /// @dev Reverts unless every enabled collateral passes the safety gates and the new debt is at most the borrowing
    ///      power `sum(collateral * lower * baseLtv)`.
    function borrow(uint256 amount, address receiver) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        uint256 index = _accrue();
        uint256 cash_ = _cash;
        if (amount > cash_) revert InsufficientLiquidity(amount, cash_);

        Position memory pos = _positions[msg.sender];
        uint256 scaledAdded = Math.mulDiv(amount, RAY, index, Math.Rounding.Ceil);
        uint256 newScaled = uint256(pos.scaledDebt) + scaledAdded;
        uint256 debtAfter = _debt(newScaled, index);
        _requireBorrowable(msg.sender, pos.collateralMask, debtAfter);

        _positions[msg.sender].scaledDebt = SafeCast.toUint240(newScaled);
        totalScaledDebt += scaledAdded;
        _cash = cash_ - amount;
        emit Borrowed(msg.sender, receiver, amount, debtAfter);
        IERC20(asset()).safeTransfer(receiver, amount);
    }

    /// @notice Repay up to `amount` of `onBehalfOf`'s debt (`type(uint256).max` or any amount above the debt repays
    ///         exactly the debt). Always allowed, even while paused.
    /// @return repaid Debt asset pulled from the caller.
    function repay(uint256 amount, address onBehalfOf) external nonReentrant returns (uint256 repaid) {
        if (amount == 0) revert ZeroAmount();
        if (onBehalfOf == address(0)) revert ZeroAddress();
        uint256 index = _accrue();
        uint256 scaled = _positions[onBehalfOf].scaledDebt;
        uint256 debt = _debt(scaled, index);
        if (debt == 0) revert NoDebt(onBehalfOf);

        uint256 scaledRepaid;
        if (amount >= debt) {
            repaid = debt;
            scaledRepaid = scaled;
        } else {
            repaid = amount;
            // Rounded down: the borrower's debt falls by at most what they paid. Strictly below `scaled` because
            // amount < debt = ceil(scaled * index / RAY).
            scaledRepaid = Math.mulDiv(amount, RAY, index);
            if (scaledRepaid == 0) revert RepayTooSmall(amount);
        }
        uint256 newScaled = scaled - scaledRepaid;
        _positions[onBehalfOf].scaledDebt = SafeCast.toUint240(newScaled);
        totalScaledDebt -= scaledRepaid;
        _cash += repaid;
        emit Repaid(msg.sender, onBehalfOf, repaid, _debt(newScaled, index));
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), repaid);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Liquidation
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Repay part of an unhealthy account's debt and seize `collateralToken` at `fairValue` plus the bonus.
    /// @dev The account is liquidatable when `sum(collateral * lower * liqThreshold) < debt`, using each collateral's
    ///      latest report regardless of age (a missing report counts as zero), so nobody can shield a position by
    ///      attaching collateral whose report is stale. The seized token's report must be fresh and not flagged
    ///      corporate action. At most `CLOSE_FACTOR_BPS` of the debt is repaid per call; if the account lacks the
    ///      collateral to pay the bonus, the seizure is capped at its balance and the repay shrinks accordingly. If
    ///      that leaves the account with debt but no collateral at all, the remainder is written off against lenders
    ///      ({BadDebtRealized}) so the share price reflects reality immediately instead of carrying phantom debt.
    /// @param borrower Account to liquidate (not the caller).
    /// @param collateralToken Collateral to seize.
    /// @param repayAmount Maximum debt to repay (`type(uint256).max` for the close-factor maximum).
    /// @param minSeized Slippage guard: revert if fewer collateral units would be seized.
    /// @param receiver Recipient of the seized collateral.
    /// @return repaid Debt asset pulled from the caller.
    /// @return seized Collateral sent to `receiver`.
    function liquidate(
        address borrower,
        address collateralToken,
        uint256 repayAmount,
        uint256 minSeized,
        address receiver
    ) external nonReentrant whenNotPaused returns (uint256 repaid, uint256 seized) {
        if (borrower == msg.sender) revert SelfLiquidation();
        if (receiver == address(0)) revert ZeroAddress();
        if (repayAmount == 0) revert ZeroAmount();
        CollateralConfig memory cfg = _configs[collateralToken];
        if (!cfg.listed) revert CollateralNotListed(collateralToken);

        uint256 index = _accrue();
        Position memory pos = _positions[borrower];
        uint256 debt = _debt(pos.scaledDebt, index);
        {
            uint256 liquidationValue = _liquidationValue(borrower, pos.collateralMask);
            if (liquidationValue >= debt) revert PositionHealthy(borrower, liquidationValue, debt);
        }

        uint256 price = _seizeReport(collateralToken, cfg).fairValue;
        (repaid, seized) = _liquidationAmounts(borrower, collateralToken, cfg, debt, repayAmount, price);
        if (seized < minSeized) revert SeizeBelowMinimum(seized, minSeized);

        _applyLiquidation(borrower, collateralToken, cfg.index, pos, debt, index, repaid, seized);
        emit Liquidated(msg.sender, borrower, collateralToken, repaid, seized, price, receiver);
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), repaid);
        IERC20(collateralToken).safeTransfer(receiver, seized);
    }

    // ------------------------------------------------------------------------------------------------------------
    // ERC-4626 (lenders)
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Cash plus all outstanding debt including interest accrued up to now (aggregate rounded down).
    function totalAssets() public view override returns (uint256) {
        return _cash + Math.mulDiv(totalScaledDebt, _currentIndex(), RAY);
    }

    /// @dev 0 while paused (ERC-4626: max functions must reflect temporary disablement).
    function maxDeposit(address) public view override returns (uint256) {
        return paused() ? 0 : type(uint256).max;
    }

    /// @dev 0 while paused.
    function maxMint(address) public view override returns (uint256) {
        return paused() ? 0 : type(uint256).max;
    }

    /// @dev Bounded by the owner's share value and by idle cash; 0 while paused.
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (paused()) return 0;
        return Math.min(_convertToAssets(balanceOf(owner), Math.Rounding.Floor), _cash);
    }

    /// @dev Bounded by the owner's shares and by the shares idle cash can buy back; 0 while paused.
    function maxRedeem(address owner) public view override returns (uint256) {
        if (paused()) return 0;
        return Math.min(balanceOf(owner), _convertToShares(_cash, Math.Rounding.Floor));
    }

    function deposit(uint256 assets, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        return super.redeem(shares, receiver, owner);
    }

    /// @dev Shares were priced off the projected index; accruing here stores exactly that index.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _accrue();
        _cash += assets;
        super._deposit(caller, receiver, assets, shares);
    }

    /// @dev `assets <= _cash` is guaranteed by {maxWithdraw}/{maxRedeem}; the subtraction is checked regardless.
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _accrue();
        _cash -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Idle debt asset available for borrows and lender withdrawals.
    function cash() external view returns (uint256) {
        return _cash;
    }

    /// @notice Borrow index (ray) including interest accrued up to now.
    function borrowIndex() external view returns (uint256) {
        return _currentIndex();
    }

    /// @notice Timestamp of the last stored accrual.
    function lastAccrual() external view returns (uint256) {
        return _lastAccrual;
    }

    /// @notice All outstanding debt including accrued interest (rounded down, as in {totalAssets}).
    function totalDebt() external view returns (uint256) {
        return Math.mulDiv(totalScaledDebt, _currentIndex(), RAY);
    }

    /// @notice `account`'s debt including accrued interest (rounded up: what it takes to repay in full).
    function debtOf(address account) external view returns (uint256) {
        return _debt(_positions[account].scaledDebt, _currentIndex());
    }

    /// @notice `account`'s scaled (index-free) debt.
    function scaledDebtOf(address account) external view returns (uint256) {
        return _positions[account].scaledDebt;
    }

    /// @notice `account`'s balance of collateral `token`.
    function collateralOf(address account, address token) external view returns (uint256) {
        return _collateral[account][token];
    }

    /// @notice Every collateral token ever listed, in index order.
    function collateralTokens() external view returns (address[] memory) {
        return _collateralTokens;
    }

    /// @notice Stored configuration of `token` (all zero if never listed).
    function collateralConfig(address token) external view returns (CollateralConfig memory) {
        return _configs[token];
    }

    /// @notice Risk snapshot of `account` from the latest reports. Informational: it does not apply the staleness,
    ///         flag or band gates, so a borrow can still revert even if `borrowPower > debt`.
    function getAccountData(address account) external view returns (AccountData memory data) {
        Position memory pos = _positions[account];
        data.debt = _debt(pos.scaledDebt, _currentIndex());
        data.collateralMask = pos.collateralMask;
        uint256 mask = pos.collateralMask;
        for (uint256 i = 0; mask != 0; ++i) {
            if (mask & 1 != 0) {
                address token = _collateralTokens[i];
                CollateralConfig memory cfg = _configs[token];
                // Bounded (<= MAX_COLLATERALS) view call to the immutable, trusted oracle.
                // forge-lint: disable-next-line(calls-loop)
                (bool exists, INightshiftOracle.Report memory r) = oracle.tryGetReport(token);
                if (exists && ReportLib.isWellFormed(r)) {
                    uint256 amount = _collateral[account][token];
                    if (cfg.enabled) data.borrowPower += _valueBps(amount, r.lower, cfg.baseLtvBps, cfg.decimals);
                    data.liquidationValue += _valueBps(amount, r.lower, cfg.liqThresholdBps, cfg.decimals);
                }
            }
            mask >>= 1;
        }
        data.healthFactor = data.debt == 0 ? type(uint256).max : Math.mulDiv(data.liquidationValue, WAD, data.debt);
    }

    /// @notice Whether {liquidate} would accept `account` as unhealthy right now.
    function isLiquidatable(address account) external view returns (bool) {
        Position memory pos = _positions[account];
        uint256 debt = _debt(pos.scaledDebt, _currentIndex());
        return debt != 0 && _liquidationValue(account, pos.collateralMask) < debt;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Internal: interest
    // ------------------------------------------------------------------------------------------------------------

    /// @dev Stores the index projected to now and returns it.
    function _accrue() internal returns (uint256 index) {
        index = _borrowIndex;
        uint256 last = _lastAccrual;
        if (block.timestamp > last) {
            index = _grow(index, block.timestamp - last);
            _borrowIndex = SafeCast.toUint192(index);
            _lastAccrual = SafeCast.toUint64(block.timestamp);
            emit InterestAccrued(index, block.timestamp);
        }
    }

    function _currentIndex() internal view returns (uint256 index) {
        index = _borrowIndex;
        uint256 last = _lastAccrual;
        if (block.timestamp > last) index = _grow(index, block.timestamp - last);
    }

    /// @dev Simple interest over `elapsed`, compounded at every accrual: `index * (1 + rate * elapsed)`, rounded up.
    function _grow(uint256 index, uint256 elapsed) private view returns (uint256) {
        uint256 rate = borrowRatePerSecond;
        if (rate == 0) return index;
        return Math.mulDiv(index, RAY + rate * elapsed, RAY, Math.Rounding.Ceil);
    }

    function _setBorrowRate(uint256 aprBps) private {
        if (aprBps > MAX_BORROW_APR_BPS) revert InvalidBorrowRate(aprBps);
        _accrue();
        uint256 rate = Math.mulDiv(aprBps, RAY, BPS * SECONDS_PER_YEAR, Math.Rounding.Ceil);
        uint256 previousAprBps = borrowAprBps;
        borrowAprBps = aprBps;
        borrowRatePerSecond = rate;
        emit BorrowRateUpdated(previousAprBps, aprBps, rate);
    }

    /// @dev Debt in asset units for a scaled amount, rounded up.
    function _debt(uint256 scaled, uint256 index) private pure returns (uint256) {
        return Math.mulDiv(scaled, index, RAY, Math.Rounding.Ceil);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Internal: valuation and gates
    // ------------------------------------------------------------------------------------------------------------

    /// @dev `amount` collateral at `price` (USD, 1e8) times `factorBps`, in debt-asset units, rounded down.
    ///      Bounds: price < 2^128, factorBps <= 12_000 and 10^assetDecimals <= 1e18 keep the multiplier below 2^204;
    ///      mulDiv handles the 512-bit product with `amount`.
    function _valueBps(uint256 amount, uint256 price, uint256 factorBps, uint8 collateralDecimals)
        private
        view
        returns (uint256)
    {
        return Math.mulDiv(
            amount, price * factorBps * 10 ** _assetDecimals, 10 ** (uint256(collateralDecimals) + 8) * BPS
        );
    }

    /// @dev Reverts unless every *enabled* collateral of `account` passes the gates and `debt <= borrowing power`.
    ///      Disabled collateral contributes no borrowing power, so its report is irrelevant here.
    function _requireBorrowable(address account, uint256 mask, uint256 debt) private view {
        uint256 power = 0;
        for (uint256 i = 0; mask != 0; ++i) {
            if (mask & 1 != 0) {
                address token = _collateralTokens[i];
                CollateralConfig memory cfg = _configs[token];
                if (cfg.enabled) {
                    INightshiftOracle.Report memory r = _gatedReport(token, cfg);
                    power += _valueBps(_collateral[account][token], r.lower, cfg.baseLtvBps, cfg.decimals);
                }
            }
            mask >>= 1;
        }
        if (debt > power) revert InsufficientCollateral(account, debt, power);
    }

    /// @dev Sum of collateral * lower * liqThreshold over all of `account`'s collateral, from the latest reports of
    ///      any age. A missing (or malformed) report contributes zero; it never reverts, so it cannot be used to block
    ///      liquidations.
    function _liquidationValue(address account, uint256 mask) private view returns (uint256 value) {
        for (uint256 i = 0; mask != 0; ++i) {
            if (mask & 1 != 0) {
                address token = _collateralTokens[i];
                CollateralConfig memory cfg = _configs[token];
                // Bounded (<= MAX_COLLATERALS) view call to the immutable, trusted oracle.
                // forge-lint: disable-next-line(calls-loop)
                (bool exists, INightshiftOracle.Report memory r) = oracle.tryGetReport(token);
                if (exists && ReportLib.isWellFormed(r)) {
                    value += _valueBps(_collateral[account][token], r.lower, cfg.liqThresholdBps, cfg.decimals);
                }
            }
            mask >>= 1;
        }
    }

    /// @dev Latest report of `token`, reverting unless it may back new risk (borrows, collateral withdrawals).
    function _gatedReport(address token, CollateralConfig memory cfg)
        private
        view
        returns (INightshiftOracle.Report memory r)
    {
        r = _freshReport(token, cfg);
        if (r.flags & ReportLib.FLAG_DEGRADED != 0) revert DegradedReport(token);
        if (!ReportLib.bandWithin(r, cfg.maxBandBps)) revert BandTooWide(token, ReportLib.bandBps(r), cfg.maxBandBps);
    }

    /// @dev Latest report of `token` for pricing a seizure: must exist, be well formed, fresh and not flagged
    ///      corporate action. Degraded or wide-band reports are accepted: liquidations must keep working exactly when
    ///      uncertainty is high.
    function _seizeReport(address token, CollateralConfig memory cfg)
        private
        view
        returns (INightshiftOracle.Report memory)
    {
        return _freshReport(token, cfg);
    }

    function _freshReport(address token, CollateralConfig memory cfg)
        private
        view
        returns (INightshiftOracle.Report memory r)
    {
        bool exists;
        // Called per collateral from bounded (<= MAX_COLLATERALS) loops; view call to the immutable, trusted oracle.
        // forge-lint: disable-next-line(calls-loop)
        (exists, r) = oracle.tryGetReport(token);
        if (!exists) revert MissingReport(token);
        if (!ReportLib.isWellFormed(r)) revert MalformedReport(token);
        if (!ReportLib.isFreshAt(r.updatedAt, cfg.maxAge)) revert StaleReport(token, r.updatedAt, cfg.maxAge);
        if (r.flags & ReportLib.FLAG_CORPORATE_ACTION != 0) revert CorporateAction(token);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Internal: liquidation
    // ------------------------------------------------------------------------------------------------------------

    /// @dev Repay and seize amounts. `seized = repaid * (1 + bonus) / price` (rounded down); if that exceeds the
    ///      balance, everything is seized and `repaid` drops to the value of the balance net of bonus (rounded up).
    function _liquidationAmounts(
        address borrower,
        address token,
        CollateralConfig memory cfg,
        uint256 debt,
        uint256 repayAmount,
        uint256 price
    ) private view returns (uint256 repaid, uint256 seized) {
        uint256 balance = _collateral[borrower][token];
        if (balance == 0) revert NoCollateral(borrower, token);

        uint256 maxRepay = Math.mulDiv(debt, CLOSE_FACTOR_BPS, BPS, Math.Rounding.Ceil);
        repaid = repayAmount < maxRepay ? repayAmount : maxRepay;

        // collateral units per debt-asset unit, with the bonus: (BPS + bonus) * 10^(dec + 8) / (BPS * price * 10^assetDec)
        uint256 collateralScale = (BPS + cfg.liqBonusBps) * 10 ** (uint256(cfg.decimals) + 8);
        uint256 assetScale = BPS * price * 10 ** _assetDecimals;
        seized = Math.mulDiv(repaid, collateralScale, assetScale);
        if (seized > balance) {
            seized = balance;
            uint256 needed = Math.mulDiv(balance, assetScale, collateralScale, Math.Rounding.Ceil);
            if (needed < repaid) repaid = needed;
        }
        if (repaid == 0 || seized == 0) revert LiquidationTooSmall();
    }

    function _applyLiquidation(
        address borrower,
        address token,
        uint8 tokenIndex,
        Position memory pos,
        uint256 debt,
        uint256 index,
        uint256 repaid,
        uint256 seized
    ) private {
        uint256 scaled = pos.scaledDebt;
        // repaid <= maxRepay <= debt. Partial repays remove scaled debt rounded down (capped at the balance).
        uint256 scaledRepaid = repaid >= debt ? scaled : Math.min(Math.mulDiv(repaid, RAY, index), scaled);
        scaled -= scaledRepaid;
        uint256 totalScaled = totalScaledDebt - scaledRepaid;
        _cash += repaid;

        uint256 remaining = _collateral[borrower][token] - seized;
        _collateral[borrower][token] = remaining;
        totalCollateral[token] -= seized;
        uint16 mask = pos.collateralMask;
        if (remaining == 0) mask &= ~_bit(tokenIndex);

        if (mask == 0 && scaled != 0) {
            // Nothing left to seize: socialize the shortfall now rather than carry unbacked debt in totalAssets.
            emit BadDebtRealized(borrower, _debt(scaled, index));
            totalScaled -= scaled;
            scaled = 0;
        }
        totalScaledDebt = totalScaled;
        _positions[borrower] = Position({scaledDebt: SafeCast.toUint240(scaled), collateralMask: mask});
    }

    /// @dev Mask bit of collateral `index`. The shift is done in uint16: `1 << index` with a uint8 index would be
    ///      evaluated in uint8 and silently become 0 for indexes >= 8.
    function _bit(uint8 index) private pure returns (uint16) {
        return uint16(1) << index;
    }

    function _validateParams(CollateralParams calldata p) private pure {
        if (p.baseLtvBps >= p.liqThresholdBps || p.liqThresholdBps >= BPS) {
            revert InvalidLtv(p.baseLtvBps, p.liqThresholdBps);
        }
        if (p.liqBonusBps > MAX_LIQ_BONUS_BPS || uint256(p.liqThresholdBps) * (BPS + p.liqBonusBps) > BPS * BPS) {
            revert InvalidLiquidationBonus(p.liqBonusBps, p.liqThresholdBps);
        }
        if (p.maxBandBps == 0 || p.maxBandBps > BPS) revert InvalidMaxBand(p.maxBandBps);
        if (p.maxAge == 0 || p.maxAge > MAX_REPORT_MAX_AGE) revert InvalidMaxAge(p.maxAge);
    }
}
