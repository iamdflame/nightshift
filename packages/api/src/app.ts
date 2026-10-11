/**
 * The Nightshift HTTP app: the public API, MCP, x402, the ERC-8004 agent card and the website, on one
 * Fastify instance. server.ts listens; tests drive it with app.inject().
 */
import { timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { constants as zlib, createGzip } from "node:zlib";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { AGENT_CARDS } from "@nightshift/network/agent-cards";
import { DEFAULT_DB_PATH } from "@nightshift/tape";
import { buildReceipt } from "@nightshift/trade";
import { buildMcpServer } from "./mcp.ts";
import { openapi } from "./openapi.ts";
import type { Queries } from "./queries.ts";
import { registerWeb } from "./web.ts";
import { registerX402 } from "./x402.ts";

export interface AppOptions {
  /** The website build (apps/web/dist). Missing or without index.html → "/" serves the JSON index. */
  webDist?: string;
  logger?: boolean | object;
}

/** The ERC-8004 Identity Registry on BSC mainnet, as a CAIP-10 address. */
export const AGENT_REGISTRY = "eip155:56:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const AGENTS_FILE = "deployments/agents.json";
/** Rate-limited surfaces; static files and pages are exempt (a page load pulls many assets). */
const LIMITED = /^\/(v1|x402|mcp|_export|openapi\.json)(\/|\?|$)/;

/** Memoize a cheap-to-compute but per-request-wasteful value for `ms`. */
function memo<T>(ms: number, f: () => T): () => T {
  let at = 0;
  let value: T;
  return () => {
    if (at === 0 || Date.now() - at > ms) {
      value = f();
      at = Date.now();
    }
    return value;
  };
}

type AgentsFile = Partial<Record<string, { agentId: number | null; address: string }>>;
function readAgents(): AgentsFile {
  try {
    return existsSync(AGENTS_FILE) ? (JSON.parse(readFileSync(AGENTS_FILE, "utf8")) as AgentsFile) : {};
  } catch {
    return {};
  }
}

export async function buildApp(q: Queries, opts: AppOptions = {}): Promise<FastifyInstance> {
  const publicUrl = process.env.NIGHTSHIFT_PUBLIC_URL?.replace(/\/+$/, "") || null;
  // trustProxy: behind Railway's edge, req.ip must be the client (X-Forwarded-For) or every caller shares one rate-limit bucket.
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  await app.register(cors, { origin: true, exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"] });
  // Public on the internet: 300 API requests/min per client; receipts (RPC-heavy) and /_export get their own lower limits below.
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute", allowList: (req) => !LIMITED.test(req.url) });
  await registerX402(app, q);
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ["br", "gzip"],
    brotliOptions: { params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } },
  });

  const jsonIndex = {
    name: "Nightshift",
    tagline: "The price of a stock when Wall Street is asleep.",
    docs: "/openapi.json",
    mcp: "/mcp",
    agentCard: "/.well-known/agent-card.json",
    endpoints: Object.keys(openapi.paths),
  };

  app.get("/v1", async () => jsonIndex);
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
  app.get<{ Params: { round: string; token: string } }>("/v1/rounds/:round/consensus/:token", async (req, reply) => {
    const r = q.consensusAt(Number(req.params.round), req.params.token);
    return r ?? reply.code(404).send({ error: "no consensus for that token in that round" });
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

  // Server-sent events: push each new round's consensus as the Night Shift produces it. Never compressed (it must flush per event).
  app.get("/v1/stream", { compress: false }, (req, reply) => {
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
    app.get("/_export", { compress: false, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
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

  // ── Website data ───────────────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { token: string }; Querystring: { hours?: string; anchor?: string } }>("/v1/history/:token", async (req, reply) => {
    const hours = Math.trunc(Number(req.query.hours ?? 72)) || 72;
    // ?anchor=<ms>: one open (every round aimed at it, its official open and each forecaster's last seal).
    const anchor = req.query.anchor == null ? undefined : Number(req.query.anchor);
    if (anchor != null && !(Number.isSafeInteger(anchor) && anchor > 1.5e12 && anchor < 4e12)) return reply.code(400).send({ error: "anchor must be an open time in ms" });
    const r = q.history(req.params.token, hours, anchor);
    return r ?? reply.code(404).send({ error: `unknown token ${req.params.token}` });
  });
  const onchain = memo(60_000, () => q.onchain());
  app.get("/v1/onchain", async () => onchain());
  // The Binance Web3 API as we use it, from the SDK's own telemetry: calls, latency and every outcome code.
  const stack = memo(60_000, () => q.stack());
  app.get("/v1/stack", async () => stack());
  const FORECASTERS = ["anchor", "echo", "nfv"] as const;
  app.get<{ Querystring: { forecaster?: string } }>("/v1/opens", async (req, reply) => {
    const f = req.query.forecaster ?? "nfv";
    if (!(FORECASTERS as readonly string[]).includes(f)) return reply.code(400).send({ error: `forecaster must be one of ${FORECASTERS.join(", ")}` });
    return { forecaster: f, opens: q.opens(f) };
  });

  // ── ERC-8004 registration file for the network (one card; each agent's own identity is listed in it) ──
  const agents = memo(60_000, () => {
    const file = readAgents();
    const roles = Object.keys(AGENT_CARDS) as (keyof typeof AGENT_CARDS)[];
    const list = roles.flatMap((role) => {
      const a = file[role];
      return a ? [{ role, name: AGENT_CARDS[role].name, agentId: a.agentId, address: a.address }] : [];
    });
    return {
      agents: list,
      registrations: list.filter((a) => a.agentId != null).map((a) => ({ agentId: a.agentId as number, agentRegistry: AGENT_REGISTRY })),
    };
  });
  const baseUrl = (req: FastifyRequest) => publicUrl ?? `${req.protocol}://${req.host}`;
  const WELL_KNOWN_CACHE = "public, max-age=300";
  app.get("/.well-known/agent-card.json", async (req, reply) => {
    const base = baseUrl(req);
    const { agents: list, registrations } = agents();
    reply.header("cache-control", WELL_KNOWN_CACHE);
    return {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Nightshift",
      description:
        "A network of AI agents that prices tokenized US stocks on BNB Chain 24/7, including while Wall Street is closed: consensus fair value with a calibrated 90% band for the next open, every forecast committed on-chain (ForecastBook) before the open and scored against the official open, reports posted to the NightshiftOracle.",
      image: `${base}/og.png`,
      services: [
        { name: "MCP", endpoint: `${base}/mcp`, version: LATEST_PROTOCOL_VERSION },
        { name: "OpenAPI", endpoint: `${base}/openapi.json`, version: openapi.openapi },
        { name: "web", endpoint: `${base}/` },
      ],
      registrations,
      supportedTrust: ["reputation"],
      skills: (Object.keys(AGENT_CARDS) as (keyof typeof AGENT_CARDS)[]).map((role) => ({
        id: role,
        name: AGENT_CARDS[role].name,
        description: AGENT_CARDS[role].description,
        tags: AGENT_CARDS[role].capabilities,
      })),
      agents: list,
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
    };
  });
  app.get("/.well-known/agent-registration.json", async (_req, reply) => {
    reply.header("cache-control", WELL_KNOWN_CACHE);
    return { registrations: agents().registrations };
  });

  // Last: the website owns "/" and the not-found handler.
  await registerWeb(app, { dist: opts.webDist, jsonIndex });
  return app;
}
