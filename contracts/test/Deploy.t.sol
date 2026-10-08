// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {Deploy} from "../script/Deploy.s.sol";
import {NightshiftCredit} from "../src/NightshiftCredit.sol";
import {NightshiftFeed} from "../src/NightshiftFeed.sol";
import {MockERC20, MockIdentityRegistry} from "./mocks/Mocks.sol";

/// Exercises the deploy script's wiring in-process (the script's `deploy` core, without broadcasting or file output).
contract DeployTest is Test {
    Deploy internal script;
    MockERC20 internal usdt;
    address[] internal tokens;

    function setUp() public {
        script = new Deploy();
        usdt = new MockERC20("Tether USD", "USDT", 18);
        tokens.push(address(new MockERC20("NVIDIA Corp", "NVDAB", 18)));
        tokens.push(address(new MockERC20("Tesla, Inc.", "TSLAB", 18)));
    }

    function _config(address owner_) internal returns (Deploy.Config memory cfg) {
        cfg.owner = owner_;
        cfg.usdt = address(usdt);
        cfg.tokens = tokens;
        cfg.reporters = new address[](2);
        cfg.reporters[0] = makeAddr("aggregator-1");
        cfg.reporters[1] = makeAddr("aggregator-2");
        cfg.identityRegistry = address(new MockIdentityRegistry());
        cfg.borrowAprBps = 800;
        cfg.venusMaxAge = 1 hours;
        cfg.collateral = NightshiftCredit.CollateralParams(true, 5000, 6500, 500, 1500, 3600);
    }

    function test_deploy_wiresEverythingAndOffersOwnership() public {
        address multisig = makeAddr("multisig");
        Deploy.Config memory cfg = _config(multisig);
        Deploy.Deployment memory d = script.deploy(cfg, address(script));

        // Reporters and one deterministic feed per token.
        assertTrue(d.oracle.isReporter(cfg.reporters[0]));
        assertTrue(d.oracle.isReporter(cfg.reporters[1]));
        assertEq(d.feeds.length, 2);
        for (uint256 i; i < tokens.length; ++i) {
            assertEq(d.feeds[i], d.oracle.predictFeed(tokens[i]));
            assertEq(d.oracle.feedOf(tokens[i]), d.feeds[i]);
        }
        assertEq(NightshiftFeed(d.feeds[0]).description(), "NVDAB / USD (Nightshift)");

        // Credit market with collateral configured, wired to the oracle and USDT.
        assertEq(d.credit.asset(), address(usdt));
        assertEq(address(d.credit.oracle()), address(d.oracle));
        assertEq(d.credit.borrowAprBps(), 800);
        assertEq(d.credit.collateralTokens().length, 2);
        assertTrue(d.credit.collateralConfig(tokens[1]).enabled);
        assertEq(d.credit.collateralConfig(tokens[1]).liqThresholdBps, 6500);

        assertEq(address(d.venusOracle.nightshift()), address(d.oracle));
        assertEq(d.venusOracle.maxAge(), 1 hours);
        assertEq(address(d.forecastBook.identityRegistry()), cfg.identityRegistry);

        // Ownership is offered (two-step), not forced: the multisig must accept.
        assertEq(d.credit.owner(), address(script));
        assertEq(d.credit.pendingOwner(), multisig);
        assertEq(d.oracle.pendingOwner(), multisig);
        assertEq(d.venusOracle.pendingOwner(), multisig);
        vm.startPrank(multisig);
        d.credit.acceptOwnership();
        d.oracle.acceptOwnership();
        d.venusOracle.acceptOwnership();
        vm.stopPrank();
        assertEq(d.credit.owner(), multisig);
        assertEq(d.oracle.owner(), multisig);
    }

    function test_deploy_ownerEqualsDeployerSkipsHandover() public {
        Deploy.Deployment memory d = script.deploy(_config(address(script)), address(script));
        assertEq(d.credit.owner(), address(script));
        assertEq(d.credit.pendingOwner(), address(0));
    }

    function test_deploy_requiresUsdtCode() public {
        Deploy.Config memory cfg = _config(address(script));
        cfg.usdt = makeAddr("not-a-token");
        vm.expectRevert("Deploy: USDT has no code on this chain");
        script.deploy(cfg, address(script));
    }

    function test_readConfig_defaultsTargetBsc() public view {
        Deploy.Config memory cfg = script.readConfig();
        assertEq(cfg.usdt, 0x55d398326f99059fF775485246999027B3197955);
        assertEq(cfg.tokens.length, 3);
        assertEq(cfg.tokens[0], 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436);
        assertEq(cfg.borrowAprBps, 800);
        assertEq(cfg.collateral.baseLtvBps, 5000);
        assertEq(cfg.collateral.liqThresholdBps, 6500);
        assertEq(cfg.collateral.liqBonusBps, 500);
        assertEq(cfg.collateral.maxBandBps, 1500);
        assertEq(cfg.collateral.maxAge, 3600);
        assertEq(cfg.owner, address(0)); // resolved to the broadcaster in run()
    }
}
