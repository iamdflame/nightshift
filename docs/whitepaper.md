# Pricing equities when markets close

*Nightshift technical note, v0.1. October 2026.*

## Abstract

Tokenized US equities trade continuously, but their underlying market provides a reliable reference price only during the regular session: 19% of the week. We study 70 closed-market gaps (June 11 – October 7, 2026) across 91 bStocks traded 24/7 on Binance spot and BNB Chain. We ask how well the token market itself predicts the next official open.

Echoing the token price is a strong estimator once any US venue is live (overnight or premarket sessions). In the fully dark hours (weekends and holidays) it is barely better than a stale oracle, and mid-weekend it can be worse.

We propose Nightshift Fair Value (NFV v2). It splits each token's move since the close by *information provenance*: post-market, dark and restart segments. It learns how much to trust each segment in each information state, and wraps the forecast in split-conformal 90% bands. Out-of-sample, NFV beats or ties both the stale oracle and the on-chain echo in every regime. CRPS falls 22.1% vs the stale oracle overall, 8.0% on holiday dark hours and 44.0% at the Sunday-night restart. The bands cover 86.6–90.4% of opens.

## 1. Setting

For stock *i* and a gap *k*, the gap runs from the official close C to the next official open O. Write *b* for the token's basis (token price ÷ share price: the dividend multiplier times any structural issuer premium). At forecast time τ:

```
r_i(τ) = ln( P_i(τ) / (b_i · C_i) )        on-chain log move since the close
g_i    = ln( O_i / C_i )                    the target: the gap at the open
```

The basis b is the median, over the last five closes, of the token price at 16:00 ET divided by the official close. It is validated against the token's published shares-per-token multiplier (|b/m − 1| ≤ 3%). That check automatically rejects pre-IPO tokens whose ticker collides with an unrelated listed security.

**Information states.** τ is *dark* when no US venue trades (Friday 20:00 → Sunday 20:00 ET, holidays). It is *restart* when venues are live again after a dark segment (Sunday-night overnight, Monday premarket). It is *live* during ordinary weekday post, overnight and pre sessions.

## 2. Data

| Series | Source | Coverage |
|---|---|---|
| Token prices, 24/7 | Binance spot `…BUSDT` 1h klines (every bStock trades on the CEX and as a BEP-20 on BSC) | 165,898 bars, 91 tokens, from listing |
| Official open/close | Public daily bars (source recorded per row) | 91 tickers, 1 year |
| Registry, multipliers | Binance Wallet RWA registry (the list the Agentic Wallet resolves against) | 91 bStocks, 458 Ondo, 130 xStocks on BSC |

## 3. Model: NFV v2 (information provenance)

The move since the close is split at the end of post-market (t₁) and at the restart of overnight trading (t₂):

```
seg1 = ln(P(min(τ,t₁)) / (b·C))     post-market: the real stock still trades
seg2 = ln(P(min(τ,t₂)) / P(t₁))     dark: no US venue at all
seg3 = ln(P(τ) / P(t₂))             restart: overnight + premarket venues live
```

For each segment *s*, f_s is the cross-sectional (volume-weighted median) factor and e_s = seg_s − f_s is the idiosyncratic part. The forecast in information state S is

```
μ_i = Σ_s ( a_{S,s} · f_s + β_{S,s} · e_{i,s} )
```

The 12 weights per state are fitted by ridge regression **toward the prior "trust the market" (all ones = the echo)**. Rows are weighted by 1/v_i, so volatile names don't dominate. Prior strength scales with how little data a state has: κ = 0.02 for dark and live, 2 for restart (about 17 Sunday restarts).

**Uncertainty.** v_i is the stock's robust historical gap volatility (1.4826 × MAD of ln(Oₜ/Cₜ₋₁) over 60 sessions). The 90% band for the open is

```
[ μ_i + z₀₅(S)·v_i ,  μ_i + z₉₅(S)·v_i ]
```

where z₀₅ and z₉₅ are split-conformal quantiles of standardized residuals in state S. For CRPS we also fit a Student-t (ν = 4) scale per state.

## 4. Evaluation protocol

