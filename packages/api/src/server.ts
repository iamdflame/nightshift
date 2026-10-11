/**
 * Nightshift API server.
 *
 *   pnpm exec tsx packages/api/src/server.ts      (PORT, default 8787)
 */
import { timingSafeEqual } from "node:crypto";
import { createReadStream, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createGzip } from "node:zlib";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Fastify from "fastify";
import { buildReceipt } from "@nightshift/trade";
import { buildMcpServer } from "./mcp.ts";
import { openapi } from "./openapi.ts";
import { DEFAULT_DB_PATH, loadEnv } from "@nightshift/tape";
import { Queries } from "./queries.ts";
import { registerX402 } from "./x402.ts";

loadEnv(); // Binance Web3 API key (B402 facilitator for /x402)
const PORT = Number(process.env.PORT ?? 8787);
const q = new Queries();
// trustProxy: behind Railway's edge, req.ip must be the client (X-Forwarded-For) or every caller shares one rate-limit bucket.
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });
await app.register(cors, { origin: true, exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"] });
// Public on the internet: 120 requests/min per client; receipts (RPC-heavy) get their own lower limit below.
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
await registerX402(app, q);

app.get("/", async () => ({
  name: "Nightshift",
  tagline: "The price of a stock when Wall Street is asleep.",
  docs: "/openapi.json",
  mcp: "/mcp",
  endpoints: Object.keys(openapi.paths),
}));
app.get("/openapi.json", async () => openapi);
app.get("/v1/status", async () => q.status());
app.get("/v1/health", async (_req, reply) => {
  const h = q.health();
  return reply.code(h.ok ? 200 : 503).send(h);
});
app.get("/v1/fair-value", async () => {
  const rows = q.consensus();
  return { round: q.latestRound(), count: rows.length, data: rows.map((c) => q.formatConsensus(c)) };
});
app.get<{ Params: { token: string } }>("/v1/fair-value/:token", async (req, reply) => {
  const r = q.fairValue(req.params.token);
  return r ?? reply.code(404).send({ error: `no fair value for ${req.params.token}` });
});
app.get<{ Params: { ticker: string } }>("/v1/which/:ticker", async (req, reply) => {
  const r = q.which(req.params.ticker);
  return r ?? reply.code(404).send({ error: `unknown ticker ${req.params.ticker}` });
});
app.get("/v1/radar", async () => q.radar());
app.get("/v1/identities", async () => q.identities());
app.get<{ Querystring: { ticker?: string } }>("/v1/instruments", async (req) => q.instruments(req.query.ticker));
app.get<{ Querystring: { limit?: string } }>("/v1/rounds", async (req) => q.rounds(Math.min(500, Math.max(1, Math.trunc(Number(req.query.limit ?? 50)) || 50))));
app.get<{ Params: { round: string; forecaster: string; token: string } }>("/v1/rounds/:round/proof/:forecaster/:token", async (req, reply) => {
  const r = q.proof(Number(req.params.round), req.params.forecaster, req.params.token);
  return r ?? reply.code(404).send({ error: "forecast not found in that round" });
});
app.get("/v1/scoreboard", async () => ({ scoreboard: q.scoreboard() }));
// Receipt v1: what any BSC tokenized-stock trade cost per real share vs the fair value at that moment.
app.get<{ Params: { tx: string }; Querystring: { trader?: string } }>("/v1/receipts/:tx", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(req.params.tx)) return reply.code(400).send({ error: "tx must be a 32-byte hex hash" });
  try {
    return await buildReceipt(req.params.tx as `0x${string}`, { trader: req.query.trader });
  } catch (e) {
    return reply.code(422).send({ error: (e as Error).message.split(/\r?\n/)[0] });
  }
});
app.get("/v1/results", async () => ({ results: q.results(30) }));
app.get("/v1/study", async () => q.study());

// Server-sent events: push each new round's consensus as the Night Shift produces it.
app.get("/v1/stream", (req, reply) => {
  reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*" });
  let last = -1;
  const push = () => {
    const r = q.latestRound();
    if (r && r.round !== last) {
      last = r.round;
      reply.raw.write(`event: round\ndata: ${JSON.stringify({ round: r, consensus: q.consensus().map((c) => q.formatConsensus(c)) })}\n\n`);
    } else reply.raw.write(`: keep-alive ${Date.now()}\n\n`);
  };
  push();
  const timer = setInterval(push, 15_000);
  req.raw.on("close", () => clearInterval(timer));
});

// MCP over Streamable HTTP, stateless: a fresh server + transport per request.
app.post("/mcp", async (req, reply) => {
  const server = buildMcpServer(q);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  reply.raw.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  reply.hijack();
  await transport.handleRequest(req.raw, reply.raw, req.body);
});
app.get("/mcp", async (_req, reply) => reply.code(405).send({ error: "Use POST for MCP (Streamable HTTP, stateless)" }));

// Operator-only: a consistent gzip snapshot of the database (the proof page is generated from it). Needs the
// same secret as the bootstrap import; absent token → the route does not exist.
const EXPORT_TOKEN = process.env.NIGHTSHIFT_IMPORT_TOKEN;
if (EXPORT_TOKEN) {
  app.get("/_export", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const given = Buffer.from(String(req.headers.authorization ?? ""));
    const want = Buffer.from(`Bearer ${EXPORT_TOKEN}`);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return reply.code(404).send({ error: "not found" });
    const snap = join(tmpdir(), `nightshift-export-${Date.now()}.sqlite`);
    const db = new DatabaseSync(DEFAULT_DB_PATH, { readOnly: true });
    db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
    db.close();
    const stream = createReadStream(snap).pipe(createGzip({ level: 6 }));
    stream.on("close", () => rmSync(snap, { force: true }));
    return reply.header("content-type", "application/gzip").send(stream);
  });
}

await app.listen({ port: PORT, host: "0.0.0.0" });
