import { describe, expect, it } from "vitest";
import { POST_POLICY, postReason } from "./publish.ts";

const row = (o: Partial<Record<string, number | string>> = {}) => ({
  fair_value: 100,
  lower: 98,
  upper: 102,
  session: "closed",
  flags: 0,
  computed_at: 10 * 3600_000,
  ...o,
});
const last = { fair_value: 100, lower: 98, upper: 102, session: "closed", flags: 0, computed_at: 9 * 3600_000 };

describe("oracle posting policy (deviation + heartbeat)", () => {
  it("always posts tokens a contract consumes, and a token's first report", () => {
    expect(postReason(row(), last, true)).toBe("consumed");
    expect(postReason(row(), undefined, false)).toBe("first");
  });

  it("skips an unchanged report inside the heartbeat", () => {
    expect(postReason(row({ fair_value: 100.2 }), last, false)).toBeNull();
  });

  it("posts on a fair-value move at the threshold", () => {
    expect(postReason(row({ fair_value: 100 * (1 + POST_POLICY.deviationBps / 1e4) }), last, false)).toBe("deviation");
    expect(postReason(row({ fair_value: 100 * (1 - POST_POLICY.deviationBps / 1e4) }), last, false)).toBe("deviation");
  });

  it("posts when the band widens or narrows enough, a session or flag changes, or the heartbeat is due", () => {
    expect(postReason(row({ lower: 97, upper: 103 }), last, false)).toBe("band");
    expect(postReason(row({ session: "overnight" }), last, false)).toBe("session");
    expect(postReason(row({ flags: 1 }), last, false)).toBe("session");
    expect(postReason(row({ computed_at: last.computed_at + POST_POLICY.heartbeatMs }), last, false)).toBe("heartbeat");
  });
});