- **Strict leave-one-gap-out.** Every gap is scored by parameters fitted on all *other* gaps. That includes the baselines' scales: each estimator gets its own CRPS-optimal scale per state, so the comparison is fair.
- **Forecast grid:** every 2 hours from close + 1h to open − 30 min, plus open − 30 min.
- **Metrics:** CRPS (closed forms for Gaussian and Student-t, verified against numerical integration in the test suite), absolute error of the point forecast, and empirical coverage of the 90% band.

## 5. Results

| Gaps × state | n | CRPS stale | CRPS echo | CRPS NFV | NFV vs stale | NFV vs echo | MAE stale / echo / NFV | Coverage |
|---|---|---|---|---|---|---|---|---|
| all | 60,794 | 165.2 | 129.9 | **128.6** | −22.1% | −1.0% | 225.0 / 173.3 / 171.7 | 88.7% |
| weekend · dark | 17,952 | 169.1 | 166.7 | **163.3** | −3.4% | −2.0% | 228.0 / 225.0 / 219.6 | 86.6% |
| weekend · restart | 5,984 | 169.1 | **94.2** | 94.6 | −44.0% | +0.5% | 228.0 / 123.7 / 124.2 | 89.0% |
| holiday · dark | 3,132 | 160.9 | 151.4 | **148.1** | −8.0% | −2.2% | 232.3 / 209.3 / 210.7 | 89.6% |
| holiday · restart | 696 | 160.9 | 88.1 | **88.1** | −45.3% | 0.0% | 232.3 / 116.8 / 116.7 | 88.9% |
| weekday overnight | 31,360 | 162.6 | 112.3 | **112.0** | −31.2% | −0.3% | 221.6 / 148.0 / 147.8 | 90.4% |

Units are bps of price. Figure: `docs/figures/weekend-crps.svg`.

**Learned trust weights in the dark state** (`[f_post, e_post, f_dark, e_dark]`): `0.00, 1.19, 0.46, 0.42`.
- Company-specific after-hours moves (earnings, news) carry into the open in full.
- The *market-wide* after-hours drift does not.
- Weekend drift, market-wide and single-name, is more than half noise.

At the restart the weights return to ≈1: once US venues trade again, the token market already prices what the dark hours got wrong.

Three variants were tested and rejected, each documented in the study scripts:
- **Trailing-median denoising** lags real moves (+6 bps CRPS in live states).
- **Crypto factors** don't predict crypto-equity gaps (corr 0.04 vs 0.19 for the tokens' own moves).
- **Unregularized restart weights** overfit 17 weekends.

## 6. From forecasts to an oracle

**Commit–reveal.** Every 30 minutes each forecaster builds a Merkle tree over its forecasts and commits the root to `ForecastBook` on BSC *before* the open. The leaves are `(round, token, medianE8, lowerE8, upperE8, anchorTime)`, double-hashed (OpenZeppelin standard). Any single forecast is provable afterwards (`/v1/rounds/{round}/proof/{forecaster}/{token}`, or `ForecastBook.verifyForecast` on-chain).

**Scoring and reputation.** At each open the Scorer computes each forecaster's CRPS. The consensus is a quantile average of the forecasters' distributions, weighted ∝ exp(−(CRPS_f − CRPS_best)/3 bps) using trailing live scores, with the backtest as the prior.

**Pay-for-accuracy (ERC-8183).** For each open, each forecaster holds a funded job on BNB's AgenticCommerce. The job is accepted if the forecaster beat the stale oracle on that open; the anchor is accepted if its band coverage is at least 80%. Otherwise it is disputed with the score report's hash as evidence.

**Using the band.** Lending against tokenized stocks while the market is closed should value collateral at the band's lower edge for the *next open*, not at the last price. `NightshiftCredit` does exactly that: its borrowing power is collateral × `lower` × base LTV, which is what keeps a Sunday loan solvent at Monday's open.

## 7. Limitations

- **Sample size.** About 17 weekends and 3 holidays. The dark-state weights and conformal quantiles are refit as live opens accumulate.
- **Reference source.** Official opens and closes come from a public source in this build.
- **Corporate actions.** These are handled through the registry multiplier and RWA pause codes, not modeled.
- **Gap volatility** is per-stock and recent-history based. Earnings weekends deserve event-aware scaling; this is future work, and the Newsdesk forecaster slot is the natural place for it.
