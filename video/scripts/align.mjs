// Aligns the video to the real voice files:
//  1. finds the pauses in each file (silencedetect) and snaps every sentence boundary of the script to the pause
//     closest to where it should be, so captions and visual cues land on the spoken words;
//  2. loudness-normalises each file to -16 LUFS / -1.5 dBTP (two-pass loudnorm) into public/vo-norm/;
//  3. normalises the music the same way, so the mix levels in Main.tsx are predictable;
//  4. writes src/align.json (per scene: voice length, speech intervals, caption chunks with start/end in seconds).
//   node --import tsx scripts/align.mjs     (from video/)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { SCENES, captionSentences } = await import(pathToFileURL(join(root, "src", "script.ts")).href);

const ff = (args) => {
  const r = spawnSync("pnpm", ["exec", "remotion", "ffmpeg", "-hide_banner", ...args], { cwd: root, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  return `${r.stdout}\n${r.stderr}`;
};
const duration = (file) => Number(spawnSync("pnpm", ["exec", "remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { cwd: root, encoding: "utf8", shell: true }).stdout.trim());

function silences(file) {
  const out = ff(["-i", file, "-af", "silencedetect=noise=-38dB:d=0.18", "-f", "null", "-"]);
  const starts = [...out.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...out.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => ({ s, e: ends[i] ?? duration(file) }));
}

function normalise(src, dest, target = -16) {
  const m = ff(["-i", src, "-af", `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"]).match(/\{[\s\S]*?"target_offset"[^}]*\}/);
  if (!m) throw new Error(`loudnorm analysis failed for ${src}`);
  const j = JSON.parse(m[0]);
  ff(["-y", "-loglevel", "error", "-i", src, "-af", `loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, "-c:a", "pcm_s16le", dest]);
  return Number(j.input_i);
}

/** Snap K expected boundaries to pauses (monotonic, each pause used once); a boundary may keep its estimate. */
function snap(expected, pauses) {
  const K = expected.length;
  const M = pauses.length;
  const SKIP = 1.6;
  const cost = Array.from({ length: K + 1 }, () => new Array(M + 1).fill(Infinity));
  const back = Array.from({ length: K + 1 }, () => new Array(M + 1).fill(null));
  cost[0].fill(0);
  for (let k = 1; k <= K; k++) {
    for (let j = 0; j <= M; j++) {
      // keep the estimate (no pause consumed)
      if (cost[k - 1][j] + SKIP < cost[k][j]) {
        cost[k][j] = cost[k - 1][j] + SKIP;
        back[k][j] = { j, use: false };
      }
      // use pause j (1-based) after the previously used pauses
      if (j >= 1) {
        const mid = (pauses[j - 1].s + pauses[j - 1].e) / 2;
        // sentence ends are longer pauses than commas: favour them
        const c = cost[k - 1][j - 1] + Math.abs(mid - expected[k - 1]) - 0.8 * Math.min(0.6, pauses[j - 1].e - pauses[j - 1].s);
        if (c < cost[k][j]) {
          cost[k][j] = c;
          back[k][j] = { j: j - 1, use: true };
        }
      }
      // pauses can also be skipped (commas inside a sentence)
      if (j >= 1 && cost[k][j - 1] < cost[k][j]) {
        cost[k][j] = cost[k][j - 1];
        back[k][j] = { j: j - 1, use: null };
      }
    }
  }
  const out = new Array(K);
  let k = K;
  let j = M;
  while (k > 0) {
    const b = back[k][j];
    if (b.use === null) {
      j = b.j;
      continue;
    }
    out[k - 1] = b.use ? pauses[j - 1] : { s: expected[k - 1], e: expected[k - 1] };
    j = b.j;
    k--;
  }
  return out;
}

mkdirSync(join(root, "public", "vo-norm"), { recursive: true });
const align = {};
for (const sc of SCENES) {
  const file = join(root, "public", "vo", `${sc.id}.mp3`);
  if (!existsSync(file)) continue;
  const dur = duration(file);
  const sil = silences(file);
  const lead = sil.find((x) => x.s < 0.05)?.e ?? 0;
  const tailSil = sil.find((x) => x.e > dur - 0.05 && x.s > lead);
  const speechEnd = tailSil ? tailSil.s : dur;
  const inner = sil.filter((x) => x.s > lead + 0.05 && x.e < speechEnd - 0.05);
  const sentences = captionSentences(sc.vo);
  // Where boundaries should fall is estimated from the SPOKEN text ("a hundred and sixty-eight", not "168").
  const spoken = sc.vo.replace(/\[[^\]]+\]\s*/g, "").split(/(?<=[.!?:]|\.\.\.)(?<![ap]\.m\.)\s+/).filter((x) => x.trim());
  const lens = spoken.length === sentences.length ? spoken.map((x) => x.length) : sentences.map((p) => p.join(" ").length);
  if (spoken.length !== sentences.length) console.warn(`${sc.id}: spoken/caption sentence count differs (${spoken.length} vs ${sentences.length})`);
  const total = lens.reduce((a, b) => a + b, 0);
  const expected = [];
  let acc = 0;
  for (let i = 0; i < sentences.length - 1; i++) {
    acc += lens[i];
    expected.push(lead + (acc / total) * (speechEnd - lead));
  }
  const cuts = snap(expected, inner);
  const chunks = [];
  sentences.forEach((parts, i) => {
    const start = i === 0 ? lead : cuts[i - 1].e;
    const end = i === sentences.length - 1 ? speechEnd : cuts[i].s;
    const plen = parts.reduce((a, p) => a + p.length, 0);
    let a = 0;
    for (const p of parts) {
      const s0 = start + (a / plen) * (end - start);
      a += p.length;
      chunks.push({ text: p, start: +s0.toFixed(3), end: +(start + (a / plen) * (end - start)).toFixed(3) });
    }
  });
  // speech intervals (for music ducking): the gaps between pauses
  const speech = [];
  let at = lead;
  for (const x of inner) {
    speech.push([+at.toFixed(3), +x.s.toFixed(3)]);
    at = x.e;
  }
  speech.push([+at.toFixed(3), +speechEnd.toFixed(3)]);
  const lufs = normalise(file, join(root, "public", "vo-norm", `${sc.id}.wav`));
  align[sc.id] = { dur: +dur.toFixed(3), lufsIn: lufs, speechStart: +lead.toFixed(3), speechEnd: +speechEnd.toFixed(3), chunks, speech };
  console.log(`${sc.id}: ${dur.toFixed(2)} s, ${lufs} LUFS → -16, ${sentences.length} sentences, ${inner.length} pauses`);
}
for (const m of ["moon-walk", "vastness"]) {
  const src = join(root, "public", "music", `${m}.mp3`);
  if (existsSync(src)) console.log(`music ${m}: ${normalise(src, join(root, "public", "music", `${m}-norm.wav`))} LUFS → -16`);
}
writeFileSync(join(root, "src", "align.json"), `${JSON.stringify(align, null, 1)}\n`);
console.log(`src/align.json: ${Object.keys(align).length} scenes`);
