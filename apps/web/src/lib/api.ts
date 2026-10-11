/** Typed client for the Nightshift API (same origin in production; Vite proxies /v1 in dev). */

export type Session = "overnight" | "pre" | "regular" | "post" | "closed";

export interface Round {
  round: number;
  ts: number;
  session: Session;
  state: string;
  anchor_time: number;
  n_tokens: number;
}

export interface Status {
  now: string;
  session: Session;
  nextOpen: string;
  hoursToOpen: number;
  latestRound: Round | null;
  tapeLagSeconds: number | null;
}

export interface Consensus {
  token: string;
  symbol: string;
  ticker: string;
  session: Session;
  state: string;
  fairValue: number;
  lower: number;
  upper: number;
  bandBps: number;
  anchorTime: string;
  flags: number;
  weights: { anchor: number; echo: number; nfv: number };
  round: number;
  computedAt: string;
  onChain: {
    status: string;
    tx: string | null;
    latest: { round: number; fairValue: number; lower: number; upper: number; computedAt: string; tx: string } | null;
  };
}

export interface ForecasterView {
  forecaster: "anchor" | "echo" | "nfv";
  fair_value: number;
  lower: number;
  upper: number;
  mu: number;
  sigma: number;
  token_price: number;
  move: number;
  last_close: number;
  basis: number;
  flags: number;
}

export interface FairValue {
  consensus: Consensus;
  forecasters: ForecasterView[];
  round: Round;
}

export interface RadarRow {
  symbol: string;
  ticker: string;
  token: string;
  tokenPrice: number;
  lastClosePerToken: number | null;
  moveBps: number | null;
  fairValue: number;
  lower: number;
  upper: number;
  premiumToFairValueBps: number;
  gapRiskDownBps: number;
  state: string;
}

export interface Radar {
  round: Round | null;
  rows: RadarRow[];
}

export interface Commitment {
  root: string;
  count: number;
  chain: "committed" | "missed" | "local" | "reverted";
  tx: string | null;
}

export interface RoundRow {
  round: number;
  ts: string;
  session: Session;
  state: string;
  anchor_time: number;
  anchorTime: string;
  n_tokens: number;
  commitments: Partial<Record<"anchor" | "echo" | "nfv", Commitment>>;
}

export interface Proof {
  round: number;
  forecaster: "anchor" | "echo" | "nfv";
  token: string;
  symbol: string;
  leaf: { round: number; token: string; medianE8: string; lowerE8: string; upperE8: string; anchorTime: number };
  leafHash: `0x${string}`;
  proof: `0x${string}`[];
  root: `0x${string}`;
  committedRoot: `0x${string}`;
  onChain: { status: string; tx: string | null };
}

export interface ScoreRow {
  forecaster: string;
  state: string;
  n: number;
  anchors: number;
  crps_bps: number;
  mae_bps: number;
  coverage: number;
}

export interface ResultRow {
  open: string;
  forecaster: string;
  n: number;
  crpsBps: number;
  maeBps: number;
  coverage: number;
}

export interface WhichToken {
  issuer: string;
  chainId: string;
  symbol: string;
  address: string;
  sharesPerToken: number;
  cex: { symbol: string; bid: number; ask: number; spreadBps: number } | null;
  dexPools: { dex: string; pair: string; quote: string; priceUsd: number; liquidityUsd: number; volume24h: number }[];
  dexLiquidityUsd: number;
  pricePerShare: number | null;
  vsFairValueBps: number | null;
}

export interface Which {
  ticker: string;
  fairValuePerShare: number | null;
  consensus: Consensus | null;
  answer: { symbol: string; issuer: string; address: string; pricePerShare: number; reason: string } | null;
  tokens: WhichToken[];
}

/** /v1/history/:token — one row per round (consensus) + hourly token closes + commit ticks. */
export interface HistoryPoint {
  round: number;
  t: number; // ms
  session: Session;
  state: string;
  anchorTime: number;
  fairValue: number;
  lower: number;
  upper: number;
  tokenPrice: number | null;
  lastClose: number | null;
  chainStatus: string;
  tx: string | null;
}
export interface History {
  token: string;
  symbol: string;
  nextAnchor: number;
  points: HistoryPoint[];
  klines: { t: number; close: number }[];
  commits: { round: number; t: number; forecaster: "anchor" | "echo" | "nfv"; fairValue: number; lower: number; upper: number; chain: string; tx: string | null }[];
  /** The open these rounds aim at (the next one, or the `anchor` asked for). */
  anchor: number;
  /** That open's official price per token once scored, else null. */
  realized: number | null;
  /** Each forecaster's last forecast before that open, with its error against it once scored. */
  lastCommits: (History["commits"][number] & { errBps: number | null; covered: boolean | null })[];
}

