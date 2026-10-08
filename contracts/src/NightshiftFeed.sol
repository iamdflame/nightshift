// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Strings} from "@openzeppelin-contracts/utils/Strings.sol";

import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {INightshiftOracle} from "./interfaces/INightshiftOracle.sol";

/// @title NightshiftFeed
/// @author Nightshift
/// @notice Chainlink `AggregatorV3Interface` adapter for one token's Nightshift fair value.
///
///         Mapping from a Nightshift report:
///           roundId = answeredInRound = report.round
///           answer                    = int256(report.fairValue)            (USD per token, 8 decimals)
///           startedAt = updatedAt     = report.updatedAt
///
///         The next-open band, which has no Chainlink equivalent, is exposed through {band}.
/// @dev Deployed by {NightshiftOracle.createFeed} with CREATE2 (salt = token), one feed per token. The feed is a pure
///      view adapter: it never filters on staleness or flags. Chainlink consumers are expected to check `updatedAt`
///      themselves, and Nightshift-aware consumers should read {band} for `flags`. The oracle only stores the latest
///      report, so {getRoundData} serves the latest round only.
contract NightshiftFeed is AggregatorV3Interface {
    /// @notice Version of this adapter, returned by {version}.
    uint256 public constant VERSION = 1;

    /// @dev Upper bound on gas forwarded to `token.symbol()` at construction, so a hostile token cannot gas-grief
    ///      feed creation. A failed read falls back to the token's hex address.
    uint256 private constant SYMBOL_GAS_LIMIT = 100_000;

    /// @dev Longest symbol accepted verbatim; anything longer falls back to the token's hex address.
    uint256 private constant MAX_SYMBOL_LENGTH = 64;

    /// @notice The Nightshift oracle this feed reads from.
    INightshiftOracle public immutable oracle;

    /// @notice The token this feed prices.
    address public immutable token;

    string private _description;

    /// @notice `getRoundData` was asked for a round the oracle no longer (or never) stores.
    error RoundNotAvailable(uint80 requested, uint80 latest);

    /// @param oracle_ The Nightshift oracle (the deployer when created through the factory).
    /// @param token_ The token to price. Its `symbol()` is read once to build {description}.
    constructor(INightshiftOracle oracle_, address token_) {
        oracle = oracle_;
        token = token_;
        _description = string.concat(_readSymbol(token_), " / USD (Nightshift)");
    }

    /// @inheritdoc AggregatorV3Interface
    function decimals() external pure returns (uint8) {
        return 8;
    }

    /// @inheritdoc AggregatorV3Interface
    /// @dev e.g. "NVDAB / USD (Nightshift)".
    function description() external view returns (string memory) {
        return _description;
    }

    /// @inheritdoc AggregatorV3Interface
    function version() external pure returns (uint256) {
        return VERSION;
    }

    /// @inheritdoc AggregatorV3Interface
    /// @dev Only the latest round is stored, so any other `_roundId` reverts with {RoundNotAvailable}. Reverts with the
    ///      oracle's `NoReport` if the token was never reported.
    function getRoundData(uint80 _roundId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        INightshiftOracle.Report memory r = oracle.getReport(token);
        if (_roundId != r.round) revert RoundNotAvailable(_roundId, r.round);
        return _roundData(r);
    }

    /// @inheritdoc AggregatorV3Interface
    /// @dev Reverts with the oracle's `NoReport` if the token was never reported.
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return _roundData(oracle.getReport(token));
    }

    /// @notice The next-open band of the latest report.
    /// @return lower 5th percentile of the token's value at `anchorTime` (USD, 8 decimals).
    /// @return upper 95th percentile of the token's value at `anchorTime` (USD, 8 decimals).
    /// @return anchorTime Unix seconds of the next regular-session open.
    /// @return session Underlying session at `updatedAt` (0 regular … 5 halted).
    /// @return flags Report flags (bit0 corporate action, bit1 reference stale, bit2 thin liquidity, bit3 degraded).
    function band() external view returns (uint128 lower, uint128 upper, uint64 anchorTime, uint8 session, uint8 flags) {
        INightshiftOracle.Report memory r = oracle.getReport(token);
        return (r.lower, r.upper, r.anchorTime, r.session, r.flags);
    }

    /// @notice The full latest report (convenience passthrough to the oracle).
    function latestReport() external view returns (INightshiftOracle.Report memory) {
        return oracle.getReport(token);
    }

    function _roundData(INightshiftOracle.Report memory r)
        private
        pure
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        // Lossless: uint64 -> uint80 and uint128 -> int256 always fit.
        roundId = uint80(r.round);
        answer = int256(uint256(r.fairValue));
        startedAt = r.updatedAt;
        updatedAt = r.updatedAt;
        answeredInRound = roundId;
    }

    /// @dev Reads `symbol()` defensively. Accepts the standard ABI string encoding and the legacy bytes32 encoding;
    ///      anything else (revert, empty, malformed, oversized, out of gas) yields the token's hex address.
    function _readSymbol(address token_) private view returns (string memory) {
        (bool ok, bytes memory data) = token_.staticcall{gas: SYMBOL_GAS_LIMIT}(abi.encodeWithSignature("symbol()"));
        if (ok) {
            if (data.length == 32) {
                bytes32 raw = bytes32(data);
                uint256 n;
                while (n < 32 && raw[n] != 0) ++n;
                if (n != 0) {
                    bytes memory out = new bytes(n);
                    for (uint256 i; i < n; ++i) {
                        out[i] = raw[i];
                    }
                    return string(out);
                }
            } else if (data.length >= 64) {
                uint256 offset;
                uint256 len;
                assembly ("memory-safe") {
                    offset := mload(add(data, 0x20))
                    len := mload(add(data, 0x40))
                }
                // Validated before decoding so abi.decode cannot revert.
                if (offset == 32 && len != 0 && len <= MAX_SYMBOL_LENGTH && data.length >= 64 + len) {
                    return abi.decode(data, (string));
                }
            }
        }
        return Strings.toHexString(token_);
    }
}
