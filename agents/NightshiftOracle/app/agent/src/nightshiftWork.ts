/**
 * Nightshift work hook — the deliverable this seller agent sells.
 *
 * A buyer (another agent, a lender, a trading bot) pays per request over B402/x402 or through an
 * ERC-8183 job. The deliverable is a Nightshift fair-value report: for each requested tokenized
 * stock, the consensus fair value plus the calibrated 90% band for the next US open, which token
 * is the cheapest real share across issuers, the session clock, and links to the on-chain
 * commitments that prove the forecasts were made before the open.
 *
 * Deterministic by design — no LLM decides a price. The numbers come from the Night Shift's
 * reality-scored consensus (the Nightshift API).
 */
import type { RunWork } from "./sellerCore.js";

const API = (process.env.NIGHTSHIFT_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const DEFAULT_TOKENS = ["NVDAB", "TSLAB", "SPYB", "QQQB"];

async function get(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { signal: signal ?? AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
  if (!res.ok) return { error: `HTTP ${res.status} for ${path}` };
  return res.json();
}

/** Pull bStock / Ondo / xStock symbols (…B, …on, …x) and bare tickers out of a JSON task or free text. */
export function requestedInstruments(prompt: string): { tokens: string[]; tickers: string[] } {
  const ctx = prompt.split("JOB CONTEXT:").pop() ?? prompt;
  const words = new Set<string>();
  try {
    const parsed = JSON.parse(ctx) as { task?: unknown; terms?: unknown };
    for (const v of [parsed.task, parsed.terms]) {
      const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
      for (const w of s.match(/[A-Za-z]{1,6}(?:B|on|x)?\b/g) ?? []) words.add(w);
    }
  } catch {
    for (const w of ctx.match(/[A-Za-z]{1,6}(?:B|on|x)?\b/g) ?? []) words.add(w);
  }
  const tokens = [...words].filter((w) => /^[A-Z]{1,5}(B|on|x)$/.test(w));
  const tickers = [...words].filter((w) => /^[A-Z]{2,5}$/.test(w) && !tokens.some((t) => t.startsWith(w)));
  return { tokens: tokens.slice(0, 20), tickers: tickers.slice(0, 10) };
}

export function buildNightshiftWork(): RunWork {
  return async (prompt, { abortSignal }) => {
    const { tokens, tickers } = requestedInstruments(prompt);
    const status = await get("/v1/status", abortSignal);
    const fairValues = await Promise.all((tokens.length || tickers.length ? tokens : DEFAULT_TOKENS).map((t) => get(`/v1/fair-value/${encodeURIComponent(t)}`, abortSignal)));
    const which = await Promise.all(tickers.map((t) => get(`/v1/which/${encodeURIComponent(t)}`, abortSignal)));
    return JSON.stringify(
      {
        kind: "nightshift.fair-value-report.v1",
        generatedAt: new Date().toISOString(),
        clock: status,
        fairValues,
        which,
        methodology: `${API}/v1/study`,
        proofs: { rounds: `${API}/v1/rounds`, scoreboard: `${API}/v1/scoreboard` },
        note: "fairValue/lower/upper are USD per token; lower/upper bound the token's value at the next US regular-session open (90% band).",
      },
      null,
      2,
    );
  };
}
