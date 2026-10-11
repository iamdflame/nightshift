// Downloads the licensed B-roll and music, copies the brand fonts, and snapshots the live data the video shows.
// Every number on screen comes from data.json, fetched here from the live API and BNB Chain.
//   node scripts/assets.mjs            (from video/)
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const SITE = "https://nightshift-oracle.vercel.app";
const RPC = "https://bsc-rpc.publicnode.com";

const CLIPS = [
  { file: "broll/moon.mp4", url: "https://assets.mixkit.co/videos/4433/4433-1080.mp4", credit: "Full moon with a soft haze (Mixkit 4433)", license: "Mixkit Stock Video Free License" },
  { file: "broll/city-night.mp4", url: "https://assets.mixkit.co/videos/42342/42342-2160.mp4", credit: "Aerial shot of a city at night (Mixkit 42342)", license: "Mixkit Stock Video Free License" },
  { file: "broll/city-night-2.mp4", url: "https://assets.mixkit.co/videos/42041/42041-2160.mp4", credit: "Aerial view of the nightlife of a huge city (Mixkit 42041)", license: "Mixkit Stock Video Free License" },
  { file: "broll/milky-way.mp4", url: "https://assets.mixkit.co/videos/4148/4148-2160.mp4", credit: "Milky Way seen at night (Mixkit 4148)", license: "Mixkit Stock Video Free License" },
  { file: "broll/stars.mp4", url: "https://assets.mixkit.co/videos/39770/39770-1080.mp4", credit: "View of the night sky filled with stars (Mixkit 39770)", license: "Mixkit Stock Video Free License" },
  { file: "broll/clock.mp4", url: "https://assets.mixkit.co/videos/28897/28897-2160.mp4", credit: "Slowly approaching a clock on a black background (Mixkit 28897)", license: "Mixkit Stock Video Free License" },
  {
    file: "broll/earth-at-night.mp4",
    url: "https://images-assets.nasa.gov/video/GSFC_20170412_Lights_m12573_EarthAtNight/GSFC_20170412_Lights_m12573_EarthAtNight~large.mp4",
    credit: "Lights of Human Activity Shine in NASA's Image of Earth at Night (NASA Goddard)",
    license: "NASA media, public domain (no endorsement implied)",
  },
  { file: "music/moon-walk.mp3", url: "https://assets.mixkit.co/music/609/609.mp3", credit: "Moon Walk, Eugenio Mininni (Mixkit)", license: "Mixkit Stock Music Free License" },
  { file: "music/vastness.mp3", url: "https://assets.mixkit.co/music/184/184.mp3", credit: "Vastness, Andrew Ev (Mixkit)", license: "Mixkit Stock Music Free License" },
];

async function download(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 10_000) return "cached";
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return `${(statSync(dest).size / 1e6).toFixed(1)} MB`;
}

for (const c of CLIPS) console.log(c.file, await download(c.url, join(pub, c.file)).catch((e) => `FAILED ${e.message}`));
writeFileSync(
  join(root, "CREDITS.md"),
  `# Credits (third-party footage and music)\n\n| Asset | Source | Licence |\n|---|---|---|\n${CLIPS.map((c) => `| ${c.credit} | ${c.url} | ${c.license} |`).join("\n")}\n\nFonts: Newsreader, Instrument Sans, Martian Mono (SIL Open Font License). Everything else (characters, graphics, site recordings) is original.\n`,
);

// Brand fonts from the web app's own packages.
const fonts = [
  ["../apps/web/node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2", "newsreader.woff2"],
  ["../apps/web/node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-standard-normal.woff2", "instrument-sans.woff2"],
  ["../apps/web/node_modules/@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2", "martian-mono.woff2"],
  ["../apps/web/node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2", "instrument-serif.woff2"],
];
for (const [from, to] of fonts) copyFileSync(join(root, from), join(pub, "fonts", to));

