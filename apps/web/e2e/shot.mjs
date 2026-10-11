// Usage: node e2e/shot.mjs <url> <out-prefix> [scrollY,...] [--mobile] [--reduce] [--wait=ms]
import { chromium } from "playwright";
const [url, out, scrolls = "0"] = process.argv.slice(2);
const mobile = process.argv.includes("--mobile");
const reduce = process.argv.includes("--reduce");
const wait = Number((process.argv.find((a) => a.startsWith("--wait=")) ?? "--wait=6000").split("=")[1]);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default", "--enable-gpu"] }).catch(() => chromium.launch());
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  reducedMotion: reduce ? "reduce" : "no-preference",
});
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => undefined);
await page.waitForTimeout(wait);
for (const y of scrolls.split(",").map(Number)) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}-${y}.png` });
}
console.log(JSON.stringify({ errors: errors.slice(0, 8) }));
await browser.close();
