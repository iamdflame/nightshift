import { describe, expect, it } from "vitest";
import type { Gap } from "./gaps.ts";
import { segmentBounds, v2Mu } from "./provenance.ts";

const gap = (closeIso: string, openIso: string): Gap => ({
  id: "t",
  kind: "weekend",
  closeTime: Date.parse(closeIso),
  openTime: Date.parse(openIso),
  closeDate: closeIso.slice(0, 10),
  openDate: openIso.slice(0, 10),
});

describe("information-provenance segment bounds", () => {
  it("weekend: post-market ends Fri 20:00 ET, overnight restarts Sun 20:00 ET (EDT)", () => {
    const { postEnd, restart } = segmentBounds(gap("2026-10-09T20:00:00Z", "2026-10-12T13:30:00Z"));
    expect(new Date(postEnd).toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(new Date(restart).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("weekday: no dark segment (overnight starts as post-market ends)", () => {
    const { postEnd, restart } = segmentBounds(gap("2026-10-07T20:00:00Z", "2026-10-08T13:30:00Z"));
    expect(new Date(postEnd).toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(restart).toBe(postEnd);
  });

  it("holiday weekend (Thanksgiving, EST): dark from Thu? no — Wed post ends, dark through Thu, restart Thu 20:00 ET", () => {
    const { postEnd, restart } = segmentBounds(gap("2026-11-25T21:00:00Z", "2026-11-27T14:30:00Z"));
    expect(new Date(postEnd).toISOString()).toBe("2026-11-26T01:00:00.000Z"); // Wed 20:00 EST
    expect(new Date(restart).toISOString()).toBe("2026-11-27T01:00:00.000Z"); // Thu 20:00 EST
  });

  it("forecast is the dot product of trust weights and segment features", () => {
    expect(v2Mu([1, 1, 0.5, 0.5, 0, 0], [0.01, 0.002, -0.004, 0.001, 0.3, 0.3])).toBeCloseTo(0.01 + 0.002 - 0.002 + 0.0005, 12);
  });
});