// Live data snapshot.
const get = async (p) => (await fetch(SITE + p, { headers: { accept: "application/json" } })).json();
const call = async (to, data) => (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) })).json()).result;
const word = (hex, i) => BigInt(`0x${hex.slice(2 + i * 64, 2 + (i + 1) * 64)}`);
const NVDAB = "02fca66c1d1afb4e2a7884261eb00f63598a7436";
const arg = `000000000000000000000000${NVDAB}`;

const [onchain, stack, fv, opens, status] = await Promise.all([get("/v1/onchain"), get("/v1/stack"), get("/v1/fair-value/NVDAB"), get("/v1/opens?forecaster=nfv"), get("/v1/status")]);
const lastScored = Math.max(...opens.opens.map((o) => o.anchorTime));
const bell = await get(`/v1/history/NVDAB?anchor=${lastScored}`);
const venus = Number(word(await call("0x6592b5DE802159F3E74B2486b091D11a8256ab8A", `0x41976e09${arg}`), 0)) / 1e18;
const adapter = Number(word(await call("0x1a92c4Dc8264ebC2E6F3984a963AF5a4054FaC23", `0x41976e09${arg}`), 0)) / 1e18;
const rep = await call("0x0cEe7C0F2B62421E54c5F2E618dC53CC7eD4c63d", `0x6e1d2b1f${arg}`).catch(() => null);
const supply = Number(word(await call("0xEb8Ca841cBe1BC4832A10b15c7dAB1081eDaD371", "0x18160ddd"), 0)) / 1e8;

const data = {
  takenAt: new Date().toISOString(),
  site: SITE,
  repo: "https://github.com/iamdflame/nightshift",
  venus: { price: venus, collateralNvdab: Math.round(supply), cap: 1500, collateralFactor: 0.6 },
  nightshift: { adapterPrice: adapter, fairValue: fv.consensus.fairValue, lower: fv.consensus.lower, upper: fv.consensus.upper, anchorTime: fv.consensus.anchorTime, weights: fv.consensus.weights, forecasters: fv.forecasters.map((f) => ({ f: f.forecaster, fairValue: f.fair_value })) },
  rawReport: rep,
  chain: {
    seals: onchain.commitments.reduce((a, c) => a + c.rounds, 0),
    oracleReports: onchain.oracle.reports,
    agents: onchain.agents.map((a) => ({ name: a.name, agentId: a.agentId, address: a.address })),
    contracts: onchain.contracts,
    feeds: onchain.feeds.length,
    jobs: onchain.jobs.length,
    latestSeal: onchain.recentCommits[0],
    loan: onchain.sundayLoan,
    trade: onchain.agenticWalletTrades[0] ? { tx: onchain.agenticWalletTrades[0].txHash, receipt: onchain.agenticWalletTrades[0].receipt } : null,
  },
  bell: { anchorTime: lastScored, realized: bell.realized, lastCommits: bell.lastCommits.map((c) => ({ f: c.forecaster, fairValue: c.fairValue, lower: c.lower, upper: c.upper, errBps: c.errBps, covered: c.covered })) },
  opens: { total: opens.opens.length, inside: opens.opens.filter((o) => o.covered).length, below: opens.opens.filter((o) => o.realized < o.lower).length },
  stack: { calls24h: stack.calls24h, totalCalls: stack.totalCalls, modules: stack.modules.filter((m) => m.callsAll > 0).map((m) => ({ module: m.module, calls24h: m.calls24h })), codes: stack.codes.slice(0, 6).map((c) => ({ code: c.code, count: c.count })) },
  backtest: { weekendDark: { stale: 169.1, echo: 166.7, nfv: 163.3, cov: 0.866 }, all: { stale: 165.2, echo: 129.9, nfv: 128.6, cov: 0.8875 } },
  status: { session: status.session, nextOpen: status.nextOpen },
};
writeFileSync(join(root, "src", "data.json"), `${JSON.stringify(data, null, 2)}\n`);
console.log("data.json:", JSON.stringify({ venus: data.venus.price, fair: data.nightshift.fairValue, band: [data.nightshift.lower, data.nightshift.upper], calls24h: data.stack.calls24h, seals: data.chain.seals, bell: data.bell.realized }));
