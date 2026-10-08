import { describe, expect, it } from "vitest";
import { hoursToOpen, lastRegularClose, nextRegularOpen, sessionAt } from "./calendar.ts";

const utc = (s: string) => Date.parse(s);

describe("sessionAt (EDT, UTC-4)", () => {
  it("classifies a normal Thursday", () => {
    expect(sessionAt(utc("2026-10-08T07:00:00Z"))).toBe("overnight"); // 03:00 ET
    expect(sessionAt(utc("2026-10-08T11:00:00Z"))).toBe("pre"); // 07:00 ET
    expect(sessionAt(utc("2026-10-08T13:30:00Z"))).toBe("regular"); // 09:30 ET
    expect(sessionAt(utc("2026-10-08T19:59:00Z"))).toBe("regular"); // 15:59 ET
    expect(sessionAt(utc("2026-10-08T20:00:00Z"))).toBe("post"); // 16:00 ET
    expect(sessionAt(utc("2026-10-09T00:30:00Z"))).toBe("overnight"); // Thu 20:30 ET
  });

  it("goes dark from Friday 20:00 ET to Sunday 20:00 ET", () => {
    expect(sessionAt(utc("2026-10-09T23:59:00Z"))).toBe("post"); // Fri 19:59 ET
    expect(sessionAt(utc("2026-10-10T00:00:00Z"))).toBe("closed"); // Fri 20:00 ET
    expect(sessionAt(utc("2026-10-10T15:00:00Z"))).toBe("closed"); // Sat
    expect(sessionAt(utc("2026-10-11T12:00:00Z"))).toBe("closed"); // Sun 08:00 ET (submission lock)
    expect(sessionAt(utc("2026-10-12T00:00:00Z"))).toBe("overnight"); // Sun 20:00 ET
    expect(sessionAt(utc("2026-10-12T13:30:00Z"))).toBe("regular"); // Mon open
  });

  it("handles a holiday and the evening before it", () => {
    // Thanksgiving Thu 2026-11-26 (EST, UTC-5): Wed evening is not overnight, Thu is closed all day.
    expect(sessionAt(utc("2026-11-26T02:00:00Z"))).toBe("closed"); // Wed 21:00 ET
    expect(sessionAt(utc("2026-11-26T15:00:00Z"))).toBe("closed"); // Thu 10:00 ET
    expect(sessionAt(utc("2026-11-27T02:00:00Z"))).toBe("overnight"); // Thu 21:00 ET → Fri trading day
    expect(sessionAt(utc("2026-11-27T17:30:00Z"))).toBe("regular"); // Fri 12:30 ET, early-close day
    expect(sessionAt(utc("2026-11-27T18:30:00Z"))).toBe("post"); // Fri 13:30 ET, after the 13:00 early close
    expect(sessionAt(utc("2026-11-27T22:30:00Z"))).toBe("closed"); // Fri 17:30 ET, weekend begins early
  });
});

describe("open/close arithmetic", () => {
  it("finds Monday's open from a weekend instant", () => {
    expect(new Date(nextRegularOpen(utc("2026-10-10T15:00:00Z"))).toISOString()).toBe("2026-10-12T13:30:00.000Z");
    expect(hoursToOpen(utc("2026-10-11T12:00:00Z"))).toBeCloseTo(25.5, 5);
  });
  it("finds Friday's close from a weekend instant", () => {
    expect(new Date(lastRegularClose(utc("2026-10-10T15:00:00Z"))).toISOString()).toBe("2026-10-09T20:00:00.000Z");
  });
  it("respects DST (EST after Nov 1)", () => {
    expect(new Date(nextRegularOpen(utc("2026-11-07T15:00:00Z"))).toISOString()).toBe("2026-11-09T14:30:00.000Z");
  });
});
