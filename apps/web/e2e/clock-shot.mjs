// Screens the weekend chapter as it renders at a given instant (browser clock faked; the API answers in real time).
// Usage: node e2e/clock-shot.mjs <base> <ISO instant> <out-prefix> [WxH] [fractions]
import { chromium } from "playwright";
const [base, iso, out, size = "1440x900", fr = "0.3,0.99"] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ channel: "chrome", args: ["--use-angle=default", "--enable-gpu"] });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 768 ? 2 : 1, isMobile: w < 768, hasTouch: w < 768 });
const p = await ctx.newPage();
await p.clock.install({ time: new Date(iso) });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
for (let y = 0; y < 2400; y += 400) { await p.mouse.wheel(0, 400); await p.waitForTimeout(150); }
await p.waitForTimeout(1500);
const top = await p.evaluate(() => { const s = document.querySelector('[aria-labelledby="weekend-title"]'); const sp = s.parentElement.classList.contains("pin-spacer") ? s.parentElement : s; return sp.getBoundingClientRect().top + scrollY; });
const len = h * (w < 768 ? 2.6 : 3.6);
for (const f of fr.split(",").map(Number)) {
  await p.evaluate((yy) => scrollTo(0, yy), top + f * len);
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${out}-${f}.png` });
}
console.log(JSON.stringify({ errs }));
await b.close();
