/**
 * One-time asset pipeline: download licensed sources (see /credits) into a cache outside the repo,
 * then write web-ready files into public/. Outputs are committed; sources are not.
 *
 *   pnpm --filter @nightshift/web assets
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const CACHE = process.env.ASSET_CACHE ?? join(process.env.TEMP ?? "/tmp", "nightshift-assets");
const PUB = join(import.meta.dirname, "..", "public");
mkdirSync(CACHE, { recursive: true });
for (const d of ["img", "tex", "data"]) mkdirSync(join(PUB, d), { recursive: true });

async function fetchTo(url: string, name: string): Promise<string> {
  const p = join(CACHE, name);
  if (existsSync(p)) return p;
  const res = await fetch(url, { headers: { "user-agent": "nightshift-asset-pipeline/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${name} (${(readFileSync(p).length / 1e6).toFixed(1)} MB)`);
  return p;
}

/** Duotone to night ink (shadows) → moonlight (highlights), keeping real sodium highlights if asked. */
async function duotone(src: string, out: string, opts: { widths: number[]; keepWarm?: boolean; crop?: { w: number; h: number }; brightness?: number }) {
  const meta = await sharp(src).metadata();
  for (const w of opts.widths) {
    let img = sharp(src).rotate();
    if (opts.crop) img = img.resize({ width: Math.round(w), height: Math.round((w * opts.crop.h) / opts.crop.w), fit: "cover", position: "attention" });
    else img = img.resize({ width: Math.min(w, meta.width ?? w) });
    const base = opts.keepWarm
      ? img.modulate({ saturation: 0.55, brightness: opts.brightness ?? 0.82 }).tint({ r: 205, g: 196, b: 175 })
      : img.modulate({ saturation: 0, brightness: opts.brightness ?? 0.92 }).tint({ r: 132, g: 152, b: 206 });
    const buf = await base.toBuffer();
    await sharp(buf).avif({ quality: 52, effort: 5 }).toFile(join(PUB, "img", `${out}-${w}.avif`));
    await sharp(buf).webp({ quality: 74 }).toFile(join(PUB, "img", `${out}-${w}.webp`));
  }
  console.log(`img ${out}: ${opts.widths.join("/")}`);
}

const PHOTOS: { name: string; url: string; keepWarm?: boolean; crop?: { w: number; h: number }; brightness?: number }[] = [
  { name: "nyse-night", url: "https://images.pexels.com/photos/5691263/pexels-photo-5691263.jpeg", crop: { w: 16, h: 10 } },
  { name: "observatory", url: "https://images.unsplash.com/photo-1727034394040-0377258a5791?w=2600", crop: { w: 16, h: 10 } },
  { name: "sodium-street", url: "https://images.unsplash.com/photo-1708787028963-69721f38f454?w=2600", keepWarm: true, crop: { w: 16, h: 10 }, brightness: 0.78 },
  { name: "manhattan", url: "https://images.unsplash.com/photo-1559094522-79422598840f?w=2600", crop: { w: 16, h: 9 } },
  { name: "milkyway", url: "https://images.unsplash.com/photo-1614580378008-bb0fee1ade02?w=2600", crop: { w: 16, h: 9 }, brightness: 1 },
];

async function textures() {
  // Moon: LRO color 2k (public domain, NASA SVS 4720) + 8-bit elevation → normal map.
  const color = await fetchTo("https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg", "lroc_color_2k.jpg");
  await sharp(color).resize(2048, 1024).jpeg({ quality: 84, mozjpeg: true }).toFile(join(PUB, "tex", "moon-color-2k.jpg"));
  await sharp(color).resize(1024, 512).jpeg({ quality: 82, mozjpeg: true }).toFile(join(PUB, "tex", "moon-color-1k.jpg"));
  const ldem = await fetchTo("https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg", "ldem_3_8bit.jpg");
  const { data, info } = await sharp(ldem).greyscale().resize(1024, 512).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, out = Buffer.alloc(W * H * 3), k = 3.2;
  const h = (x: number, y: number) => data[((y + H) % H) * W + ((x + W) % W)]! / 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k;
      const n = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 3;
      out[i] = Math.round(((-dx / n) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((-dy / n) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / n) * 0.5 + 0.5) * 255);
    }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toFile(join(PUB, "tex", "moon-normal-1k.png"));
  console.log("tex moon: color 2k/1k + normal 1k");

  // Earth: Black Marble 2016 (night lights) + Blue Marble NG January (day), public domain.
  const night = await fetchTo("https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg", "blackmarble_01deg.jpg");
  await sharp(night).resize(2048, 1024).jpeg({ quality: 82, mozjpeg: true }).toFile(join(PUB, "tex", "earth-night-2k.jpg"));
  const day = await fetchTo("https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/bmng/bmng-topography-bathymetry/january/world.topo.bathy.200401.3x5400x2700.jpg", "bluemarble_jan.jpg");
  await sharp(day).resize(2048, 1024).modulate({ saturation: 0.7, brightness: 0.9 }).jpeg({ quality: 80, mozjpeg: true }).toFile(join(PUB, "tex", "earth-day-2k.jpg"));
  console.log("tex earth: day + night 2k");
}

/** Real stars ≤ mag 5.5 as a compact array: [ra(deg), dec(deg), mag, bv] × N, plus constellation lines. */
async function stars() {
  const s = JSON.parse(readFileSync(await fetchTo("https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/stars.6.json", "stars.6.json"), "utf8")) as {
    features: { properties: { mag: number; bv: string | number }; geometry: { coordinates: [number, number] } }[];
  };
  const rows: number[] = [];
  for (const f of s.features) {
    const m = f.properties.mag;
    if (m > 5.5) continue;
    const [lon, lat] = f.geometry.coordinates; // d3-celestial: lon = RA in degrees (−180..180), lat = Dec
    const ra = (lon + 360) % 360;
    const bv = Number(f.properties.bv);
    rows.push(+ra.toFixed(3), +lat.toFixed(3), +m.toFixed(2), Number.isFinite(bv) ? +bv.toFixed(2) : 0.6);
  }
  writeFileSync(join(PUB, "data", "stars.json"), JSON.stringify({ fields: ["ra", "dec", "mag", "bv"], data: rows }));
  const lines = JSON.parse(readFileSync(await fetchTo("https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json", "constellations.lines.json"), "utf8")) as {
    features: { id: string; geometry: { coordinates: [number, number][][] } }[];
  };
  const segs = lines.features.map((f) => ({ id: f.id, lines: f.geometry.coordinates.map((l) => l.map(([lon, lat]) => [+((lon + 360) % 360).toFixed(2), +lat.toFixed(2)])) }));
  writeFileSync(join(PUB, "data", "constellations.json"), JSON.stringify(segs));
  console.log(`stars: ${rows.length / 4} (≤5.5 mag), constellations: ${segs.length}`);
}

const only = process.argv[2];
if (!only || only === "photos") for (const p of PHOTOS) await duotone(await fetchTo(p.url, `${p.name}.jpg`), p.name, { widths: [960, 1600, 2400], keepWarm: p.keepWarm, crop: p.crop, brightness: p.brightness });
if (!only || only === "textures") await textures();
if (!only || only === "stars") await stars();
console.log("assets done");
