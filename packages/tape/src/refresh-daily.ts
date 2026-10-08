/** One-off: refresh official daily bars now (the collector also does this every 20 min). */
import { BSC } from "@nightshift/core";
import { chart } from "@nightshift/feeds";
import { Tape } from "./db.ts";

const tape = new Tape();
const tickers = [...new Set(tape.instruments({ chainId: BSC, issuer: "bstocks" }).map((i) => i.ticker))];
let ok = 0;
for (const t of tickers) {
  const r = await chart(t, "1d", "5d", false);
  if (!r) continue;
  tape.upsertRefBars(t, "1d", r.bars, "yahoo-chart");
  ok++;
}
console.log(`refreshed ${ok}/${tickers.length}`);
