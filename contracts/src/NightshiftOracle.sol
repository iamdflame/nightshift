// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin-contracts/access/Ownable2Step.sol";
import {EnumerableSet} from "@openzeppelin-contracts/utils/structs/EnumerableSet.sol";

import {NightshiftFeed} from "./NightshiftFeed.sol";
import {INightshiftOracle, INightshiftOracleExtended} from "./interfaces/INightshiftOracle.sol";
import {ReportLib} from "./libraries/ReportLib.sol";

/// @title NightshiftOracle
/// @author Nightshift
/// @notice On-chain store of Nightshift fair-value reports: a fair value now plus a calibrated 5–95% band for the
///         token's value at the next US regular-session open. Reports are pushed in batches by allowlisted reporters
///         (the aggregator agents); everything else (Chainlink feeds, the Venus adapter, the credit market) reads here.
/// @dev Trust model: reporters are trusted to post honest numbers; the contract enforces only the structural
///      invariants of the spec (`0 < lower <= fairValue <= upper`, `updatedAt <= now`, `anchorTime >= updatedAt`,
///      strictly increasing `round`, `session <= 5`) plus non-decreasing `updatedAt` per token, so a buggy or
///      replayed batch can never move a token's clock backwards. Batches are atomic: one invalid report reverts the
///      whole batch with an error naming the offending token.
contract NightshiftOracle is INightshiftOracleExtended, Ownable2Step {
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _reporters;
    mapping(address token => Report) private _reports;

    /// @notice Feed deployed for `token` by {createFeed} (zero if none).
    mapping(address token => address feed) public feedOf;
    address[] private _feedTokens;

    /// @notice A reporter was added to or removed from the allowlist.
    event ReporterUpdated(address indexed reporter, bool enabled);
    /// @notice A Chainlink-compatible feed was deployed for `token`.
    event FeedCreated(address indexed token, address indexed feed);

    error NotReporter(address caller);
    error ZeroAddress();
    error ReporterUnchanged(address reporter, bool enabled);
    error EmptyBatch();
    error LengthMismatch(uint256 tokens, uint256 reports);
    error NoReport(address token);
    error InvalidPrices(address token, uint128 lower, uint128 fairValue, uint128 upper);
    error FutureReport(address token, uint64 updatedAt, uint256 blockTimestamp);
    error AnchorBeforeUpdate(address token, uint64 anchorTime, uint64 updatedAt);
    error NonMonotonicRound(address token, uint64 round, uint64 lastRound);
    error NonMonotonicTimestamp(address token, uint64 updatedAt, uint64 lastUpdatedAt);
    error InvalidSession(address token, uint8 session);
    error FeedExists(address token, address feed);
    error NotAContract(address token);
    error RenounceDisabled();

    modifier onlyReporter() {
        if (!_reporters.contains(msg.sender)) revert NotReporter(msg.sender);
        _;
    }

    /// @param initialOwner Owner allowed to manage reporters and create feeds (Ownable2Step).
    constructor(address initialOwner) Ownable(initialOwner) {}

    // ------------------------------------------------------------------------------------------------------------
    // Owner
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Add (`enabled = true`) or remove a reporter. Reverts on a no-op so mistakes surface.
    function setReporter(address reporter, bool enabled) external onlyOwner {
        if (reporter == address(0)) revert ZeroAddress();
        bool changed = enabled ? _reporters.add(reporter) : _reporters.remove(reporter);
        if (!changed) revert ReporterUnchanged(reporter, enabled);
        emit ReporterUpdated(reporter, enabled);
    }

    /// @notice Deploy the {NightshiftFeed} for `token` with CREATE2 (salt = token), one per token.
    /// @dev The address is predictable through {predictFeed} before deployment. Owner-only so the feed registry only
    ///      contains tokens Nightshift actually covers.
    /// @return feed The new feed's address.
    function createFeed(address token) external onlyOwner returns (address feed) {
        if (token == address(0)) revert ZeroAddress();
        if (token.code.length == 0) revert NotAContract(token);
        address existing = feedOf[token];
        if (existing != address(0)) revert FeedExists(token, existing);

        feed = address(new NightshiftFeed{salt: _feedSalt(token)}(INightshiftOracle(address(this)), token));
        feedOf[token] = feed;
        _feedTokens.push(token);
        // The only external call above is the feed constructor's bounded `staticcall` to `token.symbol()`, which
        // cannot re-enter state-changing code.
        // forge-lint: disable-next-line(reentrancy-events)
        emit FeedCreated(token, feed);
    }

    /// @notice Ownership can only be transferred (two-step), never renounced: an ownerless oracle could not rotate a
    ///         compromised reporter.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------------------------------------------------------
    // Reporters
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Post one report per token, atomically.
    /// @dev A token may appear several times in one batch; each occurrence must still increase `round`.
    /// @param tokens Tokens being reported.
    /// @param reports Reports, index-aligned with `tokens`.
    function postReports(address[] calldata tokens, Report[] calldata reports) external onlyReporter {
        uint256 n = tokens.length;
        if (n == 0) revert EmptyBatch();
        if (n != reports.length) revert LengthMismatch(n, reports.length);

        for (uint256 i; i < n; ++i) {
            address token = tokens[i];
            Report calldata r = reports[i];
            _validate(token, r);
            _reports[token] = r;
            emit ReportPosted(token, r.round, r.fairValue, r.lower, r.upper, r.session, r.flags);
        }
    }

    // ------------------------------------------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------------------------------------------

    /// @inheritdoc INightshiftOracle
    function getReport(address token) external view returns (Report memory report) {
        report = _reports[token];
        if (report.round == 0) revert NoReport(token);
    }

    /// @inheritdoc INightshiftOracleExtended
    function tryGetReport(address token) external view returns (bool exists, Report memory report) {
        report = _reports[token];
        exists = report.round != 0;
    }

    /// @inheritdoc INightshiftOracleExtended
    function isFresh(address token, uint256 maxAge) external view returns (bool) {
        Report storage r = _reports[token];
        return r.round != 0 && ReportLib.isFreshAt(r.updatedAt, maxAge);
    }

    /// @inheritdoc INightshiftOracle
    function decimals() external pure returns (uint8) {
        return 8;
    }

    /// @notice Whether `account` may post reports.
    function isReporter(address account) external view returns (bool) {
        return _reporters.contains(account);
    }

    /// @notice All current reporters.
    function reporters() external view returns (address[] memory) {
        return _reporters.values();
    }

    /// @notice Tokens that have a feed, in creation order.
    function feedTokens() external view returns (address[] memory) {
        return _feedTokens;
    }

    /// @notice CREATE2 address the feed for `token` has (or will have).
    function predictFeed(address token) external view returns (address) {
        bytes32 initCodeHash = keccak256(
            bytes.concat(type(NightshiftFeed).creationCode, abi.encode(INightshiftOracle(address(this)), token))
        );
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), _feedSalt(token), initCodeHash))))
        );
    }

    // ------------------------------------------------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------------------------------------------------

    /// @dev Round 0 is reserved for "no report", so the first accepted round is 1 (`round > 0 == lastRound`).
    function _validate(address token, Report calldata r) private view {
        if (token == address(0)) revert ZeroAddress();
        if (r.lower == 0 || r.lower > r.fairValue || r.fairValue > r.upper) {
            revert InvalidPrices(token, r.lower, r.fairValue, r.upper);
        }
        if (r.updatedAt > block.timestamp) revert FutureReport(token, r.updatedAt, block.timestamp);
        if (r.anchorTime < r.updatedAt) revert AnchorBeforeUpdate(token, r.anchorTime, r.updatedAt);
        if (r.session > ReportLib.MAX_SESSION) revert InvalidSession(token, r.session);

        Report storage last = _reports[token];
        uint64 lastRound = last.round;
        if (r.round <= lastRound) revert NonMonotonicRound(token, r.round, lastRound);
        uint64 lastUpdatedAt = last.updatedAt;
        if (r.updatedAt < lastUpdatedAt) revert NonMonotonicTimestamp(token, r.updatedAt, lastUpdatedAt);
    }

    function _feedSalt(address token) private pure returns (bytes32) {
        return bytes32(uint256(uint160(token)));
    }
}
