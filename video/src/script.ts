/**
 * The voiceover, scene by scene: the same text as VOICEOVER.md (tags removed for captions). Scene lengths follow the
 * real voice files in public/vo/sN.mp3 when they exist, else these estimates.
 */
export const SCENES = [
  {
    id: "s1",
    estimate: 18,
    vo: "[softly] It's ten p.m. on a Saturday. Wall Street is asleep... but on BNB Chain, the stock market never closes. People are still trading NVIDIA. Lenders are still lending against it. So here's the question nobody can answer: what is it actually worth?",
  },
  {
    id: "s2",
    estimate: 27,
    vo: "A week has a hundred and sixty-eight hours. The US market sets a real price for thirty-two and a half of them. From Friday's close to Monday's bell, that's sixty-five hours in the dark... and sixty-two percent of bStocks' July volume traded while US markets were closed. When the market closes, the reference feeds stop updating. What's left is each token's own thin weekend trading.",
  },
  {
    id: "s3",
    estimate: 22,
    vo: "So that's what lenders read. Ask Venus what NVIDIA is worth tonight, and you get one number: the token's own trading price. We checked every dark weekend since June. That number called Monday's open barely better than Friday's close... and it comes with NO error bar at all.",
  },
  {
    id: "s4",
    estimate: 29,
    vo: "[warmly] Meet the night shift. Three forecasters, each with its own on-chain identity. Anchor holds on to Friday's close. Echo listens to the live market. And N-F-V, our model, reads every signal through the night. Every thirty minutes, each one seals its forecast for all ninety-one stocks... the price at the next open, and a ninety-percent range... into a contract on BNB Chain. Once it's sealed, nobody can change it. Not even us.",
  },
  {
    id: "s5",
    estimate: 19,
    vo: "And you don't have to trust us. Open the verify page. Your own browser fetches one forecast, rebuilds its proof, and asks the contract directly. No wallet. No sign-up. Change the forecast by a single cent... [pause] and the check fails. On-chain.",
  },
  {
    id: "s6",
    estimate: 26,
    vo: "Then the bell rings, and reality keeps score. At Friday's open, our model missed NVIDIA by six basis points, inside its range. Thursday's close missed by a hundred and forty-six. Across a hundred and seventy-four stock openings, only six landed below the range a lender would value collateral at. And through E-R-C eighty-one eighty-three jobs, a forecaster is only paid when the open proves it right.",
  },
  {
    id: "s7",
    estimate: 17,
    vo: "And contracts read it. At ten p.m. on a Saturday, we borrowed against NVIDIA on mainnet, with the collateral valued at the low edge of the range. The same price ships as Chainlink-compatible feeds, and as an adapter Venus can plug straight in.",
  },
  {
    id: "s8",
    estimate: 19,
    vo: "Every price here starts as a Binance Web3 API call... more than ten thousand of them a day. R-W-A Data for every stock. A quote ladder that probes real liquidity around the clock. M-E-V protected broadcasts. And b-four-oh-two payments. Every call, and every error, is logged live.",
  },
  {
    id: "s9",
    estimate: 17,
    vo: "Any agent can use it. With a Binance Agentic Wallet and our skill, an agent finds the cheapest real share, checks it against the range, and only then buys. It can even pay a cent for each answer, over x-four-oh-two.",
  },
  {
    id: "s10",
    estimate: 10,
    vo: "[confident] Wall Street sleeps. Nightshift doesn't. Check any forecast yourself, at nightshift-oracle dot vercel dot app.",
  },
] as const;

/** Spoken spellings back to how a reader writes them, for captions. */
const WRITTEN: [RegExp, string][] = [
  [/\[[^\]]+\]\s*/g, ""],
  [/N-F-V/g, "NFV"],
  [/R-W-A/g, "RWA"],
  [/M-E-V/g, "MEV"],
  [/E-R-C eighty-one eighty-three/g, "ERC-8183"],
  [/b-four-oh-two/g, "b402"],
  [/x-four-oh-two/g, "x402"],
  [/nightshift-oracle dot vercel dot app/g, "nightshift-oracle.vercel.app"],
  [/ten p\.m\./g, "10 p.m."],
  [/a hundred and sixty-eight/g, "168"],
  [/thirty-two and a half/g, "32.5"],
  [/sixty-five/g, "65"],
  [/sixty-two percent/g, "62%"],
  [/thirty minutes/g, "30 minutes"],
  [/ninety-one/g, "91"],
  [/ninety-percent/g, "90%"],
  [/six basis points/g, "6 basis points"],
  [/a hundred and forty-six/g, "146"],
  [/a hundred and seventy-four/g, "174"],
  [/only six/g, "only 6"],
  [/ten thousand/g, "10,000"],
  [/\.\.\./g, "…"],
];
export const captionText = (vo: string) => WRITTEN.reduce((s, [re, to]) => s.replace(re, to), vo).replace(/\s+/g, " ").trim();

/** Captions in readable chunks (a sentence, or up to ~11 words), each with its share of the scene by length. */
export function captionChunks(vo: string): { text: string; from: number; to: number }[] {
  // Sentence ends are punctuation followed by a space, so "32.5" stays whole.
  const sentences = captionText(vo).split(/(?<=[.!?…:])(?<![ap]\.m\.)\s+/);
  const chunks: string[] = [];
  for (const s of sentences) {
    const words = s.trim().split(" ").filter(Boolean);
    if (!words.length) continue;
    for (let i = 0; i < words.length; i += 11) {
      const part = words.slice(i, i + 11);
      if (part.length < 4 && chunks.length && i > 0) chunks[chunks.length - 1] += ` ${part.join(" ")}`;
      else chunks.push(part.join(" "));
    }
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let at = 0;
  return chunks.map((text) => {
    const from = at / total;
    at += text.length;
    return { text, from, to: at / total };
  });
}
