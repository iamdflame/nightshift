// Records the live site for the demo: scripted, smooth runs captured with a CDP screencast (JPEG q92, 1920×1080),
// then encoded to constant-frame-rate H.264 with Remotion's ffmpeg. A drawn cursor follows the mouse.
//   node capture/record.mjs [shot ...]      (from video/; no args = every shot)
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const { chromium } = createRequire(join(root, "..", "apps", "web", "package.json"))("playwright");
const SITE = process.env.SITE ?? "https://nightshift-oracle.vercel.app";
const W = 1920;
const H = 1080;

const CURSOR = `
(() => {
  const c = document.createElement("div");
  c.id = "__cursor";
  c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform 40ms linear";
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.4 L13.4 19.1 L10.4 12.6 L16.4 12.4 Z" fill="#F4F1E8" stroke="#0A0F1E" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const add = () => document.body && !document.getElementById("__cursor") && document.body.appendChild(c);
  document.addEventListener("DOMContentLoaded", add);
  setInterval(add, 500);
  addEventListener("mousemove", (e) => (c.style.transform = "translate(" + (e.clientX - 3) + "px," + (e.clientY - 2) + "px)"), { passive: true });
})();`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function glide(page, from, to, ms) {
  const steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    await page.mouse.move(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
    await wait(16);
  }
}
async function scroll(page, px, ms) {
  const steps = Math.max(1, Math.round(ms / 50));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await wait(50);
  }
}
const sectionTop = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return 0;
  const sp = el.parentElement?.classList.contains("pin-spacer") ? el.parentElement : el;
  return sp.getBoundingClientRect().top + scrollY;
}, sel);
async function scrollTo(page, y, ms) {
  const from = await page.evaluate(() => scrollY);
  await scroll(page, y - from, ms);
}

/** Each shot: where to start, what to do. The recorder keeps every frame Chrome paints. */
const SHOTS = {
  hero: async (p) => {
    await p.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await wait(4500);
    await glide(p, [1500, 700], [1180, 420], 3200);
    await glide(p, [1180, 420], [1420, 560], 3000);
    await wait(1500);
  },
  weekend: async (p) => {
    await p.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await wait(2500);
    await scroll(p, 400, 600);
    await wait(1500);
    const top = await sectionTop(p, '[aria-labelledby="weekend-title"]');
    await scrollTo(p, top, 1200);
    await wait(1500);
    await scroll(p, H * 3.6, 22000);
    await wait(2500);
  },
  howitworks: async (p) => {
    await p.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await wait(1500);
    await scroll(p, 400, 600);
    await wait(1200);
    const top = await sectionTop(p, '[aria-labelledby="how-title"]');
    await scrollTo(p, top - 40, 2500);
    await wait(1200);
    await scroll(p, 900, 5000);
    await glide(p, [900, 700], [1300, 380], 2000);
    await wait(2500);
  },
  venus: async (p) => {
    await p.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await wait(1500);
    await scroll(p, 400, 600);
    await wait(1200);
    const top = await sectionTop(p, '[aria-labelledby="loan-title"]');
    await scrollTo(p, top + 60, 3000);
    await wait(2500);
    const two = await sectionTop(p, '[aria-labelledby="two-answers-title"]');
    await scrollTo(p, two - 260, 3500);
    await wait(5000);
  },
  verify: async (p) => {
    await p.goto(`${SITE}/verify`, { waitUntil: "networkidle" });
    await wait(7000);
    await scroll(p, 500, 3500);
    await wait(2500);
  },
  tamper: async (p) => {
    await p.goto(`${SITE}/verify`, { waitUntil: "networkidle" });
    await wait(6000);
    const box = await p.locator('input[type="checkbox"]').first().boundingBox();
    if (box) {
      await glide(p, [900, 900], [box.x + box.width / 2, box.y + box.height / 2], 1500);
      await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await wait(800);
    const btn = await p.getByRole("button", { name: "Verify on BNB Chain" }).boundingBox();
    if (btn) {
      await glide(p, [box ? box.x : 900, box ? box.y : 600], [btn.x + btn.width / 2, btn.y + btn.height / 2], 1200);
      await p.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
    }
    await wait(6000);
    await scroll(p, 500, 3000);
    await wait(2000);
  },
  scoreboard: async (p) => {
    await p.goto(`${SITE}/scoreboard`, { waitUntil: "networkidle" });
    await wait(2500);
    await scroll(p, 1700, 12000);
    await wait(2000);
  },
  stack: async (p) => {
    await p.goto(`${SITE}/stack`, { waitUntil: "networkidle" });
    await wait(3000);
    await scroll(p, 2300, 15000);
    await wait(2000);
  },
  proof: async (p) => {
    await p.goto(`${SITE}/proof`, { waitUntil: "networkidle" });
    await wait(3000);
    await scroll(p, 900, 8000);
    await wait(2000);
  },
  stock: async (p) => {
    await p.goto(`${SITE}/s/NVDAB`, { waitUntil: "networkidle" });
    await wait(3000);
    await scroll(p, 420, 1500);
    await wait(1200);
    await glide(p, [420, 760], [1180, 720], 4500);
    await glide(p, [1180, 720], [760, 700], 3000);
    await wait(1500);
  },
};

const ffmpeg = (args) => {
  const r = spawnSync("pnpm", ["exec", "remotion", "ffmpeg", ...args], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(r.stderr.slice(-800));
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default", "--enable-gpu", "--force-color-profile=srgb", "--hide-scrollbars"] });
for (const name of wanted) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const dir = join(here, "frames", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const started = Date.now();
  await SHOTS[name](page);
  await cdp.send("Page.stopScreencast");
  await wait(300);
  // Hold each frame until the next one arrived: a constant-rate video at real speed.
  const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, "/")}'\nduration ${Math.max(0.001, ((frames[i + 1]?.t ?? f.t + 0.033) - f.t)).toFixed(4)}`).join("\n");
  writeFileSync(join(dir, "list.txt"), `${list}\nfile '${frames.at(-1).file.replace(/\\/g, "/")}'\n`);
  const out = join(root, "public", "capture", `${name}.mp4`);
  ffmpeg(["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "scale=1920:1080", "-r", "30", "-fps_mode", "cfr", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-bf", "0", "-g", "30", "-movflags", "+faststart", out]);
  console.log(`${name}: ${frames.length} frames over ${((Date.now() - started) / 1000).toFixed(1)} s → ${out}`);
  await ctx.close();
}
await browser.close();
