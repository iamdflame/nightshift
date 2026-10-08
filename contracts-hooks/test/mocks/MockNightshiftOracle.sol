// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INightshiftOracle} from "../../src/interfaces/INightshiftOracle.sol";

/// @notice Settable Fair Value Feed v1 with switchable failure modes, to prove the hook never reverts swaps.
contract MockNightshiftOracle is INightshiftOracle {
    enum Mode {
        Normal,
        Revert, // getReport reverts
        ShortData, // returns 64 bytes instead of 256
        DirtyData, // fairValue word has bits above 128 set
        BurnGas // loops until the hook's gas cap runs out
    }

    mapping(address token => Report) internal _reports;
    Mode public mode;

    function setReport(address token, Report memory r) public {
        _reports[token] = r;
        emit ReportPosted(token, r.round, r.fairValue, r.lower, r.upper, r.session, r.flags);
    }

    /// @notice Convenience setter: fresh report at block.timestamp with the next open 13 hours away.
    function post(address token, uint128 fairValue, uint128 lower, uint128 upper, uint8 session, uint8 flags) external {
        Report memory r = _reports[token];
        setReport(
            token,
            Report({
                fairValue: fairValue,
                lower: lower,
                upper: upper,
                anchorTime: uint64(block.timestamp + 13 hours),
                updatedAt: uint64(block.timestamp),
                round: r.round + 1,
                session: session,
                flags: flags
            })
        );
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function getReport(address token) external view returns (Report memory r) {
        Mode m = mode;
        if (m == Mode.Revert) revert("oracle down");
        if (m == Mode.BurnGas) {
            uint256 i;
            while (true) {
                unchecked {
                    ++i;
                }
            }
        }
        r = _reports[token];
        if (m == Mode.ShortData) {
            assembly ("memory-safe") {
                return(r, 0x40)
            }
        }
        if (m == Mode.DirtyData) {
            assembly ("memory-safe") {
                mstore(r, or(mload(r), shl(200, 1)))
                return(r, 0x100)
            }
        }
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }
}

/// @notice An oracle that reports the wrong decimals (must be rejected at configuration).
contract WrongDecimalsOracle {
    function decimals() external pure returns (uint8) {
        return 18;
    }
}
