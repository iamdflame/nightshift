// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin-contracts/token/ERC721/ERC721.sol";

import {INightshiftOracle, INightshiftOracleExtended} from "../../src/interfaces/INightshiftOracle.sol";

/// @dev Plain mintable ERC-20 with configurable decimals.
contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _dec = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

/// @dev Burns 1% of every transfer (fee-on-transfer).
contract FeeOnTransferToken is MockERC20 {
    constructor() MockERC20("Fee Token", "FEE", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

/// @dev Token that, once armed, makes one arbitrary call from inside its transfer hook (reentrancy probe).
contract ReentrantToken is MockERC20 {
    address public target;
    bytes public payload;

    constructor() MockERC20("Reentrant", "RE", 18) {}

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        address t = target;
        if (t != address(0)) {
            target = address(0);
            (bool ok, bytes memory ret) = t.call(payload);
            if (!ok) {
                assembly ("memory-safe") {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
    }
}

/// @dev No `decimals()` at all.
contract NoDecimalsToken {
    function symbol() external pure returns (string memory) {
        return "NODEC";
    }
}

/// @dev Legacy bytes32 `symbol()` (MKR style).
contract Bytes32SymbolToken {
    function symbol() external pure returns (bytes32) {
        return "MKR";
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }
}

/// @dev `symbol()` reverts.
contract RevertingSymbolToken {
    function symbol() external pure returns (string memory) {
        revert("no symbol");
    }
}

/// @dev Returns raw bytes from `symbol()` so tests can feed malformed encodings.
contract RawSymbolToken {
    bytes private _raw;

    constructor(bytes memory raw_) {
        _raw = raw_;
    }

    fallback() external {
        bytes memory raw = _raw;
        assembly ("memory-safe") {
            return(add(raw, 0x20), mload(raw))
        }
    }
}

/// @dev ERC-8004-style identity registry: an ERC-721 whose token ids are agent ids.
contract MockIdentityRegistry is ERC721 {
    constructor() ERC721("Agent", "AGENT") {}

    function mint(address to, uint256 agentId) external {
        _mint(to, agentId);
    }
}

/// @dev Oracle double that stores whatever it is given (no validation), for testing consumers' defenses.
contract MockNightshiftOracle is INightshiftOracleExtended {
    mapping(address => Report) private _reports;
    mapping(address => bool) private _exists;

    function set(address token, Report memory r) external {
        _reports[token] = r;
        _exists[token] = true;
    }

    function getReport(address token) external view returns (Report memory) {
        require(_exists[token], "no report");
        return _reports[token];
    }

    function tryGetReport(address token) external view returns (bool, Report memory) {
        return (_exists[token], _reports[token]);
    }

    function isFresh(address token, uint256 maxAge) external view returns (bool) {
        return _exists[token] && block.timestamp - _reports[token].updatedAt <= maxAge;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }
}
