import { describe, expect, it } from "vitest";
import { usdToUnits } from "./x402.ts";

describe("x402 price units", () => {
  it("converts USD strings to 18-decimal atomic units exactly", () => {
    expect(usdToUnits("0.01")).toBe("10000000000000000");
    expect(usdToUnits("1")).toBe("1000000000000000000");
    expect(usdToUnits("0.1")).toBe("100000000000000000");
  });
  it("rejects malformed prices", () => {
    expect(() => usdToUnits("-1")).toThrow();
    expect(() => usdToUnits("0.0000000000000000001")).toThrow();
  });
});
