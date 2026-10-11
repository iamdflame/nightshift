# Nightshift web: design system ("Night Ephemeris")

Read this whole file before writing UI. The full research brief is `.apex/research/UI-brief.md`.

## The idea
An observatory's night log crossed with a tide table. Predictions are written down and sealed before the bell; reality is plotted against them at the bell. The site is a night sky over Wall Street that is also a clock.

## Non-negotiable truth rules
- **Every number, line, dot and meteor comes from the API or the chain.** No illustrative data, no fake charts, no count-up from zero, no "simulated" anything. If data is missing, show an empty state that says when it will exist (e.g. "The next forecast is sealed at 14:00 UTC").
- Things that are TRUE right now (don't contradict them):
  - Commitments for the **Mon Oct 12 13:30 UTC** open are on BSC (`commitments.chain = "committed"`). Oct 8/9 rounds were scored by the official open but were **not** committed on-chain ("missed"), because publishing started Fri Oct 9 21:30 UTC.
  - **No ERC-8183 job has been funded or paid yet** (`/v1/onchain` → `jobs: []`). Never say a forecaster "got paid". Say "paid through ERC-8183 escrow only when right; first jobs open with the next funding" only if `jobs.length === 0`.
  - The consensus band does **not** narrow toward the bell in the data: it's constant within a state (≈270 bps live, ≈390 bps dark). Don't animate it narrowing. Show the stepped band travelling to the bell, ending in a bracket [lower, upper] at the bell line.
  - Real live outcome to tell (compute from `/v1/opens` and `/v1/history?…`, never hardcode): Fri Oct 9 NVDAB last consensus ≈ $234.14 (band ≈ $230.98–$237.36); official open ≈ $234.01 per token, inside the band.
- Judging runs across Monday's US open. Branch on `state`/`session`: when `session === "regular"` the label is "Live fair value (market open)", there's no bell countdown, and copy must not assume a weekend.

## Tokens (`src/styles/app.css`, Tailwind v4 `@theme`)
- Surfaces: `bg-night-0` page, `night-1` sunken, `night-2` cards, `night-3` popovers. Hairlines: `border-rule` / `shadow-[var(--elev-1)]` (`.card`, `.card-raised`).
- Text: `text-moon-0` (headlines, big numbers), `moon-1` body, `moon-2` secondary, `moon-3` meta (**only on night-0/night-1**, never on night-2).
- **Sodium `#FFB23F` (`text-sodium`, `bg-sodium`) means only: the bell, the consensus, real on-chain events, focus, the one primary CTA per view.** About 5% of pixels or less. Never decoration.
- Forecasters (data only, never text color): `anchor #4A8CF0`, `echo #097C60`, `nfv #D66A98` (CVD-validated). Always direct-label series. Labels are `moon-1` text with a small colored key. Secondary encodings: anchor dash `6 4` and circle marker, echo `2 3` and square, nfv `8 3 2 3` and diamond.
- Up `#59D98E` / down `#FF7A66`: always with `+`/`−` and ▲/▼.
- Radii: controls 6px, cards 10px. Elevation: lighter surface, then hairline, then shadow (popovers only). No colored glows except the amber band fill.

## Type
- `font-display` Newsreader (headlines; hero weight 300, `clamp(2.75rem, 5vw + 1rem, 5.75rem)/1.04`, tracking −0.025em, balanced).
- `font-wordmark` Instrument Serif (the "Nightshift" wordmark only).
- `font-sans` Instrument Sans (UI/body 16px/1.55; labels 13–14px weight 500, **sentence case**).
- `.num` Martian Mono, tabular, slashed zero: for values only (prices, bps, hashes, times). **Never mono for labels.**
- Banned: all-caps eyebrows, letter-spaced caps, middle-dot meta strings ("a · b · c"), "WORD — fragment" labels, emoji, arrows appended to link text, highlighting one word in a headline.

## Motion (`src/lib/motion.ts`; `MotionConfig reducedMotion="user"` is global)
- Easing: out `(0.23,1,0.32,1)`, std `(0.2,0,0,1)`, travel `(0.77,0,0.175,1)`. Never ease-in on UI.
- Durations 120/160/220/360 ms. Springs `spring.ui` / `digit` / `icon` (bounce 0). `spring.settle` (bounce 0.15) only for the realized-open dot landing.
- Press: `.pressable` (scale 0.97 on pointer-down). Hover only under `(hover:hover) and (pointer:fine)`; rows and links change color or background only; cards don't lift.
- Enter: opacity + 4px blur + 12px rise, 300–500 ms, stagger 60–100 ms (`enter` in motion.ts). **Not on every section**: use it where it reveals data.
- Big moments are allowed and wanted (this is a showcase), but each one is tied to real data: meteors = real commits, beam pulses = real txs, line draws = real rounds, the bell = the real next open.
- GSAP (ScrollTrigger, SplitText, DrawSVG are free in 3.13+): use `useGSAP` from `@gsap/react` with a scope; wrap in `gsap.matchMedia()` with a `(prefers-reduced-motion: no-preference)` branch; reduced motion = final frame, no pin, no scrub.
- Lenis smooth scroll is mounted once by the landing page only (not app pages).
- three.js / R3F: lazy-load (`React.lazy`), `dpr={[1, 1.5]}`, `frameloop` off when offscreen, fewer stars on mobile, `aria-hidden` canvas plus a text equivalent, one static frame under reduced motion.
- Anything that moves automatically for more than 5 s gets a pause control (WCAG 2.2.2).

## Components you must reuse (don't fork)
- `@/components/ui/HashChip`: every tx, address or root (middle-truncate, copy morph, BscScan).
- `@/components/ui/SlidingNumber`: live values that change (only in heroes/headers, not 91-row tables).
- `@/components/ui/Countdown`: text-only countdown to a timestamp.
- `@/components/brand/Mark`: the crescent-bell mark.
- `@/lib/format`: `usd`, `bps`, `pct`, `short`, `et`, `utc`, `duration`, `ago`, `SESSION_LABEL`.
- `@/lib/links`: `ADDR`, `FORECASTERS` (addresses, agentIds), `bscscan`. Constants only (no viem).
- `@/lib/chain`: the viem client + ABIs. **Import only inside lazily loaded components** (it pulls about 80 KB gz).
- `@/lib/queries`: React Query hooks (`useStatus`, `useRadar`, `useFairValue`, `useHistory`, `useOnchain`, `useOpens`, `useRounds`, `useScoreboard`, `useResults`, `useWhich`, `useX402`).
- `@/lib/sound`: `ringBell()`, `tick()` (no-ops unless the viewer turned sound on).
- `@ns/calendar`: `sessionAt`, `nextRegularOpen`, `lastRegularClose`, `etParts`, `etToUtc` (real US market calendar, DST- and holiday-aware).
- Images: `@/components/ui/Photo` (`<picture>` with AVIF/WebP srcset from `/img/<name>-{960,1600,2400}.{avif,webp}`): `nyse-night`, `observatory`, `sodium-street` (keeps real warm light), `manhattan`, `milkyway`.
- Textures in `/tex/`: `moon-color-2k.jpg`, `moon-color-1k.jpg`, `moon-normal-1k.png` (NASA LRO), `earth-day-2k.jpg`, `earth-night-2k.jpg` (NASA Blue/Black Marble). Stars: `/data/stars.json` `{fields:[ra,dec,mag,bv], data:[...flat]}` (2,851 stars ≤5.5 mag), `/data/constellations.json` `[{id, lines:[[[ra,dec],…]]}]`.

## Layout
- Max content width 1320px, gutters 16px (mobile) and 24px. Sections breathe: 128–176px vertical on desktop, 88px on mobile.
- Header is fixed and 64px tall: leave `pt-24` or more on page tops.
- Mobile first: works at 320px and 200% zoom; tables become cards under 640px; touch targets ≥ 44px under coarse pointers.
- Every page sets `<title>` (React 19 hoists it) as `"<Page> · Nightshift"`.

## Accessibility
- Text ≥ 4.5:1; chart lines, focus rings and band edges ≥ 3:1. `:focus-visible` ring is global; don't remove it.
- Real `<table>`s with `th scope`, `aria-sort`. Charts: `aria-label` summary plus a "View as table" toggle.
- Live values: `aria-live="polite"`, throttled (at most 1 per 10 s). Countdowns are not live regions.
- Errors: `role="alert"`, and say exactly what mismatched and what to try.

## Data notes
- API is same-origin (`/v1/*`); in dev Vite proxies to :8787. New endpoints: `/v1/history/:token`, `/v1/onchain`, `/v1/opens?forecaster=` (shapes in `src/lib/api.ts`).
- Prices are USD **per token**; per share = per token ÷ `sharesPerToken`.
- Times always show their zone ("09:30 ET", "13:30 UTC").
- The forecaster wallets and ERC-8004 IDs: anchor 370891, echo 370892, nfv 370893 (scorer 370890, trade 370894).
