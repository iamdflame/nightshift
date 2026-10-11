import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerWeb } from "./web.js";

const BROWSER = { "user-agent": "Mozilla/5.0 Chrome/141", accept: "text/html,application/xhtml+xml,*/*;q=0.8" };
let dist: string;
let app: FastifyInstance;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "ns-web-"));
  mkdirSync(join(dist, "assets"));
  mkdirSync(join(dist, "tex"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Nightshift</title>");
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(dist, "tex", "moon.webp"), "x");
  writeFileSync(join(dist, "og.png"), "x");
  app = Fastify();
  app.get("/v1/status", async () => ({ ok: true }));
  await registerWeb(app, { dist, jsonIndex: { name: "Nightshift" } });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  rmSync(dist, { recursive: true, force: true });
});

describe("registerWeb", () => {
  it("serves the page to browsers and the JSON index to CLIs at /", async () => {
    const page = await app.inject({ url: "/", headers: BROWSER });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toMatch(/text\/html/);
    const cli = await app.inject({ url: "/", headers: { "user-agent": "curl/8.9", accept: "*/*" } });
    expect(cli.json()).toEqual({ name: "Nightshift" });
    const json = await app.inject({ url: "/", headers: { ...BROWSER, accept: "application/json" } });
    expect(json.json()).toEqual({ name: "Nightshift" });
  });

  it("gives link-preview bots the page so links unfurl", async () => {
    const res = await app.inject({ url: "/", headers: { "user-agent": "Slackbot-LinkExpanding 1.0", accept: "*/*" } });
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });

  it("serves app routes with 200 and unknown pages with the shell and a real 404", async () => {
    expect((await app.inject({ url: "/s/NVDAB", headers: BROWSER })).statusCode).toBe(200);
    expect((await app.inject({ url: "/verify?round=1", headers: BROWSER })).statusCode).toBe(200);
    const miss = await app.inject({ url: "/nope", headers: BROWSER });
    expect(miss.statusCode).toBe(404);
    expect(miss.headers["content-type"]).toMatch(/text\/html/);
  });

  it("never answers an API path with the shell", async () => {
    expect((await app.inject({ url: "/v1/status" })).json()).toEqual({ ok: true });
    const miss = await app.inject({ url: "/v1/nope", headers: BROWSER });
    expect(miss.statusCode).toBe(404);
    expect(miss.json()).toMatchObject({ error: "not found" });
  });

  it("caches hashed assets forever, media for a week, the page never", async () => {
    expect((await app.inject({ url: "/assets/index-abc123.js" })).headers["cache-control"]).toContain("immutable");
    expect((await app.inject({ url: "/tex/moon.webp" })).headers["cache-control"]).toContain("max-age=604800");
    expect((await app.inject({ url: "/og.png" })).headers["cache-control"]).toBe("public, max-age=3600");
    expect((await app.inject({ url: "/", headers: BROWSER })).headers["cache-control"]).toBe("no-cache");
  });
});
