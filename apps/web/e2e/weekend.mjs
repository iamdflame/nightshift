// Screenshots of the pinned dark-weekend chapter at given scrub fractions. Usage: node e2e/weekend.mjs <base> <out> <w>x<h> [fractions]
import { chromium } from "playwright";
const [base, out, size = "390x844", fr = "0.05,0.6,0.97"] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ channel: "chrome", args: ["--use-angle=default", "--enable-gpu"] });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 768 ? 2 : 1, isMobile: w < 768, hasTouch: w < 768 });
const p = await ctx.newPage();
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
// mount lazy chapters
for (let y = 0; y < 2400; y += 400) { await p.evaluate((yy) => scrollTo(0, yy), y); await p.waitForTimeout(150); }
const top = await p.evaluate(() => { const s = document.querySelector('[aria-labelledby="weekend-title"]'); const sp = s.parentElement.classList.contains("pin-spacer") ? s.parentElement : s; return sp.getBoundingClientRect().top + scrollY; });
const len = h * (w < 768 ? 2.6 : 3.6);
for (const f of fr.split(",").map(Number)) {
  await p.evaluate((yy) => scrollTo(0, yy), top + f * len);
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${out}-${w}x${h}-${f}.png` });
}
await b.close();
