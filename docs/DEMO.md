# Demo video script (target 3:00, limit 4:00)

Recorded on the live site, https://nightshift-oracle.vercel.app, against real BSC mainnet data. The voice is yours: read the "Say" column in your own words. Captions carry the key numbers for judges who watch muted.

**Setup:** Chrome, 1920×1080, zoom 100%, a fresh window with no extensions showing. Turn the sound on in the site header (speaker icon): the bell rings when the weekend clock reaches 09:30. Scroll slowly with the mouse wheel; the chapters are scroll-driven. Recording on Sunday shows the weekend live; on a weekday the same chapter replays the last weekend and ends on the real Monday open.

| Time | Screen | Say | On-screen text |
|---|---|---|---|
| 0:00–0:12 | Home, top. Let the sky settle 3 seconds: tonight's real stars over Wall Street, amber streaks crossing it, the NVDAB card on the right, the "Built on the Binance Web3 API" line under the buttons. | "Every amber streak in this sky is a forecast sealed on BNB Chain: where NVIDIA will open on Monday, committed on a weekend, before the market opens." | Each streak is a real forecast sealed on BNB Chain |
| 0:12–0:40 | Scroll into "The dark weekend". Let the clock run from Friday 16:00 to the bell; pause on each caption. | "Tokenized stocks trade 168 hours a week; the US session is 32 and a half. When it closes, the reference goes quiet, and what's left is each token's own weekend trading. Across every dark weekend since June, that price called Monday's open barely better than Friday's close. Nightshift publishes what a lender actually needs: a fair value for the open and a 90% band, and every tick below it is a sealed forecast." | 65.5 hours with no official price. The token's own price ≈ Friday's close. |
| 0:40–1:05 | Scroll to "Borrow against NVIDIA…" and stop on "Same call, two answers". | "Here's BNB Chain's biggest lender and us, asked the same question from your browser: getPrice for NVDAB. Venus gets one number from the token's trading. Nightshift's adapter, the same Venus interface, gets a fair value and a band, and at the band's low edge the collateral on Venus counts for less. Our own credit vault lends that way: this loan was taken on mainnet at 10 p.m. on a Saturday." | Same call, two answers. A loan at 10 p.m. on a Saturday. |
| 1:05–1:25 | "How a forecast becomes a price": the diagram, then click "Latest seal" and show the BscScan tab. | "Three forecasters, each with an ERC-8004 identity, seal a Merkle root of their forecasts for all 91 bStocks every 30 minutes: Friday's close, the token's live price, and our model. Once it's on-chain, nobody can change it, not even us." | ERC-8004 agents. Sealed every 30 minutes. |
| 1:25–1:50 | Header → Verify. Keep the defaults (NVDAB, NFV, latest round), press "Verify on BNB Chain", let the five steps light up. Then tick "Tamper with it" and verify again. | "You don't have to trust us. This page fetches one forecast and its proof, recomputes the hash in your browser and asks the contract on BNB Chain directly. No wallet. Change the forecast by one cent, and it fails, on-chain too." | Verified on BNB Chain, from your browser |
| 1:50–2:15 | Header → Scoreboard, then On-chain proof → "All" (the ERC-8183 jobs line, if funded). | "Then the bell rings and the open grades every forecaster. On point error our model is close to the market price; what it adds is a calibrated range. The scores are public, and each forecaster holds an ERC-8183 job on BNB's commerce contracts that pays only if it beat the no-skill baseline on that open." | Scored by the open. Paid only if right (ERC-8183). |
| 2:15–2:35 | Header → Stack. Scroll past the module cards to "Every answer the API gave us". | "Every Binance Web3 API call we make is logged as it happens: RWA Data, a quote ladder on every token, MEV-protected broadcasts, and b402 for agents that pay per answer. Every error code we met is here, with what we do about it, including the compliance refusal Binance gave our first server, in the Netherlands, for tokenized-stock data." | 12,000+ Binance Web3 API calls a day, logged live |
| 2:35–2:55 | Claude Code with the Agentic Wallet and the Nightshift skill: ask "Buy $1 of NVIDIA, only inside Nightshift's band". Then On-chain proof → "Trades and loan". | "Any agent can use it. With a Binance Agentic Wallet and our skill, the agent finds the cheapest real share, checks it against the band, then buys, and gets a receipt rebuilt from on-chain logs: this one paid 35 basis points above fair value, inside the band." | Agentic Wallet + Nightshift skill + receipts |
| 2:55–3:05 | Home, top. | "Wall Street sleeps. Nightshift doesn't." | nightshift-oracle.vercel.app · github.com/iamdflame/nightshift |

## Words to avoid (they'd overclaim)
- Say agents "are paid" only if `/proof` shows a settled ERC-8183 job. Before Monday's open, say jobs are "funded" (if they are) or "built to pay".
- Don't say the model beats the market on price: it beats Friday's close by a lot and the token's price by about 1%. The band is the claim.
- Don't say lenders see Friday's close on weekends: Venus prices NVDAB from the token's own trading, around the clock.
- Don't say the band "narrows toward the bell". It's set by the market state, not by the clock.
- Oct 8 and Oct 9 were scored live but weren't sealed on-chain (sealing started Oct 9 evening). Say "live opens", not "sealed opens".

## Shot checklist
- [ ] The site loads logged-out in a fresh window: Home, Verify, Stack, Radar, NVDAB, Scoreboard, On-chain proof.
- [ ] Verify shows all five steps green for the latest NVDAB round.
- [ ] "Same call, two answers" shows both prices (it reads BNB Chain from the browser; reload if an RPC is slow).
- [ ] The Agentic Wallet is signed in for the Claude Code shot (or reuse the recorded buy: On-chain proof → Trades and loan).
- [ ] Upload to YouTube as unlisted; open the link in a logged-out window to check it plays; paste it into the form and into docs/SUBMISSION.md.

## Recording tips
- Windows: Win + G (Xbox Game Bar) records the active window; OBS records the whole screen.
- Do one silent screen pass first, then record the voice over it, and cut the waits.
- The first 30 seconds matter most: keep the sky and the weekend clock in them.
