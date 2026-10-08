// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin-contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin-contracts/token/ERC721/IERC721.sol";
import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {console2} from "forge-std/console2.sol";

import {ForecastBook} from "../src/ForecastBook.sol";
import {NightshiftCredit} from "../src/NightshiftCredit.sol";
import {NightshiftOracle} from "../src/NightshiftOracle.sol";
import {NightshiftVenusOracle} from "../src/NightshiftVenusOracle.sol";

/// @title Deploy
/// @notice Deploys the Nightshift core: oracle (+ one Chainlink-style feed per token), ForecastBook, Venus adapter
///         and the credit market with its initial collateral configuration. Every parameter comes from an optional
///         environment variable (defaults target BSC mainnet):
///
///           NIGHTSHIFT_OWNER              final owner (default: deployer). If different, ownership is *offered*
///                                         (Ownable2Step) and the owner must call acceptOwnership() on each contract.
///           NIGHTSHIFT_USDT               debt asset (default: BSC USDT 0x55d3...7955)
///           NIGHTSHIFT_TOKENS             comma-separated collateral tokens (default: NVDAB,TSLAB,SPYB)
///           NIGHTSHIFT_REPORTERS          comma-separated reporter (aggregator) addresses (default: none)
///           NIGHTSHIFT_IDENTITY_REGISTRY  ERC-8004 identity registry for ForecastBook (default: 0 = disabled)
///           NIGHTSHIFT_BORROW_APR_BPS     fixed borrow APR (default: 800 = 8%)
///           NIGHTSHIFT_VENUS_MAX_AGE      Venus adapter staleness budget, seconds (default: 3600)
///           NIGHTSHIFT_BASE_LTV_BPS, NIGHTSHIFT_LIQ_THRESHOLD_BPS, NIGHTSHIFT_LIQ_BONUS_BPS,
///           NIGHTSHIFT_MAX_BAND_BPS, NIGHTSHIFT_MAX_AGE
///                                         collateral parameters (defaults: 5000, 6500, 500, 1500, 3600)
///
///         Output: `deployments/<chainid>.json` when broadcasting; `deployments/<chainid>.dry-run.json` for simulations,
///         so simulated addresses are never mistaken for a live deployment.
///
///         Dry run against a BSC fork (no keys, nothing sent):
///           forge script script/Deploy.s.sol --fork-url https://bsc-dataseed.bnbchain.org
contract Deploy is Script {
    address internal constant BSC_USDT = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address internal constant TSLAB = 0x5b1910eAaD6450E50f816082Aa078C41F10C292f;
    address internal constant SPYB = 0x7138b48df7D98D7e3cc221BfE7192D0a178182D8;

    struct Config {
        address owner;
        address usdt;
        address[] tokens;
        address[] reporters;
        address identityRegistry;
        uint256 borrowAprBps;
        uint256 venusMaxAge;
        NightshiftCredit.CollateralParams collateral;
    }

    struct Deployment {
        NightshiftOracle oracle;
        ForecastBook forecastBook;
        NightshiftVenusOracle venusOracle;
        NightshiftCredit credit;
        address[] feeds; // index-aligned with Config.tokens
    }

    function run() external returns (Deployment memory d) {
        Config memory cfg = readConfig();
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        if (cfg.owner == address(0)) cfg.owner = deployer;
        d = deploy(cfg, deployer);
        vm.stopBroadcast();
        _write(cfg, d, deployer);
    }

    /// @notice Configuration from the environment, with BSC mainnet defaults. `owner` is zero when unset.
    function readConfig() public view returns (Config memory cfg) {
        address[] memory defaultTokens = new address[](3);
        defaultTokens[0] = NVDAB;
        defaultTokens[1] = TSLAB;
        defaultTokens[2] = SPYB;

        cfg.owner = vm.envOr("NIGHTSHIFT_OWNER", address(0));
        cfg.usdt = vm.envOr("NIGHTSHIFT_USDT", BSC_USDT);
        cfg.tokens = vm.envOr("NIGHTSHIFT_TOKENS", ",", defaultTokens);
        cfg.reporters = vm.envOr("NIGHTSHIFT_REPORTERS", ",", new address[](0));
        cfg.identityRegistry = vm.envOr("NIGHTSHIFT_IDENTITY_REGISTRY", address(0));
        cfg.borrowAprBps = vm.envOr("NIGHTSHIFT_BORROW_APR_BPS", uint256(800));
        cfg.venusMaxAge = vm.envOr("NIGHTSHIFT_VENUS_MAX_AGE", uint256(1 hours));
        cfg.collateral = NightshiftCredit.CollateralParams({
            enabled: true,
            baseLtvBps: uint16(vm.envOr("NIGHTSHIFT_BASE_LTV_BPS", uint256(5000))),
            liqThresholdBps: uint16(vm.envOr("NIGHTSHIFT_LIQ_THRESHOLD_BPS", uint256(6500))),
            liqBonusBps: uint16(vm.envOr("NIGHTSHIFT_LIQ_BONUS_BPS", uint256(500))),
            maxBandBps: uint16(vm.envOr("NIGHTSHIFT_MAX_BAND_BPS", uint256(1500))),
            maxAge: uint32(vm.envOr("NIGHTSHIFT_MAX_AGE", uint256(1 hours)))
        });
    }

    /// @notice Deploy and wire everything. `deployer` is the account whose calls these are (the broadcaster in
    ///         `run`, the script contract itself in tests); it is the initial owner and hands over to `cfg.owner`.
    function deploy(Config memory cfg, address deployer) public returns (Deployment memory d) {
        require(cfg.usdt.code.length != 0, "Deploy: USDT has no code on this chain");

        d.oracle = new NightshiftOracle(deployer);
        for (uint256 i; i < cfg.reporters.length; ++i) {
            d.oracle.setReporter(cfg.reporters[i], true);
        }
        d.feeds = new address[](cfg.tokens.length);
        for (uint256 i; i < cfg.tokens.length; ++i) {
            d.feeds[i] = d.oracle.createFeed(cfg.tokens[i]);
        }

        d.forecastBook = new ForecastBook(IERC721(cfg.identityRegistry));
        d.venusOracle = new NightshiftVenusOracle(d.oracle, deployer, cfg.venusMaxAge);
        d.credit =
            new NightshiftCredit(IERC20(cfg.usdt), d.oracle, deployer, cfg.borrowAprBps, "Nightshift USDT", "nsUSDT");
        for (uint256 i; i < cfg.tokens.length; ++i) {
            d.credit.setCollateral(cfg.tokens[i], cfg.collateral);
        }

        if (cfg.owner != deployer) {
            d.oracle.transferOwnership(cfg.owner);
            d.venusOracle.transferOwnership(cfg.owner);
            d.credit.transferOwnership(cfg.owner);
        }
    }

    function _write(Config memory cfg, Deployment memory d, address deployer) internal {
        bool live = vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        string memory path = string.concat(
            vm.projectRoot(), "/deployments/", vm.toString(block.chainid), live ? ".json" : ".dry-run.json"
        );

        string memory feeds = "feeds";
        string memory feedsJson = "{}";
        for (uint256 i; i < cfg.tokens.length; ++i) {
            feedsJson = vm.serializeAddress(feeds, vm.toString(cfg.tokens[i]), d.feeds[i]);
        }

        string memory root = "deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeUint(root, "block", block.number);
        vm.serializeBool(root, "broadcast", live);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "owner", cfg.owner);
        vm.serializeBool(root, "ownershipPendingAcceptance", cfg.owner != deployer);
        vm.serializeAddress(root, "usdt", cfg.usdt);
        vm.serializeAddress(root, "NightshiftOracle", address(d.oracle));
        vm.serializeAddress(root, "ForecastBook", address(d.forecastBook));
        vm.serializeAddress(root, "NightshiftVenusOracle", address(d.venusOracle));
        vm.serializeAddress(root, "NightshiftCredit", address(d.credit));
        vm.serializeAddress(root, "collateralTokens", cfg.tokens);
        vm.serializeAddress(root, "reporters", cfg.reporters);
        vm.serializeAddress(root, "identityRegistry", cfg.identityRegistry);
        vm.serializeUint(root, "borrowAprBps", cfg.borrowAprBps);
        vm.serializeUint(root, "venusMaxAge", cfg.venusMaxAge);
        string memory json = vm.serializeString(root, "feeds", feedsJson);
        vm.writeJson(json, path);
        console2.log("Deployment written to", path);
    }
}
