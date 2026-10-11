# Nightshift demo: voiceover script and ElevenLabs settings

Ten short scenes, about 500 words, about 3:20 spoken. Generate **one file per scene**, name them `s1.mp3` … `s10.mp3`, and drop them in `video/public/vo/`. The video times every scene to its file, so pauses and pace are yours to choose.

## ElevenLabs settings (Eleven v4)

| Setting | Value | Why |
|---|---|---|
| Model | **Eleven v4** (`eleven_v4`) | Highest quality; supports audio tags |
| Voice | One voice for all ten scenes (see below) | Consistency across files |
| Stability | **0.55** (try 0.45 if it sounds flat, 0.65 if takes vary too much between scenes) | Narration: steady but alive |
| Similarity | **0.75** (lower to 0.6 if you hear artifacts) | Default adherence to the voice |
| Style / Speed | Not available on v4 | Pace comes from punctuation, ellipses and the few tags below |
| Output | MP3 44.1 kHz 192 kbps (or WAV 44.1 kHz) | Clean for the edit |

**Voice:** a calm, confident documentary narrator, mid-to-low register, neutral or soft British/American accent. In the Voice Library filter by "Narrative & Story" or "Documentary"; audition with scene 4. A narration voice ElevenLabs uses in its own v4 audiobook example is `KHRvDizAHFVPzoSehNY6` (try it, but pick by ear).

**How to generate:**
- Paste one scene at a time (everything inside its quote block, tags included).
- Make 2 to 3 takes per scene and keep the best. v4 varies take to take, which is normal.
- If a tag gets read aloud instead of performed, delete it and regenerate.
- Keep the same voice, Stability and Similarity for all ten.

**How the script is written:**
- Pauses are written as `...` and the occasional `[pause]`. CAPS mark a stressed word; there are only a few.
- Acronyms are spelled the way they should sound: "N-V-D-A-B", "E-R-C", "x-four-oh-two". That's deliberate, because v4 has no pronunciation tags.

---

## S1 · Cold open (~18 s, picture: clouds → moon → New York at night → title)

> [softly] It's ten p.m. on a Saturday. Wall Street is asleep... but on BNB Chain, the stock market never closes. People are still trading NVIDIA. Lenders are still lending against it. So here's the question nobody can answer: what is it actually worth?

## S2 · The dark weekend (~27 s, picture: Earth at night, the week bar, the weekend clock)

> A week has a hundred and sixty-eight hours. The US market sets a real price for thirty-two and a half of them. From Friday's close to Monday's bell, that's sixty-five hours in the dark... and sixty-two percent of bStocks' July volume traded while US markets were closed. When the market closes, the reference feeds stop updating. What's left is each token's own thin weekend trading.

## S3 · What a lender reads (~22 s, picture: the same getPrice call, two answers)

> So that's what lenders read. Ask Venus what NVIDIA is worth tonight, and you get one number: the token's own trading price. We checked every dark weekend since June. That number called Monday's open barely better than Friday's close... and it comes with NO error bar at all.

## S4 · Meet the night shift (~29 s, picture: the three owls seal envelopes into the vault)

> [warmly] Meet the night shift. Three forecasters, each with its own on-chain identity. Anchor holds on to Friday's close. Echo listens to the live market. And N-F-V, our model, reads every signal through the night. Every thirty minutes, each one seals its forecast for all ninety-one stocks... the price at the next open, and a ninety-percent range... into a contract on BNB Chain. Once it's sealed, nobody can change it. Not even us.

## S5 · Don't trust us (~19 s, picture: the verify page, then tamper)

> And you don't have to trust us. Open the verify page. Your own browser fetches one forecast, rebuilds its proof, and asks the contract directly. No wallet. No sign-up. Change the forecast by a single cent... [pause] and the check fails. On-chain.

## S6 · The bell (~26 s, picture: the clock, the bell, the scores)

> Then the bell rings, and reality keeps score. At Friday's open, our model missed NVIDIA by six basis points, inside its range. Thursday's close missed by a hundred and forty-six. Across a hundred and seventy-four stock openings, only six landed below the range a lender would value collateral at. And through E-R-C eighty-one eighty-three jobs, a forecaster is only paid when the open proves it right.

## S7 · Contracts read it (~17 s, picture: the loan transactions, feeds and the Venus adapter)

> And contracts read it. At ten p.m. on a Saturday, we borrowed against NVIDIA on mainnet, with the collateral valued at the low edge of the range. The same price ships as Chainlink-compatible feeds, and as an adapter Venus can plug straight in.

## S8 · Built on Binance Web3 (~19 s, picture: the live API counter, the stack page)

> Every price here starts as a Binance Web3 API call... more than ten thousand of them a day. R-W-A Data for every stock. A quote ladder that probes real liquidity around the clock. M-E-V protected broadcasts. And b-four-oh-two payments. Every call, and every error, is logged live.

## S9 · Any agent can use it (~17 s, picture: the Agentic Wallet terminal, the receipt)

> Any agent can use it. With a Binance Agentic Wallet and our skill, an agent finds the cheapest real share, checks it against the range, and only then buys. It can even pay a cent for each answer, over x-four-oh-two.

## S10 · Outro (~9 s, picture: the owls, the logo, the URL)

> [confident] Wall Street sleeps. Nightshift doesn't. Check any forecast yourself, at nightshift-oracle dot vercel dot app.

---

## Fact check (every spoken number is real)

| Line | Source |
|---|---|
| 168 h / 32.5 h / 65 h dark | US market calendar: regular sessions, Fri 16:00 → Mon 09:30 ET = 65.5 h |
| 62% of bStocks' July volume while US markets were closed | [Crypto Briefing, Aug 26 2026](https://cryptobriefing.com/binance-bstocks-volume-us-market-closures/) |
| Reference feeds stop | Chainlink docs: "These feeds do not publish updates, including heartbeat updates, while markets are closed" |
| Venus prices NVDAB from the token's own trading | On-chain read, Oct 11: ResilientOracle → "SingleFeed NVDAB/USD" |
| Barely better than Friday's close | Backtest, fully dark weekends: 166.7 vs 169.1 bps CRPS |
| 91 stocks, every 30 minutes, sealed | ForecastBook commits (207 roots so far for Monday's open) |
| Friday's open: NFV 6 bps, Thursday's close 146 bps | `/v1/history/NVDAB?anchor=…` Oct 9 13:30 UTC (NFV +6.2, anchor −146.2) |
| 6 of 174 below the range | `/v1/opens` (Oct 8 and Oct 9 opens, 87 stocks each) |
| ERC-8183: paid only when right | The job rule (beat the no-skill baseline). Don't say anyone *has* been paid until `/proof` shows a settled job |
| Loan at 10 p.m. Saturday ET | NightshiftCredit borrow tx 0xffab…1982, Oct 11 02:00 UTC |
| 10,000+ calls a day | `/v1/stack`: 10,976 in the last 24 h (Oct 11 05:50 UTC) |
| A cent per answer over x402 | `/x402/price`: live, 0.01 USD |
