---
name: nightshift
description: "Trade tokenized US stocks on BNB Chain without overpaying — at any hour. Use with the Binance Agentic Wallet when the user wants to buy, sell or price a US stock token (bStocks …B, Ondo …on, xStocks …x), especially by bare ticker ('buy NVIDIA'), or outside US market hours. Resolves which issuer's token is the cheapest real share, checks it against Nightshift's 24/7 fair value and next-open risk band, then executes with baw (market order inside the band, limit order at fair value outside it)."
metadata:
  version: "0.2.0"
  requires: "binance-agentic-wallet skill 1.12.0+ (baw CLI 1.10.0+)"
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

Nightshift API base URL: `$NIGHTSHIFT_URL` (the public deployment is linked at the top of
https://github.com/iamdflame/nightshift). Also available as an MCP server at `$NIGHTSHIFT_URL/mcp`
with tools `fair_value`, `which`, `radar`, `scoreboard`, `verify_forecast`, `study`.

| Need | Call |
|---|---|
| Which token to buy for a stock | `GET $NIGHTSHIFT_URL/v1/which/{TICKER}` |
| Fair value + band for a token | `GET $NIGHTSHIFT_URL/v1/fair-value/{SYMBOL}` |
| Market state (session, next open) | `GET $NIGHTSHIFT_URL/v1/status` |

| Full report: forecasters, Merkle proof, on-chain report (paid, x402) | `GET $NIGHTSHIFT_URL/x402/fair-value/{SYMBOL}` |
| Price and accepted assets of the paid endpoint | `GET $NIGHTSHIFT_URL/x402/price` |
| Receipt for any BSC trade | `GET $NIGHTSHIFT_URL/v1/receipts/{txHash}` |

## Paying for the full report (x402 V2, settled by Binance B402)

1. `GET /x402/fair-value/{SYMBOL}` → `402` with a `PAYMENT-REQUIRED` header (base64 `PaymentRequired`).
2. `baw x402-payment preview --paymentRequirements <PAYMENT-REQUIRED header value> --json`. Show the
   user the options (asset, amount, USD value). Only `READY_TO_SIGN` options can be signed.
3. After the user confirms: `baw x402-payment sign --paymentId <paymentId> --selectedIndex <index> --json`.
   If `approveTxHash` is set (Permit2, gas sponsored on BSC), wait for it to confirm first.
4. Replay the same GET with header `PAYMENT-SIGNATURE: <paymentHeaderValue>`. The response's
   `PAYMENT-RESPONSE` header (base64 JSON) carries the settlement `txHash`. Each signature is single-use.
5. The default price is 0.01 USD, inside the Agentic Wallet's x402 limit of 20 USD per day.

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
5. **Receipt.** After the fill, take the transaction hash from `baw market-order list --json` and call
   `GET $NIGHTSHIFT_URL/v1/receipts/{txHash}`. Nightshift rebuilds the trade from the chain's Transfer
   logs and returns tokens received, price per token and per real share, the fair value at that moment,
   the verdict (for example "bought 3.2 bps below fair value") and a `receiptHash` anyone can re-derive.
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
