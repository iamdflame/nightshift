import { continueRender, delayRender, staticFile } from "remotion";

export const C = {
  night0: "#0A0F1E",
  night1: "#0F1628",
  night2: "#151E35",
  night3: "#1D2843",
  moon0: "#F4F1E8",
  moon1: "#E4E1D6",
  moon2: "#A9B0C2",
  moon3: "#858EA6",
  sodium: "#FFB23F",
  anchor: "#4A8CF0",
  echo: "#0FA37F",
  nfv: "#D66A98",
  up: "#59D98E",
  down: "#FF7A66",
  rule: "rgba(160,180,220,0.14)",
} as const;

export const F = {
  display: "Newsreader, Georgia, serif",
  sans: "'Instrument Sans', system-ui, sans-serif",
  mono: "'Martian Mono', ui-monospace, monospace",
  wordmark: "'Instrument Serif', Georgia, serif",
} as const;

export const FPS = 30;

const FONTS: [string, string, string?][] = [
  ["Newsreader", "fonts/newsreader.woff2", "200 800"],
  ["Instrument Sans", "fonts/instrument-sans.woff2", "400 700"],
  ["Martian Mono", "fonts/martian-mono.woff2", "100 800"],
  ["Instrument Serif", "fonts/instrument-serif.woff2"],
];

let loaded = false;
/** Brand fonts, loaded once before the first frame renders. */
export function loadFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fonts");
  Promise.all(
    FONTS.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(file)}) format("woff2")`, weight ? { weight } : {});
      document.fonts.add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
}
