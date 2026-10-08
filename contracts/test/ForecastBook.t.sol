// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC721} from "@openzeppelin-contracts/token/ERC721/IERC721.sol";
import {Hashes} from "@openzeppelin-contracts/utils/cryptography/Hashes.sol";
import {console2} from "forge-std/console2.sol";

import {ForecastBook} from "../src/ForecastBook.sol";
import {MockIdentityRegistry} from "./mocks/Mocks.sol";
import {Fixtures} from "./utils/Fixtures.sol";

contract ForecastBookTest is Fixtures {
    ForecastBook internal book;
    MockIdentityRegistry internal registry;
    address internal forecaster = makeAddr("forecaster");

    // ---- Fixed test vector (also in docs/contracts.md). Computed independently with `cast` (abi-encode + keccak).
    uint64 internal constant V_ROUND = 42;
    uint64 internal constant V_ANCHOR = 1_791_811_800; // MON_OPEN
    address internal constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address internal constant TSLAB = 0x5b1910eAaD6450E50f816082Aa078C41F10C292f;
    address internal constant SPYB = 0x7138b48df7D98D7e3cc221BfE7192D0a178182D8;
    address internal constant TEST_TOKEN = 0x1111111111111111111111111111111111111111;
    bytes32 internal constant LEAF_NVDAB = 0xb6476578ac615829d4157df6a99711134873b67ecee1e2d54b5fa1d7fd97184f;
    bytes32 internal constant LEAF_TSLAB = 0x94be875fcafb102fd7b1465e8a092e1a576936504a20b2ec35f0ee0031783e0f;
    bytes32 internal constant LEAF_SPYB = 0x86356732510532068af2acbb3392dabdffe9f61f5c292b4c0de0f41b12f46a20;
    bytes32 internal constant LEAF_TEST = 0x3b97602ef9fd456d397b71f714fb4ea53a4f42c8d96810682f4f44b48213c13c;
    bytes32 internal constant NODE_01 = 0x137e0ef1e5b797697be421d8bb17109053a455deb7575efd4fce25478e83aaf6;
    bytes32 internal constant NODE_23 = 0x4bf1a9b1ac5ecd5d875f799a6cc282b8f9a1bead946afea49e3ddc456dc3576e;
    bytes32 internal constant VECTOR_ROOT = 0xe06290fea4ba91b76f45affd9b48dfa50d4c69c815c8241f3a4e90d3cd9d2fb0;

    event ForecastCommitted(
        address indexed forecaster, uint64 indexed round, uint64 anchorTime, bytes32 root, uint32 count
    );
    event ForecastRevealed(address indexed forecaster, uint64 indexed round, string uri);
    event AgentLinked(address indexed forecaster, uint256 indexed agentId);
    event AgentUnlinked(address indexed forecaster, uint256 indexed agentId);

    function setUp() public {
        vm.warp(SAT);
        registry = new MockIdentityRegistry();
        book = new ForecastBook(IERC721(address(registry)));
    }

    function _vectorLeaves() internal pure returns (ForecastBook.Leaf[4] memory l) {
        l[0] = ForecastBook.Leaf(V_ROUND, NVDAB, 236e8, 220e8, 250e8, V_ANCHOR);
        l[1] = ForecastBook.Leaf(V_ROUND, TSLAB, 430e8, 400e8, 460e8, V_ANCHOR);
        l[2] = ForecastBook.Leaf(V_ROUND, SPYB, 670e8, 655e8, 685e8, V_ANCHOR);
        l[3] = ForecastBook.Leaf(V_ROUND, TEST_TOKEN, 1e8, 0.95e8, 1.05e8, V_ANCHOR);
    }

    /// Proofs in the OpenZeppelin StandardMerkleTree layout: sorted leaves (TEST, SPYB, TSLAB, NVDAB) paired 0-1, 2-3.
    function _vectorProof(uint256 i) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](2);
        if (i == 0) (p[0], p[1]) = (LEAF_TSLAB, NODE_01); // NVDAB
        if (i == 1) (p[0], p[1]) = (LEAF_NVDAB, NODE_01); // TSLAB
        if (i == 2) (p[0], p[1]) = (LEAF_TEST, NODE_23); // SPYB
        if (i == 3) (p[0], p[1]) = (LEAF_SPYB, NODE_23); // TEST
    }

    function _commitVector() internal {
        vm.prank(forecaster);
        book.commit(V_ROUND, V_ANCHOR, VECTOR_ROOT, 4);
    }

    // ------------------------------------------------------------------ test vector

    function test_vector_leafHashesAndRoot() public view {
        ForecastBook.Leaf[4] memory l = _vectorLeaves();
        bytes32[4] memory expected = [LEAF_NVDAB, LEAF_TSLAB, LEAF_SPYB, LEAF_TEST];
        for (uint256 i; i < 4; ++i) {
            assertEq(book.leafHash(l[i]), expected[i]);
        }
        // Sorted leaves: TEST < SPYB < TSLAB < NVDAB.
        assertEq(Hashes.commutativeKeccak256(LEAF_TEST, LEAF_SPYB), NODE_01);
        assertEq(Hashes.commutativeKeccak256(LEAF_TSLAB, LEAF_NVDAB), NODE_23);
        bytes32 root = Hashes.commutativeKeccak256(NODE_01, NODE_23);
        assertEq(root, VECTOR_ROOT);
        console2.log("ForecastBook 4-leaf test vector root:");
        console2.logBytes32(root);
    }

    function test_vector_verifiesEveryLeaf() public {
        _commitVector();
        ForecastBook.Leaf[4] memory l = _vectorLeaves();
        for (uint256 i; i < 4; ++i) {
            assertTrue(book.verifyForecast(forecaster, V_ROUND, l[i], _vectorProof(i)));
        }
    }

    function test_vector_rejectsTamperedInputs() public {
        _commitVector();
        ForecastBook.Leaf memory leaf = _vectorLeaves()[0];
        bytes32[] memory proof = _vectorProof(0);

        ForecastBook.Leaf memory t = leaf;
        t.medianE8 += 1; // altered forecast
        assertFalse(book.verifyForecast(forecaster, V_ROUND, t, proof));

        assertFalse(book.verifyForecast(forecaster, V_ROUND, leaf, _vectorProof(1))); // wrong proof
        assertFalse(book.verifyForecast(makeAddr("other"), V_ROUND, leaf, proof)); // no commitment
        assertFalse(book.verifyForecast(forecaster, V_ROUND + 1, leaf, proof)); // no commitment for round

        bytes32[] memory empty = new bytes32[](0);
        assertFalse(book.verifyForecast(forecaster, V_ROUND, leaf, empty));

        // An inner node is never accepted as a leaf (double hashing).
        bytes32[] memory shortProof = new bytes32[](1);
        shortProof[0] = NODE_23;
        assertFalse(book.verifyForecast(forecaster, V_ROUND, leaf, shortProof));
    }

    function test_verify_requiresMatchingRoundAndAnchor() public {
        // A set whose leaves carry a different round/anchor than the commitment never verifies, even with a valid
        // proof: a forecaster cannot commit after an open and pass off a forecast for that earlier open.
        ForecastBook.Leaf memory leaf = ForecastBook.Leaf(7, NVDAB, 236e8, 220e8, 250e8, V_ANCHOR - 1 days);
        bytes32 root = book.leafHash(leaf); // single-leaf tree: root == leaf hash, empty proof
        vm.prank(forecaster);
        book.commit(7, V_ANCHOR, root, 1);
        assertFalse(book.verifyForecast(forecaster, 7, leaf, new bytes32[](0)));

        ForecastBook.Leaf memory leaf2 = ForecastBook.Leaf(8, NVDAB, 236e8, 220e8, 250e8, V_ANCHOR);
        bytes32 root2 = book.leafHash(leaf2); // hashed before vm.prank, which only covers the next call
        vm.prank(forecaster);
        book.commit(9, V_ANCHOR, root2, 1);
        assertFalse(book.verifyForecast(forecaster, 9, leaf2, new bytes32[](0))); // leaf.round 8 != 9

        ForecastBook.Leaf memory ok = ForecastBook.Leaf(10, NVDAB, 236e8, 220e8, 250e8, V_ANCHOR);
        bytes32 root3 = book.leafHash(ok);
        vm.prank(forecaster);
        book.commit(10, V_ANCHOR, root3, 1);
        assertTrue(book.verifyForecast(forecaster, 10, ok, new bytes32[](0)));
    }

    // ------------------------------------------------------------------ commit

    function test_commit_storesAndEmits() public {
        vm.expectEmit(address(book));
        emit ForecastCommitted(forecaster, V_ROUND, V_ANCHOR, VECTOR_ROOT, 4);
        _commitVector();
        ForecastBook.Commitment memory c = book.getCommitment(forecaster, V_ROUND);
        assertEq(c.root, VECTOR_ROOT);
        assertEq(c.anchorTime, V_ANCHOR);
        assertEq(c.committedAt, SAT);
        assertEq(c.count, 4);
        assertFalse(c.revealed);
    }

    function test_commit_reverts() public {
        vm.startPrank(forecaster);
        vm.expectRevert(ForecastBook.EmptyRoot.selector);
        book.commit(1, V_ANCHOR, bytes32(0), 1);
        vm.expectRevert(ForecastBook.EmptyCount.selector);
        book.commit(1, V_ANCHOR, VECTOR_ROOT, 0);
        vm.expectRevert(abi.encodeWithSelector(ForecastBook.CommitTooLate.selector, SAT, uint256(SAT)));
        book.commit(1, SAT, VECTOR_ROOT, 1); // anchor == now is too late
        vm.expectRevert(abi.encodeWithSelector(ForecastBook.CommitTooLate.selector, SAT - 1, uint256(SAT)));
        book.commit(1, SAT - 1, VECTOR_ROOT, 1);

        book.commit(1, SAT + 1, VECTOR_ROOT, 1); // one second before the anchor is fine
        vm.expectRevert(abi.encodeWithSelector(ForecastBook.AlreadyCommitted.selector, forecaster, 1));
        book.commit(1, V_ANCHOR, keccak256("other"), 2);
        vm.stopPrank();

        // Commitments are per forecaster: another address can use the same round.
        vm.prank(makeAddr("other"));
        book.commit(1, V_ANCHOR, VECTOR_ROOT, 4);
    }

    // ------------------------------------------------------------------ reveal

    function test_reveal() public {
        _commitVector();
        vm.expectEmit(address(book));
        emit ForecastRevealed(forecaster, V_ROUND, "ipfs://bafy-forecast-set");
        vm.prank(forecaster);
        book.reveal(V_ROUND, "ipfs://bafy-forecast-set");
        assertTrue(book.getCommitment(forecaster, V_ROUND).revealed);
        assertEq(book.revealedUri(forecaster, V_ROUND), "ipfs://bafy-forecast-set");
    }

    function test_reveal_reverts() public {
        vm.startPrank(forecaster);
        vm.expectRevert(ForecastBook.EmptyUri.selector);
        book.reveal(V_ROUND, "");
        vm.expectRevert(abi.encodeWithSelector(ForecastBook.NoCommitment.selector, forecaster, V_ROUND));
        book.reveal(V_ROUND, "ipfs://x");
        book.commit(V_ROUND, V_ANCHOR, VECTOR_ROOT, 4);
        book.reveal(V_ROUND, "ipfs://x");
        vm.expectRevert(abi.encodeWithSelector(ForecastBook.AlreadyRevealed.selector, forecaster, V_ROUND));
        book.reveal(V_ROUND, "ipfs://y");
        vm.stopPrank();
        assertEq(book.revealedUri(forecaster, V_ROUND), "ipfs://x");
    }

    // ------------------------------------------------------------------ ERC-8004 identity

    function test_linkAgent_includingIdZero() public {
        registry.mint(forecaster, 0);
        vm.expectEmit(address(book));
        emit AgentLinked(forecaster, 0);
        vm.prank(forecaster);
        book.linkAgent(0);
        (bool linked, uint256 agentId) = book.linkedAgent(forecaster);
        assertTrue(linked);
        assertEq(agentId, 0);
        assertTrue(book.isLinkCurrent(forecaster));

        registry.mint(forecaster, 77);
        vm.prank(forecaster);
        book.linkAgent(77); // relink overwrites
        (, agentId) = book.linkedAgent(forecaster);
        assertEq(agentId, 77);
    }

    function test_linkAgent_reverts() public {
        registry.mint(makeAddr("someoneElse"), 5);
        vm.startPrank(forecaster);
        vm.expectRevert(
            abi.encodeWithSelector(ForecastBook.NotAgentOwner.selector, 5, forecaster, makeAddr("someoneElse"))
        );
        book.linkAgent(5);
        vm.expectRevert(abi.encodeWithSelector(ForecastBook.UnknownAgent.selector, 6));
        book.linkAgent(6);
        vm.expectRevert(abi.encodeWithSelector(ForecastBook.UnknownAgent.selector, type(uint256).max));
        book.linkAgent(type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ForecastBook.NoLinkedAgent.selector, forecaster));
        book.unlinkAgent();
        vm.stopPrank();

        ForecastBook disabled = new ForecastBook(IERC721(address(0)));
        vm.expectRevert(ForecastBook.IdentityRegistryDisabled.selector);
        disabled.linkAgent(1);
        assertFalse(disabled.isLinkCurrent(forecaster));
    }

    function test_linkGoesStaleOnTransfer_andUnlink() public {
        registry.mint(forecaster, 9);
        vm.prank(forecaster);
        book.linkAgent(9);
        address buyer = makeAddr("buyer");
        vm.prank(forecaster);
        registry.transferFrom(forecaster, buyer, 9);
        assertFalse(book.isLinkCurrent(forecaster));
        (bool linked,) = book.linkedAgent(forecaster);
        assertTrue(linked); // stored link remains, flagged stale by isLinkCurrent

        vm.expectEmit(address(book));
        emit AgentUnlinked(forecaster, 9);
        vm.prank(forecaster);
        book.unlinkAgent();
        (linked,) = book.linkedAgent(forecaster);
        assertFalse(linked);
        assertFalse(book.isLinkCurrent(forecaster));
    }

    // ------------------------------------------------------------------ fuzz: random trees

    /// Builds a sorted-pair Merkle tree over `n` random leaves and checks every proof verifies on-chain, and that a
    /// perturbed leaf does not.
    function testFuzz_randomTreesVerify(uint256 seed, uint8 nRaw) public {
        uint256 n = bound(nRaw, 1, 33);
        ForecastBook.Leaf[] memory leaves = new ForecastBook.Leaf[](n);
        bytes32[] memory hashes = new bytes32[](n);
        for (uint256 i; i < n; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            uint128 lower = uint128(bound(r, 1, 1e15));
            uint128 median = lower + uint128(r % 1e12);
            leaves[i] =
                ForecastBook.Leaf(V_ROUND, address(uint160(r)), median, lower, median + uint128(r % 7e11), V_ANCHOR);
            hashes[i] = book.leafHash(leaves[i]);
        }
        (bytes32 root, bytes32[][] memory proofs) = _buildTree(hashes);
        vm.prank(forecaster);
        book.commit(V_ROUND, V_ANCHOR, root, uint32(n));
        for (uint256 i; i < n; ++i) {
            assertTrue(book.verifyForecast(forecaster, V_ROUND, leaves[i], proofs[i]));
            ForecastBook.Leaf memory bad = leaves[i];
            bad.upperE8 += 1;
            assertFalse(book.verifyForecast(forecaster, V_ROUND, bad, proofs[i]));
        }
    }

    /// Level-by-level sorted-pair tree; an odd node is promoted unchanged. Returns the root and each leaf's proof.
    function _buildTree(bytes32[] memory leafHashes) internal pure returns (bytes32, bytes32[][] memory proofs) {
        uint256 n = leafHashes.length;
        proofs = new bytes32[][](n);
        uint256[] memory pos = new uint256[](n); // each leaf's index in the current level
        uint256[] memory plen = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            proofs[i] = new bytes32[](8);
            pos[i] = i;
        }
        bytes32[] memory level = leafHashes;
        while (level.length > 1) {
            uint256 m = (level.length + 1) / 2;
            bytes32[] memory next = new bytes32[](m);
            for (uint256 j; j < m; ++j) {
                next[j] = 2 * j + 1 < level.length
                    ? Hashes.commutativeKeccak256(level[2 * j], level[2 * j + 1])
                    : level[2 * j];
            }
            for (uint256 i; i < n; ++i) {
                uint256 p = pos[i];
                uint256 sib = p ^ 1;
                if (sib < level.length) proofs[i][plen[i]++] = level[sib];
                pos[i] = p / 2;
            }
            level = next;
        }
        for (uint256 i; i < n; ++i) {
            bytes32[] memory trimmed = new bytes32[](plen[i]);
            for (uint256 k; k < plen[i]; ++k) {
                trimmed[k] = proofs[i][k];
            }
            proofs[i] = trimmed;
        }
        return (level[0], proofs);
    }
}
