/**
 * Official Binance Web3 API feeds (active when BINANCE_WEB3_API_KEY/SECRET are set):
 *   - RWA price:          on-chain token price + the API's per-share "reference" (derived from the token)
 *   - RWA market status:  openState, marketStatus, reasonCode (MARKET_CLOSED / ASSET_PAUSED + corporate
 *                         action reason), nextOpenTime / nextCloseTime — the venue's own session clock
 *   - Trading API quotes: executable buy/sell prices at $100 / $1k / $10k for bStock vs Ondo tokens
 *                         (SWAP vs RFQ mode, price impact, fees, gas) — and *when* the aggregator refuses
 *                         (40367 Ondo / 40369 bStock "invalid trading time")
 * Every call is measured by the SDK's telemetry into `dx_calls` (latency, retries, codes, doc drift).
 */
import { readFileSync } from "node:fs";
import { BSC, type Instrument, sessionAt } from "@nightshift/core";
import { BinanceWeb3Client, BinanceWeb3Error, SqliteTelemetrySink } from "@nightshift/sdk";
import type { Tape } from "./db.ts";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const QUOTE_TICKERS = ["NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "SPY", "QQQ", "COIN", "MSTR", "CRCL"];
const SIZES_USD = [100, 1_000, 10_000];
/** RFQ (Ondo) quotes are refused without a wallet ("40001 userWalletAddress is required for RFQ (Ondo) quote"):
 *  quote as the trade executor (a public address; nothing is signed). */
const QUOTE_WALLET = (() => {
  try {
    return (JSON.parse(readFileSync("keys/roles.json", "utf8")) as Record<string, string>).executor;
  } catch {
    return process.env.NIGHTSHIFT_QUOTE_WALLET;
  }
})();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rwa_price (
  ts INTEGER NOT NULL, token TEXT NOT NULL, token_price REAL, reference_price REAL, price_updated_at INTEGER, session TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rwa_price_token_ts ON rwa_price(token, ts);
CREATE TABLE IF NOT EXISTS rwa_market (
  ts INTEGER NOT NULL, token TEXT NOT NULL, open_state INTEGER, market_status TEXT, reason_code TEXT, reason TEXT,
  next_open INTEGER, next_close INTEGER, reference_price REAL, session TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rwa_market_token_ts ON rwa_market(token, ts);
CREATE TABLE IF NOT EXISTS trade_quotes (
  ts INTEGER NOT NULL, token TEXT NOT NULL, symbol TEXT NOT NULL, ticker TEXT NOT NULL, issuer TEXT NOT NULL,
  side TEXT NOT NULL, usd_size REAL NOT NULL, from_amount TEXT, to_amount TEXT, execution_mode TEXT,
  price_impact REAL, est_gas_fee TEXT, trade_fee TEXT, vendor TEXT, price_per_token REAL,
  error_kind TEXT, error_code TEXT, session TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trade_quotes_token_ts ON trade_quotes(token, ts);
`;

export function web3Enabled(): boolean {
  return Boolean(process.env.BINANCE_WEB3_API_KEY && process.env.BINANCE_WEB3_SECRET_KEY);
}

export class Web3Feeds {
  readonly client: BinanceWeb3Client;
  /** Binance answered an RWA call with a compliance code (40304 from our EU West host): poll every 30 min, not every 30 s. */
  rwaRefused = false;

  constructor(private readonly tape: Tape) {
    tape.db.exec(SCHEMA);
    this.client = new BinanceWeb3Client({ telemetry: [new SqliteTelemetrySink()] });
  }

  async rwaPrices(tokens: Instrument[]): Promise<number> {
    const session = sessionAt(Date.now());
    // The addresses travel in the query string: ~165 of them returned HTTP 414 (URI Too Long) with no
    // API envelope, and the docs state no batch limit. 20 per call keeps every URL under ~1 KB.
    const rows: unknown[] = [];
    try {
      for (let i = 0; i < tokens.length; i += 20) {
        const chunk = tokens.slice(i, i + 20).map((t) => t.address);
        rows.push(...((await this.client.rwa.price({ binanceChainId: BSC, tokenContractAddresses: chunk })) as unknown[]));
      }
    } catch (e) {
      if (!this.refusal(e, "web3.rwa-price")) throw e;
      return 0;
    }
    this.rwaRefused = false;
    const ins = this.tape.db.prepare(`INSERT INTO rwa_price VALUES (?,?,?,?,?,?)`);
    const now = Date.now();
    this.tape.tx(() => {
      for (const r of rows as { tokenContractAddress?: string; tokenPrice?: string; referencePrice?: string; tokenPriceUpdatedAt?: number }[]) {
        ins.run(now, (r.tokenContractAddress ?? "").toLowerCase(), Number(r.tokenPrice ?? Number.NaN), Number(r.referencePrice ?? Number.NaN), r.tokenPriceUpdatedAt ?? null, session);
      }
    });
    return rows.length;
  }

  async marketStatus(tokens: Instrument[]): Promise<number> {
    const session = sessionAt(Date.now());
    const ins = this.tape.db.prepare(`INSERT INTO rwa_market VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let n = 0;
    for (const t of tokens) {
      try {
        const m = (await this.client.rwa.underlyingMarket({ binanceChainId: BSC, tokenContractAddress: t.address })) as {
          statusInfo?: { openState?: boolean; marketStatus?: string; reasonCode?: string | null; reason?: string | null; nextOpenTime?: number | null; nextCloseTime?: number | null };
          marketData?: { referencePrice?: string };
        };
        const s = m.statusInfo ?? {};
        ins.run(Date.now(), t.address, s.openState == null ? null : s.openState ? 1 : 0, s.marketStatus ?? null, s.reasonCode ?? null, s.reason ?? null, s.nextOpenTime ?? null, s.nextCloseTime ?? null, Number(m.marketData?.referencePrice ?? Number.NaN), session);
        n++;
        this.rwaRefused = false;
      } catch (e) {
        // A compliance refusal answers for every token from this host: stop here instead of asking 21 more times.
        if (this.refusal(e, "web3.market")) break;
        this.tape.log("warn", "web3.market", `${t.symbol}: ${(e as Error).message.slice(0, 160)}`);
      }
    }
    return n;
  }

  /**
   * A compliance code (403xx) is Binance declining to serve this host's jurisdiction, not an outage: never retried,
   * never routed around. The oracle prices from Binance spot books and BSC pools meanwhile.
   */
  private refusal(e: unknown, scope: string): boolean {
    if (!(e instanceof BinanceWeb3Error) || e.kind !== "compliance") return false;
    if (!this.rwaRefused) this.tape.log("warn", scope, `refused: ${e.apiCode} ${e.codeName ?? ""}; asking again every 30 min`);
    this.rwaRefused = true;
    return true;
  }

  /** Executable price ladder: buy (USDT→token) and sell (token→USDT) at each size, per issuer token. */
  async quoteLadder(registry: Instrument[], refPrice: (token: string) => number | null): Promise<number> {
    const session = sessionAt(Date.now());
    const ins = this.tape.db.prepare(`INSERT INTO trade_quotes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const targets = registry.filter((i) => i.chainId === BSC && QUOTE_TICKERS.includes(i.ticker) && (i.issuer === "bstocks" || i.issuer === "ondo"));
    let n = 0;
    for (const t of targets) {
      const px = refPrice(t.address);
      for (const usd of SIZES_USD) {
        for (const side of ["buy", "sell"] as const) {
          if (side === "sell" && !px) continue;
          // USDT is 18-decimal on BSC; the stock token uses its own decimals (any value, including < 6).
          const amount = side === "buy" ? BigInt(usd) * 10n ** 18n : (BigInt(Math.floor((usd / px!) * 1e6)) * 10n ** BigInt(t.decimals)) / 1_000_000n;
          const from = side === "buy" ? USDT : t.address;
          const to = side === "buy" ? t.address : USDT;
          const base = [Date.now(), t.address, t.symbol, t.ticker, t.issuer, side, usd] as const;
          try {
            const routes = (await this.client.trading.quote({ binanceChainId: BSC, amount: amount.toString(), fromTokenAddress: from, toTokenAddress: to, userWalletAddress: QUOTE_WALLET })) as unknown as Record<string, unknown>[] | Record<string, unknown>;
            const best = (Array.isArray(routes) ? (routes.find((r) => r.isBest) ?? routes[0]) : routes) as Record<string, string | undefined> | undefined;
            const fromAmt = Number(best?.fromTokenAmount ?? 0) / 10 ** (side === "buy" ? 18 : t.decimals);
            const toAmt = Number(best?.toTokenAmount ?? 0) / 10 ** (side === "buy" ? t.decimals : 18);
            const perToken = side === "buy" ? (toAmt > 0 ? fromAmt / toAmt : null) : fromAmt > 0 ? toAmt / fromAmt : null;
            ins.run(...base, best?.fromTokenAmount ?? null, best?.toTokenAmount ?? null, best?.executionMode ?? null, best?.priceImpactPercent != null ? Number(best.priceImpactPercent) : null, best?.estimateGasFee ?? null, best?.tradeFee ?? null, best?.vendorName ?? null, perToken, null, null, session);
          } catch (e) {
            const err = e instanceof BinanceWeb3Error ? e : null;
            ins.run(...base, null, null, null, null, null, null, null, null, err?.kind ?? "error", err ? (err.apiCode ?? String(err.httpStatus ?? "")) : (e as Error).message.slice(0, 80), session);
          }
          n++;
        }
      }
    }
    return n;
  }
}
