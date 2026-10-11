# Demo video script (target 3:00, limit 4:00)

Recorded on the live site, https://nightshift-oracle.vercel.app, against real BSC mainnet data. The voice is yours: read the "Say" column in your own words. Captions carry the key numbers for judges who watch muted.

**Setup:** Chrome, 1920×1080, zoom 100%, a fresh window with no extensions showing. Turn the sound on in the site header (speaker icon): the bell rings when the dark-weekend clock reaches 09:30. Scroll slowly with the mouse wheel; the chapters are scroll-driven.

| Time | Screen | Say | On-screen text |
|---|---|---|---|
| 0:00–0:15 | Home, top. Let the sky settle 3 seconds: tonight's real stars over Wall Street, amber streaks crossing it, the NVDAB card on the right. | "Every amber streak in this sky is an AI agent sealing a forecast on BNB Chain: what NVIDIA will open at on Monday, committed on a weekend, before the market opens." | Each streak is a real forecast sealed on BNB Chain |
| 0:15–0:45 | Scroll into "The dark weekend". Let the clock run from Friday 16:00 to the bell; pause on each caption. | "Tokenized stocks trade 168 hours a week. The real market sets a price for 32 and a half. 62% of bStocks' July volume happened while it was closed, and that's exactly when oracles stop: Chainlink's own docs say their equity feeds don't update while markets are closed. Nightshift keeps pricing through the dark: this is NVIDIA's fair value and 90% band for Monday's open, and every tick below it is a sealed forecast." | 65.5 hours with no reference price. 62% of volume. |
| 0:45–1:05 | "How a forecast becomes a price": the diagram, then click "Latest seal" and show the BscScan tab. | "Three forecaster agents, each with an ERC-8004 identity, seal a Merkle root of their forecasts for all 91 bStocks every 30 minutes. Once it's on-chain, nobody can change it, not even us." | ERC-8004 agents. Sealed every 30 minutes. |
| 1:05–1:30 | Header → Verify. Keep the defaults (NVDAB, NFV, latest round), press "Verify on BNB Chain", let the five steps light up. Then tick "Tamper with it" and verify again. | "You don't have to trust us. This page fetches one forecast and its proof, recomputes the hash in your browser and asks the contract on BNB Chain directly. No wallet. Change the forecast by one cent, and it fails, on-chain too." | Verified on BNB Chain, from your browser |
| 1:30–1:50 | Back to Home → scroll to "Borrow against NVIDIA…". Click the borrow transaction. | "Because the dark hours now have a price, you can borrow against a stock on a weekend. Our credit vault values NVIDIA at the low edge of the band, Monday's bad case, not Friday's close. This loan is real, taken on mainnet on a Saturday night." | A loan against NVIDIA, on a Saturday night |
| 1:50–2:15 | Scroll to "Reality scores them" (the backtest chart draws), then header → Scoreboard. | "Then the bell rings, and reality grades every forecast. Out of sample over 70 gaps, our model's error is 22% lower than a stale oracle's. On the live opens, it was 49% and 31% lower. The scores are public, and ERC-8183 jobs on BNB's commerce contracts are built to pay only the forecasters that beat the stale price." | −22% backtest. −49% and −31% live. |
| 2:15–2:35 | Header → Radar. Type NVDA in the filter, open NVDAB: the fan chart, then scroll to "Which NVDA?". | "All 91 bStocks, priced for the next open. Each stock shows how the forecast evolved, every seal with its transaction, the oracle report read straight from the chain, and which token gives you the cheapest real share." | 91 bStocks, priced for the next open |
| 2:35–2:55 | Claude Code with the Agentic Wallet and the Nightshift skill: ask it to buy $1 of NVDA. Then "On-chain proof" → "Trades and loan" tab showing the receipt line. | "And any agent can use it. With a Binance Agentic Wallet and our skill, the agent checks fair value first and only buys inside the band. Then it gets a receipt rebuilt from on-chain logs: this buy was 35 basis points above fair value, inside the band." | Agentic Wallet + Nightshift skill + receipts |
| 2:55–3:05 | Home, top. | "Wall Street sleeps. Nightshift doesn't." | nightshift-production-f4e3.up.railway.app · github.com/iamdflame/nightshift |

## Words to avoid (they'd overclaim)
- Don't say agents "are paid" or "earned": no ERC-8183 job has been funded yet. Say "built to pay".
- Don't say the band "narrows toward the bell". It's set by the market state, not by the clock.
- Oct 8 and Oct 9 were scored live but weren't sealed on-chain (sealing started Oct 9 evening). Say "live opens", not "sealed opens".

## Shot checklist
- [ ] The site loads logged-out in a fresh window: Home, Verify, Radar, NVDAB, Scoreboard, On-chain proof.
- [ ] Verify shows all five steps green for the latest NVDAB round.
- [ ] The Agentic Wallet is signed in for the Claude Code shot (or reuse the recorded buy: On-chain proof → Trades and loan).
- [ ] If B402 is approved by recording time, add a 5-second x402 shot in the AnyAgent chapter; otherwise skip it.
- [ ] Upload to YouTube as unlisted; open the link in a logged-out window to check it plays; paste it into the form and into docs/SUBMISSION.md.

## Recording tips
- Windows: Win + G (Xbox Game Bar) records the active window; OBS records the whole screen.
- Do one silent screen pass first, then record the voice over it, and cut the waits.
- The first 30 seconds matter most: keep the sky and the dark-weekend clock in them.
