/** Read-only BNB Chain access straight from the browser: no wallet, no server in between. */
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { bsc } from "viem/chains";
export { ADDR, FORECASTERS, VENUS, bscscan, type Forecaster } from "./links";

export const client = createPublicClient({
  chain: bsc,
  transport: fallback([http("https://bsc-dataseed.bnbchain.org"), http("https://bsc-rpc.publicnode.com")], { retryCount: 2 }),
  batch: { multicall: true },
});

/** Unbatched reads, for contracts that only answer callers they allow (a Multicall3 hop makes them revert). */
export const directClient = createPublicClient({
  chain: bsc,
  transport: fallback([http("https://bsc-dataseed.bnbchain.org"), http("https://bsc-rpc.publicnode.com")], { retryCount: 2 }),
});



export const forecastBookAbi = parseAbi([
  "struct Leaf { uint64 round; address token; uint128 medianE8; uint128 lowerE8; uint128 upperE8; uint64 anchorTime; }",
  "struct Commitment { bytes32 root; uint64 anchorTime; uint64 committedAt; uint32 count; bool revealed; }",
  "function verifyForecast(address forecaster, uint64 round, Leaf leaf, bytes32[] proof) view returns (bool)",
  "function getCommitment(address forecaster, uint64 round) view returns (Commitment)",
  "function leafHash(Leaf leaf) pure returns (bytes32)",
]);

export const oracleAbi = parseAbi([
  "struct Report { uint128 fairValue; uint128 lower; uint128 upper; uint64 anchorTime; uint64 updatedAt; uint64 round; uint8 session; uint8 flags; }",
  "function getReport(address token) view returns (Report)",
  "function tryGetReport(address token) view returns (bool exists, Report report)",
]);

export const creditAbi = parseAbi([
  "struct AccountData { uint256 debt; uint256 borrowPower; uint256 liquidationValue; uint256 healthFactor; uint16 collateralMask; }",
  "function getAccountData(address account) view returns (AccountData)",
  "function cash() view returns (uint256)",
  "function totalDebt() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function collateralOf(address account, address token) view returns (uint256)",
]);

export const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function description() view returns (string)",
]);

/** Venus: ResilientOracle and its source oracles, the vToken and the Comptroller (all read-only). */
export const venusAbi = parseAbi([
  "struct TokenConfig { address asset; address[3] oracles; bool[3] enableFlagsForOracles; bool cachingEnabled; }",
  "function getPrice(address asset) view returns (uint256)",
  "function getTokenConfig(address asset) view returns (TokenConfig)",
  "function tokenConfigs(address asset) view returns (address asset, address feed, uint256 maxStalePeriod)",
  "function totalSupply() view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function supplyCaps(address vToken) view returns (uint256)",
  "function markets(address vToken) view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus, uint256 liquidationThresholdMantissa)",
]);
