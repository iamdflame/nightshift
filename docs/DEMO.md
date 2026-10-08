# Demo video (≤ 4:00)

Recorded from the live system, with real mainnet transactions. Narration by the human team. Captions on: judges skim, and screeners read transcripts.

| Time | Screen | Say (paraphrase in your own voice) |
|---|---|---|
| 0:00–0:12 | Radar during the weekend dark hours, with the clock showing "US market closed" | "Nightshift prices tokenized stocks while Wall Street sleeps. Right now there is no reference price for any US stock, and these 91 tokens are still trading." |
| 0:12–0:35 | Which? for NVDA: three tokens, three prices | "Same company, three tokens. Binance's own agent wallet asks *you* to pick. Picking wrong cost 83 bps on Thursday. Nightshift answers with the cheapest real share, against fair value." |
| 0:35–1:05 | Science page: chart and table | "We backtested every gap since bStocks launched, out of sample. Echoing the weekend price is barely better than a stale oracle, and mid-weekend it's worse. Our model splits each move by information provenance and wins in every regime: −22% overall, −44% at the Sunday-night restart, calibrated 90% bands." |
| 1:05–1:40 | Night Shift page: rounds, then BscScan commit tx, then the proof page | "Three AI forecasters with ERC-8004 identities commit Merkle roots of their forecasts to BNB Chain every 30 minutes, *before* the open. Here is Saturday's commitment, and here is the proof for NVIDIA." |
| 1:40–2:10 | Scoreboard after Monday's open, plus an ERC-8183 job on BscScan | "Monday's open scored them. The forecaster that beat the stale oracle got paid in U through ERC-8183 on BNB's own commerce contracts. One that doesn't is disputed with the score report as evidence." |
| 2:10–2:45 | Claude Code + Agentic Wallet + the Nightshift skill: "buy $5 of NVIDIA", then the receipt | "Any agent with a Binance Agentic Wallet can use this. The skill picks the token, checks the band, buys with `baw`, then our receipt proves the price paid per real share vs fair value, from on-chain logs." |
| 2:45–3:20 | Lend: Sunday borrow tx; Pools: LVR numbers | "Because we can price the dark hours, you can borrow against your stocks on a Sunday: collateral is valued at the 5th-percentile next-open price. And our PancakeSwap Infinity hook cut LP losses at the reopen by 71% on a mainnet fork." |
| 3:20–3:45 | Identities, then the Venus risk report | "The market even checks itself: leveraged ETFs agree with their base within 2 bps. And Venus's zero borrow caps aren't a solvency problem. A year of weekend gaps says it's an oracle problem, the one we solve." |
| 3:45–4:00 | Logo plus one line | "Wall Street sleeps. Nightshift doesn't." |

## Checklist before recording

- [ ] The Saturday ForecastBook commit tx is visible on BscScan (forecaster address = ERC-8004 identity).
- [ ] Monday scoreboard populated (record after Mon 13:45 UTC, or use Thursday/Friday opens).
- [ ] Agentic Wallet funded; developer mode enabled; the skill installed (`skills/nightshift`).
- [ ] The receipt for the demo buy is ready (`/v1/receipts/{tx}`).
- [ ] The credit vault borrow tx and the hook pool swap tx are ready.
