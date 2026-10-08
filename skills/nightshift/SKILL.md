---
name: nightshift
description: "Trade tokenized US stocks on BNB Chain without overpaying — at any hour. Use with the Binance Agentic Wallet when the user wants to buy, sell or price a US stock token (bStocks …B, Ondo …on, xStocks …x), especially by bare ticker ('buy NVIDIA'), or outside US market hours. Resolves which issuer's token is the cheapest real share, checks it against Nightshift's 24/7 fair value and next-open risk band, then executes with baw (market order inside the band, limit order at fair value outside it)."
metadata:
  version: "0.1.0"
  author: "Nightshift"
license: MIT
---

# Nightshift — never overpay for a tokenized stock

Tokenized stocks trade 24/7; the real market does not. Only ~19% of the week has a deep US session,
and from Friday 20:00 to Sunday 20:00 New York time there is no reference price at all. The same
company also exists as several tokens (NVDAB, NVDAon, NVDAx) with different liquidity and prices.
Nightshift prices every covered token around the clock — a fair value plus a calibrated 90% band for
the next US open — and tells you which token is the cheapest real share.

Use this skill together with the `binance-agentic-wallet` skill. That skill owns signing, preflight
and security checks; this skill decides *what* to trade and *at what price*.

## Data source

Nightshift API base URL: `$NIGHTSHIFT_URL` (default `https://nightshift.onrender.com` — replace with
the deployment you use). Also available as an MCP server at `$NIGHTSHIFT_URL/mcp` with tools
`fair_value`, `which`, `radar`, `scoreboard`, `verify_forecast`, `study`.

| Need | Call |
|---|---|
| Which token to buy for a stock | `GET $NIGHTSHIFT_URL/v1/which/{TICKER}` |
| Fair value + band for a token | `GET $NIGHTSHIFT_URL/v1/fair-value/{SYMBOL}` |
| Market state (session, next open) | `GET $NIGHTSHIFT_URL/v1/status` |

If an endpoint answers `402 Payment Required` (premium tier), pay it with the Agentic Wallet:
`baw x402-payment preview --json` then, after the user confirms, `baw x402-payment sign --json`,
and retry the request with the signed payment.

## Flow: "buy $X of <stock>"

1. **Resolve the token.** Call `/v1/which/{TICKER}`. Use `answer.address` and `answer.symbol` —
   the cheapest real share among BSC tokens with enough liquidity. Never invent an address; the
   address comes from Binance Wallet's own RWA registry. Show the user the comparison in a table:
   issuer, symbol, full address, price per share, `vsFairValueBps`, liquidity. If the user named a
   specific issuer suffix (…B / …on / …x), respect it and just show the comparison.
2. **Check the price against fair value.** From `/v1/fair-value/{SYMBOL}` read `fairValue`,
   `lower`, `upper` (USD per token), `session`, `anchorTime`, `flags`.
   - `flags & 1` (corporate action / issuer pause) → do not trade; explain and stop.
   - Get a quote: `baw market-order quote ... --json` for the chosen token and size. Compute the
     quoted price per token = input USD / output tokens.
3. **Decide:**
   - Quoted price ≤ `upper` (buys) / ≥ `lower` (sells) → proceed with a market order.
   - Outside the band → do **not** market-buy. Offer: (a) a limit order at `fairValue` with
     `baw limit-order buy ... --json`, (b) wait for `anchorTime` (the next US open), or (c) proceed
     anyway at the quoted price (disclose the premium in bps). Never silently downgrade a limit
     intent to a market order.
4. **Execute** with the `binance-agentic-wallet` skill's market-order or limit-order flow, after its
   preflight and security checks and the user's explicit confirmation. Pass the full contract
   address. Payment tokens: USDT, USDC, U, USD1 or BNB.
5. **Receipt.** After the fill (`baw market-order list --json` / `baw wallet tx-history --json`), report:
   tokens received, average price per token, price per real share (price ÷ `sharesPerToken`),
   and `(fill − fairValue)/fairValue` in bps — positive = paid above fair value.
6. **Hygiene.** If an approval was created for this trade, offer `baw approvals revoke --json`.

## Flow: "what is <stock> worth right now?"

Call `/v1/fair-value/{SYMBOL}` (or `/v1/which/{TICKER}`). Explain in one line: the fair value, the
90% band for the next open, the session ("US market closed — next open Monday 13:30 UTC"), and
whether the token currently trades at a premium or discount to fair value.

## Rules

- Prices are USD per **token**; per **share** = per token ÷ `sharesPerToken` (dividend-adjusted).
- Outside US hours the band is wider on purpose: that is the real uncertainty about the next open.
- Show full contract addresses next to symbols. Report CLI errors exactly as returned.
- Nightshift is a price reference, not investment advice; tokenized securities may be restricted in
  the user's jurisdiction.
