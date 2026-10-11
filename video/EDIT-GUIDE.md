# Nightshift demo: how to finish it

Everything here is ready except your voice. The picture is cut, captioned, scored and timed. When your ten voice files land, one command re-times every scene to them and mixes them in.

## What's in `video/out/`

| File | What it is |
|---|---|
| `nightshift-demo-draft.mp4` | Full cut, 3:19, 1080p30, music + burned-in captions, timed to estimated voice lengths |
| `nightshift-demo-draft-nomusic.mp4` | Same cut, no music, for your own mix |
| `captions.srt` | The captions as a separate track (YouTube → Subtitles → upload file) |
| `nightshift-demo.mp4` | **The final**, created by step 2 below once your voice files exist |

Source: `video/src` (Remotion, React). Footage: `video/public/capture` (the live site, recorded at 1080p), `video/public/broll` (NASA + Mixkit, licences in `CREDITS.md`), music in `video/public/music`.

## Step 1 · Generate the voice (ElevenLabs, ~15 min)

Follow `VOICEOVER.md`: model **Eleven v4**, Stability **0.55**, Similarity **0.75**, one voice for all scenes, one file per scene. Save them as:

```
video/public/vo/s1.mp3 … video/public/vo/s10.mp3
```

Listen to each. If a take rushes or a tag is read aloud, regenerate that scene only.

## Step 2 · Render the synced final (one command, ~10 min)

From the repo root in Git Bash:

```
cd video && pnpm exec remotion render Main out/nightshift-demo.mp4 --concurrency=6 --gl=angle && node --import tsx scripts/srt.mjs
```

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
Nightshift prices every bStock on BNB Chain for the next US open, around the clock: a fair value and a 90% band, sealed on-chain by three forecasters before the bell, scored by the official open, and read by contracts.

Live site: https://nightshift-oracle.vercel.app
Verify any forecast from your browser: https://nightshift-oracle.vercel.app/verify
Built on the Binance Web3 API (live telemetry): https://nightshift-oracle.vercel.app/stack
Code: https://github.com/iamdflame/nightshift

All figures in the video are live from BNB Chain mainnet and the Nightshift API (snapshot Oct 11 2026).

Footage: "Lights of Human Activity Shine in NASA's Image of Earth at Night" (NASA Goddard, public domain); Mixkit (Mixkit Stock Video Free License): full moon, city aerials, Milky Way, stars, clock.
Music: "Moon Walk" by Eugenio Mininni (Mixkit Stock Music Free License).
Characters and graphics: original.
```

Then paste the link into the submission form and into `docs/SUBMISSION.md` (the "Demo video" line).

## Checks before you submit
- [ ] Under 4:00 (the draft is 3:19; your voice may move it ±20 s).
- [ ] Every number you hear matches the screen (they come from the same snapshot: `video/src/data.json`).
- [ ] The video plays logged-out at 1080p.
- [ ] Don't say anyone "has been paid" unless `/proof` shows a settled ERC-8183 job.
