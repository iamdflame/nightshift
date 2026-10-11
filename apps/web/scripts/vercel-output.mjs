// Turns the Vite build (dist/) into Vercel's Build Output API v3 (.vercel/output/) so the site deploys
// prebuilt: `vercel deploy --prebuilt --prod`. Vercel serves the static site from its edge; every API surface
// is proxied to the Railway service that runs the engine and holds the database, so the browser stays
// same-origin and curl users can call /v1 on the site's own domain.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.NIGHTSHIFT_API_ORIGIN ?? "https://nightshift-production-f4e3.up.railway.app";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const out = join(root, ".vercel", "output");

if (!existsSync(join(dist, "index.html"))) throw new Error("dist/index.html missing: run `pnpm exec vite build` first");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, join(out, "static"), { recursive: true });

const config = {
  version: 3,
  routes: [
    // API surfaces live on Railway.
    { src: "^/(v1|x402|mcp|_export)(/.*)?$", dest: `${API}/$1$2` },
    { src: "^/openapi\\.json$", dest: `${API}/openapi.json` },
    { src: "^/\\.well-known/(.*)$", dest: `${API}/.well-known/$1` },
    // "/" for JSON clients and CLIs is the API index, as on the Railway origin; browsers get the page.
    { src: "^/$", has: [{ type: "header", key: "accept", value: ".*application/json.*" }], dest: `${API}/v1` },
    { src: "^/$", has: [{ type: "header", key: "user-agent", value: "^(curl|Wget|HTTPie|python-requests|python-httpx)/.*" }], dest: `${API}/v1` },
    // Hashed assets never change; textures, photos and the star catalog change rarely.
    { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
    { src: "^/(tex|img|data)/(.*)$", headers: { "cache-control": "public, max-age=604800, stale-while-revalidate=86400" }, continue: true },
    { handle: "filesystem" },
    // Client-side routes: the SPA renders them (and its own not-found page).
    { src: "^/(.*)$", dest: "/index.html" },
  ],
};
writeFileSync(join(out, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
console.log(`.vercel/output ready (API → ${API})`);
