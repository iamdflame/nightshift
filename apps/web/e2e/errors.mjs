import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
page.on("console", async (m) => { if (m.type() === "error") { console.log("ERR", m.text().slice(0, 300)); for (const a of m.args().slice(1, 3)) console.log("  arg:", String(await a.jsonValue().catch(() => "")).slice(0, 600)); } });
page.on("pageerror", (e) => console.log("PAGEERR", e.stack?.slice(0, 1500)));
await page.goto(process.argv[2], { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
await browser.close();
