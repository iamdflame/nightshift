// Renders review stills from one bundle: node scripts/stills.mjs S1:120 S2:300 ...  (composition:frame)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts") });
const cache = new Map();
for (const arg of process.argv.slice(2)) {
  const [id, frame] = arg.split(":");
  if (!cache.has(id)) cache.set(id, await selectComposition({ serveUrl, id, inputProps: {} }));
  const out = join(root, "out", "stills", `${id}-${frame}.jpg`);
  await renderStill({ serveUrl, composition: cache.get(id), frame: Number(frame), output: out, imageFormat: "jpeg", jpegQuality: 80, scale: 0.5, chromiumOptions: { gl: "angle" } });
  console.log(out);
}
