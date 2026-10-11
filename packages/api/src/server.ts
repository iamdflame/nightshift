/**
 * Nightshift API server (and the website, when apps/web is built).
 *
 *   pnpm exec tsx packages/api/src/server.ts      (PORT, default 8787; NIGHTSHIFT_WEB_DIST, default apps/web/dist)
 */
import { resolve } from "node:path";
import { loadEnv } from "@nightshift/tape";
import { buildApp } from "./app.ts";
import { Queries } from "./queries.ts";

loadEnv(); // Binance Web3 API key (B402 facilitator for /x402), public URL, import token
const PORT = Number(process.env.PORT ?? 8787);
const app = await buildApp(new Queries(), {
  webDist: process.env.NIGHTSHIFT_WEB_DIST ?? resolve("apps/web/dist"),
  logger: { level: process.env.LOG_LEVEL ?? "info" },
});
await app.listen({ port: PORT, host: "0.0.0.0" });
