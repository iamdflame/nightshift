import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Preload the hero's two latin fonts (headline, intro) so the static first paint doesn't reflow on swap. */
function preloadFonts(patterns: RegExp[]): Plugin {
  return {
    name: "ns-preload-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (_html, ctx) =>
        Object.keys(ctx.bundle ?? {})
          .filter((f) => f.endsWith(".woff2") && patterns.some((re) => re.test(f)))
          .map((f) => ({ tag: "link", attrs: { rel: "preload", as: "font", type: "font/woff2", href: `/${f}`, crossorigin: true }, injectTo: "head" as const })),
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts([/newsreader-latin-opsz-normal-/, /instrument-sans-latin-standard-normal-/])],
  resolve: {
    alias: {
      "@": r("./src"),
      // Browser-safe shared code only (the package barrels pull node:sqlite).
      "@ns/calendar": r("../../packages/core/src/calendar.ts"),
      "@ns/merkle": r("../../packages/network/src/merkle.ts"),
    },
    dedupe: ["viem", "react", "react-dom", "three"],
  },
  server: {
    port: 5173,
    proxy: { "/v1": "http://localhost:8787", "/x402": "http://localhost:8787", "/.well-known": "http://localhost:8787" },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    // No manualChunks: grouping three/gsap/viem by name pulled React into the three chunk and made every page
    // preload it. Rollup's own split keeps them behind the lazy imports that use them.
  },
});
