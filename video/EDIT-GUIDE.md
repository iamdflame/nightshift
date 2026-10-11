# Nightshift demo: how to finish it

Everything here is ready except your voice. The picture is cut, captioned, scored and timed. When your ten voice files land, one command re-times every scene to them and mixes them in.

## What's in `video/out/`

| File | What it is |
|---|---|
| **`nightshift-demo-final.mp4`** | **Upload this one.** Your ElevenLabs voice, synced: 3:00, 1080p30, H.264 + AAC 320k, mastered to -14.4 LUFS / -1.5 dBTP (YouTube's level), music ducked under speech, burned-in captions on the measured timings. |
| `nightshift-demo.mp4` | The same render before the final +2 dB loudness pass |
| `captions.srt` | The same captions as a separate track (YouTube → Subtitles → upload file) |
| `thumbnail.png` | 1280×720 YouTube thumbnail |
| `nightshift-demo-draft*.mp4` | Earlier drafts at estimated timings (no voice); keep or delete |

How the sync works: `scripts/align.mjs` finds the pauses in each voice file, snaps every sentence of the script to them, and writes `src/align.json`. The scenes cue their beats to those spoken phrases: each owl walks on as it's named, the envelopes fly on "every thirty minutes", and the scores land on their sentences. It also normalises the voice loudness and builds the music ducking map. If you replace a voice file, run `node --import tsx scripts/align.mjs` before rendering.

## Step 1 · Generate the voice (ElevenLabs, ~15 min)

Follow `VOICEOVER.md`: model **Eleven v4**, Stability **0.55**, Similarity **0.75**, one voice for all scenes, one file per scene. Save them as:

```
video/public/vo/s1.mp3 … video/public/vo/s10.mp3
```

Listen to each. If a take rushes or a tag is read aloud, regenerate that scene only.

## Step 2 · Render the synced final (one command, ~10 min)

From the repo root in Git Bash:

```
cd video && node --import tsx scripts/align.mjs && pnpm exec remotion render Main out/nightshift-demo.mp4 --concurrency=3 --gl=angle --offthreadvideo-cache-size-in-bytes=700000000 && node --import tsx scripts/srt.mjs
```

(Concurrency 3 and the 700 MB frame cache keep the render inside this PC's free memory; higher settings ran out of memory and failed with "No frame found at position".)

- Every scene stretches or shrinks to its voice file, plus 0.3 s before and 0.7 s after.
- The music drops under the voice automatically.
- The captions and the SRT follow the new timings.
- Or tell me the files are in, and I'll render it and check it.

To preview and scrub before rendering: `cd video && pnpm exec remotion studio` (opens in your browser).

## Step 3 · Your edit (optional)

If you'd rather finish in CapCut, DaVinci Resolve or Premiere:
- **Picture:** use `nightshift-demo-draft-nomusic.mp4` (or the final from step 2 without music: add `--props='{"music":""}'`).
- **Voice:** lay `s1`–`s10` on the voice track. Scene starts in the draft, at estimated lengths: S1 0:00, S2 0:17.5, S3 0:44, S4 1:05.5, S5 1:34, S6 1:52.5, S7 2:18, S8 2:34.5, S9 2:53, S10 3:09.5. Nudge to taste.
- **Music:** `public/music/moon-walk.mp3` (alternative: `vastness.mp3`). Bring it to about **−22 to −24 LUFS** under a voice at **−14 to −16 LUFS**, duck 4–6 dB while speaking, fade in over 1.5 s and out over 2.5 s.
- **Sound effects (optional):** a soft bell on the 09:30 clock in S6 (~1:53 in the draft) and a light "whoosh" on scene changes. Use free SFX: Mixkit "Sound Effects Free License" or the YouTube Audio Library.
- **Export:** H.264 MP4, 1920×1080, 30 fps, 12–16 Mbps, AAC 320 kbps, 48 kHz.

## Step 4 · Upload (YouTube, unlisted)

- **Title:** `Nightshift: the price of a stock when Wall Street is asleep (BNB Hack: Tokenized Stocks)`
- **Visibility:** Unlisted (the form needs a shareable link). Open it in a logged-out window to check it plays.
- **Subtitles:** upload `out/captions.srt` (English).
- **Thumbnail:** `apps/web/public/og.png` (1200×630; YouTube accepts it), or a still from S4 (the owls).
- **Description:**

```
Nightshift prices every bStock on BNB Chain for the next US open, around the clock: a fair value and a 90% band, sealed on-chain by three forecasters before the bell and scored against the official open. Contracts can read it through Chainlink-compatible feeds and a Venus-compatible adapter.

Live site: https://nightshift-oracle.vercel.app
Verify any forecast from your browser (no wallet): https://nightshift-oracle.vercel.app/verify
Binance Web3 API telemetry: https://nightshift-oracle.vercel.app/stack
Code: https://github.com/iamdflame/nightshift

All figures in the video come from BNB Chain mainnet and the Nightshift API (snapshot Oct 11 2026). Backtest: 70 gaps, 60,794 out-of-sample forecasts, Jun 11 to Oct 7 2026.

Footage: "Lights of Human Activity Shine in NASA's Image of Earth at Night" (NASA Goddard, public domain); Mixkit (Mixkit Stock Video Free License): full moon, city aerials, Milky Way, stars, clock.
Music: "Moon Walk" by Eugenio Mininni (Mixkit Stock Music Free License).
Characters and graphics: original.
Voice: ElevenLabs.
```

(If your ElevenLabs plan is the free tier, keep the "Voice: ElevenLabs" credit: the free tier requires attribution.)

Then paste the link into the submission form and into `docs/SUBMISSION.md` (the "Demo video" line).

## Checks before you submit
- [ ] Under 4:00 (the draft is 3:19; your voice may move it ±20 s).
- [ ] Every number you hear matches the screen (they come from the same snapshot: `video/src/data.json`).
- [ ] The video plays logged-out at 1080p.
- [ ] Don't say anyone "has been paid" unless `/proof` shows a settled ERC-8183 job.
