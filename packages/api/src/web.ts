/**
 * The website: the Vite build (apps/web/dist) served by the same Fastify app as the API, so one origin
 * answers people, agents and judges. "/" negotiates: browsers and link-preview bots get the page, CLIs and
 * JSON clients get the API index. Unknown page paths get the SPA shell (it renders its own 404) with the
 * right status; unknown API paths and missing files get a JSON 404, never the shell.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** API surfaces: a miss here is a JSON 404, never the SPA shell. */
const API_PATH = /^\/(v1|x402|mcp|_export|openapi\.json|\.well-known)(\/|$)/;
/** Client-side routes the SPA renders with status 200. Keep in sync with apps/web's router. */
export const SPA_ROUTES: readonly RegExp[] = [/^\/$/, /^\/radar$/, /^\/s\/[\w.-]{1,24}$/, /^\/proof$/, /^\/scoreboard$/, /^\/verify$/, /^\/credits$/];
/** The same routes as explicit Fastify routes, so they get compression like everything else. */
const SPA_PATHS = ["/radar", "/s/:symbol", "/proof", "/scoreboard", "/verify", "/credits"];
const CLI_UA = /curl|wget|httpie|python|node|undici|axios|go-http|okhttp|java/i;
const PREVIEW_UA = /twitterbot|slackbot|telegrambot|discordbot|facebookexternalhit/i;

const pathOf = (url: string) => url.split("?", 1)[0] ?? "/";

/**
 * Does this request for "/" want the JSON index rather than the page? Explicit Accept: application/json, or a
 * bare Accept (empty or star-slash-star) from a CLI/HTTP library (or no user agent at all). Link-preview bots
 * always get HTML so shared links unfurl with the page's Open Graph tags.
 */
export function wantsJson(req: FastifyRequest): boolean {
  const ua = String(req.headers["user-agent"] ?? "");
  if (PREVIEW_UA.test(ua)) return false;
  const accept = String(req.headers.accept ?? "").trim().toLowerCase();
  if (accept.includes("application/json")) return true;
  return (accept === "" || accept === "*/*") && (ua === "" || CLI_UA.test(ua));
}

const notFoundJson = (req: FastifyRequest, reply: FastifyReply) => reply.code(404).send({ error: "not found", path: pathOf(req.url) });

/**
 * Register the website. Must run LAST (after every API route): it owns "/" and the not-found handler.
 * Returns whether a build was found; without one, "/" serves the JSON index and every miss is a JSON 404.
 */
export async function registerWeb(app: FastifyInstance, opts: { dist?: string | undefined; jsonIndex: unknown }): Promise<boolean> {
  const dist = resolve(opts.dist ?? "apps/web/dist");
  const indexHtml = join(dist, "index.html");

  if (!opts.dist || !existsSync(indexHtml)) {
    app.get("/", async (_req, reply) => reply.header("vary", "accept, user-agent").send(opts.jsonIndex));
    app.setNotFoundHandler(notFoundJson);
    return false;
  }

  // Exact routes for the files in the build (wildcard: false): hashed assets are immutable for a year,
  // index.html is always revalidated, everything else in public/ (og.png, favicons) caches for an hour.
  await app.register(fastifyStatic, {
    root: dist,
    prefix: "/",
    wildcard: false,
    index: false,
    cacheControl: false,
    // A file in public/ must never shadow (or collide with) an API route.
    globIgnore: ["v1/**", "x402/**", "mcp", "mcp/**", "_export", "openapi.json"],
    setHeaders: (reply, file) => {
      const rel = relative(dist, file).split(sep).join("/");
      reply.header("cache-control", rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : rel === "index.html" ? "no-cache" : "public, max-age=3600");
    },
  });

  const shell = async (reply: FastifyReply, status: number, vary: string) =>
    reply
      .code(status)
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-cache")
      .header("vary", vary)
      .send(await readFile(indexHtml));

  app.get("/", async (req, reply) => (wantsJson(req) ? reply.header("vary", "accept, user-agent").send(opts.jsonIndex) : shell(reply, 200, "accept, user-agent")));
  for (const p of SPA_PATHS) {
    app.get(p, async (req, reply) => shell(reply, SPA_ROUTES.some((re) => re.test(pathOf(req.url))) ? 200 : 404, "accept"));
  }

  app.setNotFoundHandler(async (req, reply) => {
    const path = pathOf(req.url);
    const page = req.method === "GET" || req.method === "HEAD";
    if (page && SPA_ROUTES.some((re) => re.test(path))) return shell(reply, 200, "accept");
    // API misses and missing files (anything with an extension) are JSON 404s; other page paths get the
    // shell with 404 so the SPA renders its own not-found view.
    if (!page || API_PATH.test(path) || /\.[^/]*$/.test(path)) return notFoundJson(req, reply);
    return shell(reply, 404, "accept");
  });
  return true;
}
