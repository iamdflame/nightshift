/** Every documented REST endpoint, by module — used for docs, coverage checks and tooling. */
import type { EndpointDef } from "./endpoint.ts";
import { b402Endpoints } from "./endpoints/b402.ts";
import { defiEndpoints } from "./endpoints/defi.ts";
import { marketEndpoints } from "./endpoints/market.ts";
import { rwaEndpoints } from "./endpoints/rwa.ts";
import { tradingEndpoints } from "./endpoints/trading.ts";
import { transactionEndpoints } from "./endpoints/transaction.ts";
import { walletEndpoints } from "./endpoints/wallet.ts";

export const ENDPOINTS = {
  rwa: rwaEndpoints,
  market: marketEndpoints,
  trading: tradingEndpoints,
  transaction: transactionEndpoints,
  wallet: walletEndpoints,
  defi: defiEndpoints,
  b402: b402Endpoints,
} as const;

export function allEndpoints(): EndpointDef[] {
  return Object.values(ENDPOINTS).flatMap((m) => Object.values(m) as EndpointDef[]);
}
