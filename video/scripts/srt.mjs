// Writes out/captions.srt with the same timings the video uses: each scene is the voice length (+0.3 s lead,
// +0.7 s tail) or its estimate, scenes overlap by the 0.5 s cross-fade, and each caption chunk gets its share
// of the scene by length. Run after the voice files are in public/vo/.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;
const LEAD = 9;
const TAIL = 21;
const XFADE = 15;

// script.ts is TypeScript; load it through tsx's loader (installed at the repo root).
const { SCENES, captionChunks } = await import(pathToFileURL(join(root, "src", "script.ts")).href);

const probe = (file) => {
  const r = spawnSync("pnpm", ["exec", "remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { cwd: root, encoding: "utf8", shell: true });
  return Number(r.stdout.trim());
};
const ts = (frames) => {
  const ms = Math.round((frames / FPS) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

let start = 0;
let n = 1;
const out = [];
for (const s of SCENES) {
  const vo = join(root, "public", "vo", `${s.id}.mp3`);
  const dur = existsSync(vo) ? Math.ceil(probe(vo) * FPS) + LEAD + TAIL : s.estimate * FPS;
  const span = dur - LEAD - TAIL;
  for (const c of captionChunks(s.vo)) {
    out.push(`${n++}\n${ts(start + LEAD + c.from * span)} --> ${ts(start + LEAD + c.to * span)}\n${c.text}\n`);
  }
  start += dur - XFADE;
}
writeFileSync(join(root, "out", "captions.srt"), out.join("\n"));
console.log(`out/captions.srt: ${n - 1} captions, ${ts(start + XFADE)} total`);
