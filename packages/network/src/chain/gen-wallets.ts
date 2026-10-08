/** Create (once) and print the Night Shift agent wallet addresses.  pnpm exec tsx packages/network/src/chain/gen-wallets.ts */
import { loadEnv } from "../env.ts";
import { ROLES, walletFor } from "./wallets.ts";

loadEnv();
for (const r of ROLES) console.log(`${r.padEnd(9)} ${walletFor(r).address}`);
