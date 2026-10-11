# Demo video script (target 2:45, limit 4:00)

Recorded from the live system, with real BSC mainnet transactions. The voice is yours. Read the "Say" column in your own words; captions carry the key numbers for judges who watch muted. Record at 1920×1080, browser zoom 125%, dark terminal.

| Time | Screen | Say | On-screen text |
|---|---|---|---|
| 0:00–0:10 | BscScan: a ForecastBook commit from this weekend, block time visible | "This is an AI agent committing its forecast of every tokenized stock's Monday open to BNB Chain, on a Saturday, before the market opens. It gets paid only if Monday proves it right." | Committed before the open. Paid only if right. |
| 0:10–0:30 | README problem section: the Chainlink quote and the 62% number | "Tokenized stocks trade all weekend: 62% of bStocks' July volume happened while US markets were dark. But the oracles stop. Chainlink's own docs say their equity feeds don't update while markets are closed. So Venus lists NVIDIA as collateral with borrowing switched off." | 62% of volume while markets are closed. Oracles stop. |
| 0:30–1:00 | API: `/v1/fair-value/NVDAB` (fair value + band), then `/v1/rounds/.../proof/nfv/NVDAB` | "Nightshift prices every bStock through the dark hours: a fair value and a 90% band for the next open. Three forecaster agents with ERC-8004 identities commit Merkle roots every 30 minutes. Here's one NVIDIA forecast and its proof against the root on-chain." | Fair value + 90% band for the next open |
| 1:00–1:30 | docs/LIVE.md: the Sunday loan section, then the borrow tx on BscScan | "Because the dark hours have a price, you can borrow against stocks on a Sunday. Our credit vault values NVIDIA at the band's lower edge, Monday's bad case, not Friday's close. This loan was taken today, on mainnet." | A loan against NVIDIA, on a Sunday |
| 1:30–1:55 | docs/LIVE.md: the ERC-8183 jobs table, then one job on BscScan | "The agents are paid through ERC-8183 jobs on BNB's own commerce contracts. After the open, our scorer grades every forecast. Beat the stale oracle and you're paid in U. Miss, and the job is disputed with the score report as evidence." | Pay-for-accuracy: ERC-8183 |
| 1:55–2:20 | README results tables: backtest + live opens | "It works. Out of sample over 70 gaps, our model cut forecast error 22% versus a stale oracle. On the live opens since Thursday, 49% and 31%, scored automatically." | −22% backtest · −49% / −31% live |
| 2:20–2:40 | Claude Code with the Agentic Wallet + Nightshift skill: pay via x402, buy $5 of NVDAB, `/v1/receipts/{tx}` | "Any agent with a Binance Agentic Wallet can use it: pay a cent over x402 for the full report, buy inside the band with baw, and get a receipt rebuilt from on-chain logs." | Agentic Wallet + x402 + receipts |
| 2:40–2:45 | Logo + repo URL | "Wall Street sleeps. Nightshift doesn't." | github.com/iamdflame/nightshift |

## Shot checklist (all must exist before recording)
- [ ] ForecastBook commit tx for the Oct 12 open (docs/LIVE.md → "Proof of foresight").
- [ ] Sunday loan txs (docs/LIVE.md → "The Sunday loan").
- [ ] ERC-8183 jobs created and funded (docs/LIVE.md → jobs table).
- [ ] Public API URL works logged-out (`/v1/fair-value/NVDAB`, `/v1/rounds`, proof endpoint).
- [ ] Agentic Wallet buy + receipt; x402 payment (needs B402 on the API key).
- [ ] Upload unlisted to YouTube; check it plays logged-out; paste the link in the form.

## Recording tips
- Windows: Win + G (Xbox Game Bar) records the active window; or OBS for the full screen.
- Do one silent screen pass first, then record the voice over it; cut the waits.
- Keep it under 3 minutes: round-one judges watch the first 30 seconds most carefully.
