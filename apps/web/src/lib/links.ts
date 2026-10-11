/** Addresses and explorer links: plain constants, no chain client (safe to import anywhere). */
export const ADDR = {
  ForecastBook: "0xa04fE9e7F0289c9fC5b00e0eE972Cbd00a203212",
  NightshiftOracle: "0x0cEe7C0F2B62421E54c5F2E618dC53CC7eD4c63d",
  NightshiftCredit: "0x49c79D9D4c68a6fB8e9A34b828d36B7A38E2762e",
  NightshiftVenusOracle: "0x1a92c4Dc8264ebC2E6F3984a963AF5a4054FaC23",
  IdentityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  NVDAB: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
} as const;

/** Venus Core Pool, which lists NVDAB as collateral: read only, to show what a lender reads for the same token. */
export const VENUS = {
  Comptroller: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  ResilientOracle: "0x6592b5DE802159F3E74B2486b091D11a8256ab8A",
  vNVDAB: "0xEb8Ca841cBe1BC4832A10b15c7dAB1081eDaD371",
} as const;

export const FORECASTERS = {
  anchor: { address: "0x4feD3C73DE4392299747bf976749586b96D2C9e8", agentId: 370891, name: "Anchor", blurb: "The last official close, held until the next open: the no-skill baseline." },
  echo: { address: "0x11Cff8165119475Bc7f76ef755f4c0b7e33C0183", agentId: 370892, name: "Echo", blurb: "The live 24/7 on-chain price, echoed." },
  nfv: { address: "0xed958842c7477E76d926E4B08130a0b5C2DCbd99", agentId: 370893, name: "NFV", blurb: "Nightshift Fair Value: information provenance + conformal bands." },
} as const;
export type Forecaster = keyof typeof FORECASTERS;

export const bscscan = {
  tx: (h: string) => `https://bscscan.com/tx/${h}`,
  address: (a: string) => `https://bscscan.com/address/${a}`,
  block: (b: number | bigint) => `https://bscscan.com/block/${b}`,
};
