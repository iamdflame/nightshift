// Renders the link-preview image (1200×630) and the touch icon from the live hero.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`${base}/?og`, { waitUntil: "networkidle" });
await page.addStyleTag({ content: "header{display:none!important} #hero-title{font-size:88px!important;max-width:12ch} .ns-hero-title+p{display:none} section[aria-labelledby=hero-title] p.mt-10{display:none}" });
await page.waitForTimeout(7000);
await page.screenshot({ path: "public/og.png" });
const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
await icon.setContent(`<body style="margin:0;background:#0A0F1E;display:grid;place-items:center;height:180px">${(await import("node:fs")).readFileSync("public/favicon.svg", "utf8").replace("<svg ", '<svg width="180" height="180" ')}</body>`);
await icon.screenshot({ path: "public/apple-touch-icon.png" });
await browser.close();
console.log("og.png + apple-touch-icon.png");