export interface OnChain {
  chainId: 56;
  contracts: { name: string; address: string; role: string }[];
  feeds: { token: string; symbol: string; feed: string }[];
  agents: { role: string; name: string; agentId: number | null; address: string; tx: string; registeredAt: string | null }[];
  commitments: { anchorTime: number; forecaster: string; rounds: number; firstRound: number; lastRound: number; lastTx: string | null }[];
  recentCommits: { round: number; t: number; forecaster: string; tx: string; anchorTime: number }[];
  oracle: { reports: number; txs: number; latest: { symbol: string; round: number; fairValue: number; lower: number; upper: number; computedAt: number; tx: string }[] };
  sundayLoan: {
    steps: Record<string, { tx?: string; at: string; [k: string]: unknown }>;
    summary?: { borrower: string; credit: string; oracleRound: number; fairValue: string; valuedAt: string; debtUsdt: string; borrowPowerUsdt: string; healthFactor: string };
  } | null;
  agenticWalletTrades: {
    wallet: string;
    txHash: string;
    command: string;
    receipt: Receipt;
  }[];
  jobs: { jobId: string; forecaster: string; anchorTime: number; budget: string; status: string; createTx: string | null; fundTx: string | null; submitTx: string | null; verdict: string | null; judgeTx: string | null }[];
  scores: { anchorTime: number; forecaster: string; n: number; crpsBps: number; maeBps: number; coverage: number }[];
  deployBlock: number | null;
}

export interface Receipt {
  version: string;
  chainId: number;
  txHash: string;
  block: number;
  timestamp: string;
  trader: string;
  side: "buy" | "sell";
  token: { address: string; symbol: string; ticker: string; sharesPerToken: number };
  payToken: { address: string; symbol: string };
  amountToken: number;
  amountUsd: number;
  pricePerToken: number;
  pricePerShare: number;
  session: string;
  reference: { round: number; fairValue: number; lower: number; upper: number; anchorTime: string } | null;
  tca: { vsFairValueBps: number | null; insideBand: boolean | null; verdict: string };
  receiptHash: string;
}

export interface OpenRow {
  anchorTime: number;
  symbol: string;
  ticker: string;
  realized: number;
  fairValue: number;
  lower: number;
  upper: number;
  hoursToOpen: number;
  crpsBps: number;
  errBps: number;
  covered: boolean;
}

/** /v1/stack — the Binance Web3 API as Nightshift calls it, from the SDK's own telemetry. */
export interface StackEndpoint {
  endpoint: string;
  method: string;
  calls24h: number;
  callsAll: number;
  notSent: number;
  p50Ms: number | null;
  p95Ms: number | null;
  latencyWindow: "24h" | "all" | null;
  lastAt: number | null;
  codes: Record<string, number>;
  drift: { undocumented: string[]; missing: string[] };
}
export interface Stack {
  generatedAt: string;
  since: number | null;
  totalCalls: number;
  calls24h: number;
  notSent: { total: number; last24h: number };
  sdk: { modules: number; endpoints: number };
  modules: { module: string; calls24h: number; callsAll: number; lastAt: number | null; sdkEndpoints: { method: string; path: string }[]; endpoints: StackEndpoint[] }[];
  codes: { code: string; name: string | null; ok: boolean; sent: boolean; count: number; count24h: number; firstAt: number; lastAt: number; modules: string[]; meaning: string; ourHandling: string }[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  status: () => get<Status>("/v1/status"),
  radar: () => get<Radar>("/v1/radar"),
  fairValue: (key: string) => get<FairValue>(`/v1/fair-value/${encodeURIComponent(key)}`),
  which: (ticker: string) => get<Which>(`/v1/which/${encodeURIComponent(ticker)}`),
  rounds: (limit = 50) => get<RoundRow[]>(`/v1/rounds?limit=${limit}`),
  proof: (round: number, forecaster: string, token: string) => get<Proof>(`/v1/rounds/${round}/proof/${forecaster}/${encodeURIComponent(token)}`),
  scoreboard: () => get<{ scoreboard: ScoreRow[] }>("/v1/scoreboard"),
  results: () => get<{ results: ResultRow[] }>("/v1/results"),
  history: (key: string, hours = 72, anchor?: number) => get<History>(`/v1/history/${encodeURIComponent(key)}?hours=${hours}${anchor ? `&anchor=${anchor}` : ""}`),
  onchain: () => get<OnChain>("/v1/onchain"),
  stack: () => get<Stack>("/v1/stack"),
  opens: (forecaster = "nfv") => get<{ opens: OpenRow[] }>(`/v1/opens?forecaster=${forecaster}`),
  receipt: (tx: string, trader?: string) => get<Receipt>(`/v1/receipts/${tx}${trader ? `?trader=${trader}` : ""}`),
  x402: () => get<{ status: string; priceUsd: string; payTo: string | null; accepts: { asset: string; symbol?: string; method?: string; amount: string }[] }>("/x402/price"),
};
