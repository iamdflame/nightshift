import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          gsap: ["gsap", "@gsap/react", "lenis"],
          chain: ["viem"],
        },
      },
    },
  },
});
