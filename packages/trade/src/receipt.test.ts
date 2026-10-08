import { describe, expect, it } from "vitest";
import { canonical } from "./receipt.ts";

describe("receipt canonical JSON", () => {
  it("is independent of key order (so the receipt hash is reproducible)", () => {
    const a = { b: 1, a: { y: [3, { q: 1, p: 2 }], x: "z" }, c: null };
    const b = { c: null, a: { x: "z", y: [3, { p: 2, q: 1 }] }, b: 1 };
    expect(canonical(a)).toBe(canonical(b));
    expect(canonical(a)).toBe('{"a":{"x":"z","y":[3,{"p":2,"q":1}]},"b":1,"c":null}');
  });

  it("changes when any value changes", () => {
    expect(canonical({ price: 235.116 })).not.toBe(canonical({ price: 235.117 }));
  });
});
