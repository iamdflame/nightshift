// QA sweep: every route at desktop and phone width. Console errors, page errors, failed requests,
// horizontal overflow and axe (serious/critical). Usage: node e2e/qa.mjs [baseUrl]
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const routes = ["/", "/radar", "/s/NVDAB", "/proof", "/scoreboard", "/verify", "/stack", "/credits", "/nope"];
const sizes = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

const browser = await chromium.launch({ channel: "chrome" });
let problems = 0;
for (const size of sizes) {
  const ctx = await browser.newContext({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.hasTouch, deviceScaleFactor: size.deviceScaleFactor });
  for (const route of routes) {
    const page = await ctx.newPage();
    const out = [];
    page.on("console", (m) => m.type() === "error" && out.push(`console: ${m.text().slice(0, 200)}`));
    page.on("pageerror", (e) => out.push(`pageerror: ${e.message.slice(0, 200)}`));
    page.on("requestfailed", (r) => !r.url().includes("favicon") && out.push(`failed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
    page.on("response", (r) => r.status() >= 400 && !(route === "/nope" && r.url().endsWith("/nope")) && out.push(`http ${r.status()}: ${r.url().slice(0, 120)}`));
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 60_000 }).catch((e) => out.push(`goto: ${e.message.slice(0, 120)}`));
    await page.waitForTimeout(2500);
    // Scroll the whole page so lazy chapters mount, then back.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    await page.waitForTimeout(1000);
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= w + 1) return false;
          // ignore content inside horizontal scrollers and clipped ancestors
          for (let p = el.parentElement; p; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) return false;
          }
          return true;
        })
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`);
      return { scroll: document.documentElement.scrollWidth > w + 1, wide };
    });
    if (overflow.scroll || overflow.wide.length) out.push(`overflow: ${JSON.stringify(overflow)}`);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze().catch((e) => ({ violations: [{ id: "axe-failed", impact: "serious", nodes: [], help: e.message }] }));
    for (const v of axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical"))
      out.push(`axe ${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    problems += out.length;
    console.log(`${out.length ? "✗" : "✓"} ${size.name} ${route}${out.length ? "\n  " + out.join("\n  ") : ""}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(problems ? `${problems} problems` : "clean");
