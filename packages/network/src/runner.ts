/**
 * The Night Shift runner: produces a round every 30 minutes (aligned to :00 and :30 UTC), scores
 * forecasts as soon as official opens are published, and logs the scoreboard.
 *
 *   pnpm exec tsx packages/network/src/runner.ts
 */
import { sessionAt } from "@nightshift/core";
import { LiveEngine } from "@nightshift/nfv";
import { produceRound } from "./rounds.ts";
import { scorePending, scoreboard } from "./scorer.ts";
import { openNetworkDb } from "./store.ts";

const ROUND_MINUTES = Number(process.env.NIGHTSHIFT_ROUND_MINUTES ?? 30);
const db = openNetworkDb();
const engine = new LiveEngine();
const log = (msg: string) => console.log(`${new Date().toISOString()} [night-shift] ${msg}`);

let lastRoundSlot = -1;

function tick(): void {
  const now = Date.now();
  const slot = Math.floor(now / (ROUND_MINUTES * 60_000));
  if (slot !== lastRoundSlot) {
    try {
      const r = produceRound(engine, db, now);
      lastRoundSlot = slot;
      if (r) {
        const w = Object.entries(r.weights).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ");
        log(`round ${r.round} (${r.session}/${r.state}) ${r.tokens} tokens; weights ${w}; roots ${Object.entries(r.roots).map(([k, v]) => `${k}:${v.slice(0, 10)}`).join(" ")}`);
      } else log(`round skipped: no data (${sessionAt(now)})`);
    } catch (e) {
      log(`round failed: ${(e as Error).stack ?? e}`);
    }
  }
  try {
    for (const s of scorePending(db, now)) {
      log(`scored ${s.forecaster} vs open ${new Date(s.anchorTime).toISOString()}: n=${s.n} CRPS ${s.meanCrpsBps.toFixed(1)} bps, MAE ${s.maeBps.toFixed(1)} bps, 90% band covered ${(s.coverage * 100).toFixed(1)}%`);
    }
  } catch (e) {
    log(`scoring failed: ${(e as Error).stack ?? e}`);
  }
}

log(`starting; round every ${ROUND_MINUTES} min; session=${sessionAt(Date.now())}`);
const board = scoreboard(db);
if (board.length) console.table(board);
tick();
setInterval(tick, 30_000);
