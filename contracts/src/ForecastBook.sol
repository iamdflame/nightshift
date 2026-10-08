// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC721} from "@openzeppelin-contracts/token/ERC721/IERC721.sol";
import {MerkleProof} from "@openzeppelin-contracts/utils/cryptography/MerkleProof.sol";
import {SafeCast} from "@openzeppelin-contracts/utils/math/SafeCast.sol";

/// @title ForecastBook
/// @author Nightshift
/// @notice Commit registry that gives forecaster agents verifiable "proof of foresight".
///
///         Before the next US open, a forecaster commits the Merkle root of its whole forecast set for a round. The
///         commitment is immutable and timestamped on-chain, so anyone can later prove that a specific forecast
///         (token, median, 5–95% band) was fixed before the outcome was observable, then score it against the tape.
///
///         Lifecycle per (forecaster, round):
///           1. {commit}  root + leaf count, strictly before `anchorTime`; one commitment, never overwritten.
///           2. {reveal}  once, the URI where the full leaf set lives (IPFS/HTTPS/...), any time after commit.
///           3. {verifyForecast} anyone checks a single leaf against the commitment with a Merkle proof.
///
/// ## Leaf encoding (must match the off-chain TypeScript builder byte for byte)
///
///         leafHash = keccak256(bytes.concat(keccak256(abi.encode(
///             uint64  round,       // == the commitment's round
///             address token,       // tokenized stock (e.g. NVDAB)
///             uint128 medianE8,    // forecast median, USD per token, 8 decimals
///             uint128 lowerE8,     // forecast 5th percentile, USD per token, 8 decimals
///             uint128 upperE8,     // forecast 95th percentile, USD per token, 8 decimals
///             uint64  anchorTime   // == the commitment's anchorTime (unix seconds of the open being forecast)
///         ))))
///
///         `abi.encode` left-pads every field to 32 bytes, so the preimage is exactly 6 * 32 = 192 bytes. The double
///         hash prevents second-preimage attacks (a 64-byte internal node can never be passed off as a leaf). Internal
///         nodes are `keccak256(min(a, b) ++ max(a, b))` (OpenZeppelin `MerkleProof`, sorted pairs), so proofs carry
///         no left/right flags.
///
///         This is exactly the StandardMerkleTree of OpenZeppelin's JavaScript merkle-tree library (npm package
///         "openzeppelin/merkle-tree" under the OpenZeppelin scope) with leaf types
///         `["uint64","address","uint128","uint128","uint128","uint64"]`; building the tree with
///         `StandardMerkleTree.of(values, types)` yields a root and proofs this contract accepts. A fixed test vector
///         (four leaves and their root) lives in `test/ForecastBook.t.sol` and `docs/contracts.md`.
///
/// ## ERC-8004 identity (optional)
///
///         If constructed with an ERC-8004 Identity Registry (an ERC-721 whose tokenIds are agentIds), a forecaster can
///         bind its address to an agent with {linkAgent}; the registry must report the caller as the agent's owner.
///         Passing `address(0)` disables linking.
contract ForecastBook {
    /// @notice One forecast inside a committed set. Field order and types define the leaf encoding above.
    struct Leaf {
        uint64 round;
        address token;
        uint128 medianE8;
        uint128 lowerE8;
        uint128 upperE8;
        uint64 anchorTime;
    }

    /// @notice A forecaster's commitment for one round.
    struct Commitment {
        bytes32 root; // Merkle root of the forecast set (non-zero once committed)
        uint64 anchorTime; // open being forecast; commit happened strictly before it
        uint64 committedAt; // block timestamp of the commit (the foresight proof)
        uint32 count; // number of leaves the forecaster declares in the set (informational)
        bool revealed; // whether {reveal} was called
    }

    /// @notice ERC-8004 Identity Registry (ERC-721), or zero when agent linking is disabled.
    IERC721 public immutable identityRegistry;

    mapping(address forecaster => mapping(uint64 round => Commitment)) private _commitments;
    mapping(address forecaster => mapping(uint64 round => string)) private _uris;
    /// @dev agentId + 1, so that agentId 0 (valid in ERC-8004) is distinguishable from "not linked".
    mapping(address forecaster => uint256) private _agentIdPlusOne;

    event ForecastCommitted(
        address indexed forecaster, uint64 indexed round, uint64 anchorTime, bytes32 root, uint32 count
    );
    event ForecastRevealed(address indexed forecaster, uint64 indexed round, string uri);
    event AgentLinked(address indexed forecaster, uint256 indexed agentId);
    event AgentUnlinked(address indexed forecaster, uint256 indexed agentId);

    error EmptyRoot();
    error EmptyCount();
    error CommitTooLate(uint64 anchorTime, uint256 blockTimestamp);
    error AlreadyCommitted(address forecaster, uint64 round);
    error NoCommitment(address forecaster, uint64 round);
    error AlreadyRevealed(address forecaster, uint64 round);
    error EmptyUri();
    error IdentityRegistryDisabled();
    error UnknownAgent(uint256 agentId);
    error NotAgentOwner(uint256 agentId, address caller, address owner);
    error NoLinkedAgent(address forecaster);

    /// @param identityRegistry_ ERC-8004 Identity Registry, or `address(0)` to disable {linkAgent}.
    constructor(IERC721 identityRegistry_) {
        identityRegistry = identityRegistry_;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Forecasts
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Commit the Merkle root of the caller's forecast set for `round`.
    /// @param round Round identifier; one commitment per (caller, round), immutable once written.
    /// @param anchorTime Unix seconds of the open being forecast; must be strictly in the future.
    /// @param root Merkle root (see the leaf encoding in the contract docs); must be non-zero.
    /// @param count Number of leaves in the set; must be non-zero.
    function commit(uint64 round, uint64 anchorTime, bytes32 root, uint32 count) external {
        if (root == bytes32(0)) revert EmptyRoot();
        if (count == 0) revert EmptyCount();
        if (block.timestamp >= anchorTime) revert CommitTooLate(anchorTime, block.timestamp);
        Commitment storage c = _commitments[msg.sender][round];
        if (c.root != bytes32(0)) revert AlreadyCommitted(msg.sender, round);

        c.root = root;
        c.anchorTime = anchorTime;
        c.committedAt = SafeCast.toUint64(block.timestamp);
        c.count = count;
        emit ForecastCommitted(msg.sender, round, anchorTime, root, count);
    }

    /// @notice Publish where the full forecast set for `round` lives. Callable once per commitment, at any time.
    function reveal(uint64 round, string calldata uri) external {
        if (bytes(uri).length == 0) revert EmptyUri();
        Commitment storage c = _commitments[msg.sender][round];
        if (c.root == bytes32(0)) revert NoCommitment(msg.sender, round);
        if (c.revealed) revert AlreadyRevealed(msg.sender, round);

        c.revealed = true;
        _uris[msg.sender][round] = uri;
        emit ForecastRevealed(msg.sender, round, uri);
    }

    /// @notice Whether `leaf` belongs to `forecaster`'s commitment for `round`.
    /// @dev True iff a commitment exists, `leaf.round == round`, `leaf.anchorTime` equals the commitment's
    ///      `anchorTime` (so every verified leaf was fixed strictly before the open it forecasts), and `proof` links
    ///      the leaf hash to the committed root. Never reverts.
    function verifyForecast(address forecaster, uint64 round, Leaf calldata leaf, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        Commitment storage c = _commitments[forecaster][round];
        bytes32 root = c.root;
        if (root == bytes32(0) || leaf.round != round || leaf.anchorTime != c.anchorTime) return false;
        return MerkleProof.verifyCalldata(proof, root, leafHash(leaf));
    }

    /// @notice The leaf hash for `leaf`, exactly as committed trees must compute it.
    function leafHash(Leaf calldata leaf) public pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                keccak256(
                    abi.encode(leaf.round, leaf.token, leaf.medianE8, leaf.lowerE8, leaf.upperE8, leaf.anchorTime)
                )
            )
        );
    }

    /// @notice A forecaster's commitment for `round` (all zero if none).
    function getCommitment(address forecaster, uint64 round) external view returns (Commitment memory) {
        return _commitments[forecaster][round];
    }

    /// @notice The revealed URI for (`forecaster`, `round`), empty if not revealed.
    function revealedUri(address forecaster, uint64 round) external view returns (string memory) {
        return _uris[forecaster][round];
    }

    // ------------------------------------------------------------------------------------------------------------
    // ERC-8004 identity
    // ------------------------------------------------------------------------------------------------------------

    /// @notice Bind the caller to ERC-8004 agent `agentId`. The registry must report the caller as its owner.
    /// @dev Re-linking to another agent overwrites the previous link.
    function linkAgent(uint256 agentId) external {
        IERC721 registry = identityRegistry;
        if (address(registry) == address(0)) revert IdentityRegistryDisabled();
        // agentId + 1 is stored; the largest id cannot be represented (and no registry mints it in practice).
        if (agentId == type(uint256).max) revert UnknownAgent(agentId);
        (bool known, address owner) = _tryOwnerOf(registry, agentId);
        if (!known) revert UnknownAgent(agentId);
        if (owner != msg.sender) revert NotAgentOwner(agentId, msg.sender, owner);

        _agentIdPlusOne[msg.sender] = agentId + 1;
        emit AgentLinked(msg.sender, agentId);
    }

    /// @notice Remove the caller's agent link.
    function unlinkAgent() external {
        uint256 stored = _agentIdPlusOne[msg.sender];
        if (stored == 0) revert NoLinkedAgent(msg.sender);
        delete _agentIdPlusOne[msg.sender];
        emit AgentUnlinked(msg.sender, stored - 1);
    }

    /// @notice The agent `forecaster` linked, if any.
    function linkedAgent(address forecaster) external view returns (bool linked, uint256 agentId) {
        uint256 stored = _agentIdPlusOne[forecaster];
        if (stored != 0) return (true, stored - 1);
    }

    /// @notice Whether `forecaster` linked an agent and still owns it in the registry (links go stale if the agent
    ///         NFT is transferred). Returns false (instead of reverting) for agents the registry does not know.
    function isLinkCurrent(address forecaster) external view returns (bool) {
        uint256 stored = _agentIdPlusOne[forecaster];
        IERC721 registry = identityRegistry;
        if (stored == 0 || address(registry) == address(0)) return false;
        (bool known, address owner) = _tryOwnerOf(registry, stored - 1);
        return known && owner == forecaster;
    }

    /// @dev `ownerOf` without bubbling the registry's revert for unknown ids.
    function _tryOwnerOf(IERC721 registry, uint256 agentId) private view returns (bool known, address owner) {
        try registry.ownerOf(agentId) returns (address o) {
            return (true, o);
        } catch {
            return (false, address(0));
        }
    }
}
