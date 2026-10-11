// Visible text of live pages, as a judge would read them (for blind screens). Usage: node e2e/page-text.mjs <base> <out.md>
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const [base = "https://nightshift-oracle.vercel.app", out = "page-text.md"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const parts = [];
for (const r of ["/", "/verify", "/scoreboard", "/proof", "/s/NVDAB"]) {
  await p.goto(base + r, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  for (let y = 0; y < 30000; y += 800) { await p.mouse.wheel(0, 800); await p.waitForTimeout(120); }
  await p.waitForTimeout(1500);
  const text = await p.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText);
  parts.push(`## Page ${r}\n\n${text.replace(/\n{3,}/g, "\n\n").slice(0, 7000)}`);
}
writeFileSync(out, parts.join("\n\n"));
console.log(`${out}: ${parts.join("").length} chars`);
await b.close();
