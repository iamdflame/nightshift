import { describe, expect, it } from "vitest";
import { betaInc, cdf, crps, normCdf, normInv, quantile, tCdf, tInv } from "./dist.ts";

/** Numerical CRPS = ∫ (F(x) - 1{x ≥ y})² dx, used to check the closed forms independently. */
function crpsNumeric(F: (x: number) => number, y: number, lo: number, hi: number, n = 200_000): number {
  const h = (hi - lo) / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = lo + (i + 0.5) * h;
    const d = F(x) - (x >= y ? 1 : 0);
    s += d * d * h;
  }
  return s;
}

describe("distributions", () => {
  it("normal cdf/inverse are consistent", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 6);
    for (const p of [0.001, 0.05, 0.3, 0.5, 0.9, 0.999]) expect(normCdf(normInv(p))).toBeCloseTo(p, 6);
  });

  it("incomplete beta matches known values", () => {
    expect(betaInc(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    expect(betaInc(0.3, 2, 3)).toBeCloseTo(0.3483, 4);
  });

  it("student-t cdf matches tables and inverts", () => {
    expect(tCdf(2.015, 5)).toBeCloseTo(0.95, 3); // t_{0.95,5} = 2.015
    expect(tCdf(-2.776, 4)).toBeCloseTo(0.025, 3); // t_{0.975,4} = 2.776
    for (const p of [0.025, 0.2, 0.5, 0.8, 0.975]) expect(tCdf(tInv(p, 4), 4)).toBeCloseTo(p, 8);
  });

  it("gaussian CRPS closed form matches numerical integration", () => {
    const p = { mu: 0.01, sigma: 0.02, nu: Infinity };
    for (const y of [-0.03, 0, 0.012, 0.05]) {
      expect(crps(p, y)).toBeCloseTo(crpsNumeric((x) => cdf(p, x), y, -0.5, 0.5), 6);
    }
  });

  it("student-t CRPS closed form matches numerical integration", () => {
    const p = { mu: -0.005, sigma: 0.015, nu: 4 };
    for (const y of [-0.04, -0.005, 0.02]) {
      expect(crps(p, y)).toBeCloseTo(crpsNumeric((x) => cdf(p, x), y, -3, 3, 2_000_000), 5);
    }
  });

  it("quantiles bracket the median", () => {
    const p = { mu: 0, sigma: 1, nu: 5 };
    expect(quantile(p, 0.05)).toBeLessThan(0);
    expect(quantile(p, 0.95)).toBeCloseTo(-quantile(p, 0.05), 8);
  });
});
