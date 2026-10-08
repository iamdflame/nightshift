/**
 * Probability distributions and proper scoring rules.
 *
 * Forecasts are judged with CRPS (continuous ranked probability score), the standard proper
 * scoring rule for predictive distributions: it rewards both accuracy and honest uncertainty,
 * and reduces to absolute error for a point forecast. Closed forms follow Gneiting & Raftery
 * (2007) for the Gaussian and Jordan, Krüger & Lerch (2019, scoringRules) for Student-t.
 */

const SQRT2 = Math.SQRT2;
const SQRT_PI = Math.sqrt(Math.PI);

/** Standard normal pdf / cdf (cdf via erfc with ~1e-7 accuracy, Numerical Recipes erfc). */
export const normPdf = (z: number): number => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

export function normCdf(z: number): number {
  return 0.5 * erfc(-z / SQRT2);
}

function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Inverse standard normal cdf (Acklam's algorithm, |rel err| < 1.2e-9). */
export function normInv(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError("p must be in (0,1)");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** ln Γ(x), Lanczos approximation (g=7, n=9). */
export function lnGamma(x: number): number {
  const g = 7;
  const coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = coef[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coef[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const lnBeta = (a: number, b: number): number => lnGamma(a) + lnGamma(b) - lnGamma(a + b);

/** Regularized incomplete beta I_x(a,b) via Lentz's continued fraction. */
export function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta(a, b));
  if (x < (a + 1) / (a + b + 2)) return (front * betaCf(x, a, b)) / a;
  return 1 - (Math.exp(Math.log(1 - x) * b + Math.log(x) * a - lnBeta(a, b)) * betaCf(1 - x, b, a)) / b;
}

function betaCf(x: number, a: number, b: number): number {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** Standard Student-t pdf and cdf with ν degrees of freedom. */
export function tPdf(z: number, nu: number): number {
  return Math.exp(lnGamma((nu + 1) / 2) - lnGamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - ((nu + 1) / 2) * Math.log(1 + (z * z) / nu));
}

export function tCdf(z: number, nu: number): number {
  const x = nu / (nu + z * z);
  const tail = 0.5 * betaInc(x, nu / 2, 0.5);
  return z >= 0 ? 1 - tail : tail;
}

/** Inverse Student-t cdf by bisection on tCdf (robust, plenty fast for oracle use). */
export function tInv(p: number, nu: number): number {
  if (p <= 0 || p >= 1) throw new RangeError("p must be in (0,1)");
  let lo = -1e3;
  let hi = 1e3;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (tCdf(m, nu) < p) lo = m;
    else hi = m;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

/** A location-scale predictive distribution over the log gap (Gaussian when nu = Infinity). */
export interface Predictive {
  mu: number;
  sigma: number;
  nu: number;
}

export function quantile(p: Predictive, q: number): number {
  const z = Number.isFinite(p.nu) ? tInv(q, p.nu) : normInv(q);
  return p.mu + p.sigma * z;
}

export function cdf(p: Predictive, y: number): number {
  const z = (y - p.mu) / p.sigma;
  return Number.isFinite(p.nu) ? tCdf(z, p.nu) : normCdf(z);
}

/** CRPS of a predictive distribution at outcome y (lower is better; same units as y). */
export function crps(p: Predictive, y: number): number {
  const z = (y - p.mu) / p.sigma;
  if (!Number.isFinite(p.nu)) {
    return p.sigma * (z * (2 * normCdf(z) - 1) + 2 * normPdf(z) - 1 / SQRT_PI);
  }
  const nu = p.nu;
  if (nu <= 1) throw new RangeError("CRPS of Student-t needs nu > 1");
  const Bterm = Math.exp(lnBeta(0.5, nu - 0.5) - 2 * lnBeta(0.5, nu / 2));
  return (
    p.sigma *
    (z * (2 * tCdf(z, nu) - 1) + 2 * tPdf(z, nu) * ((nu + z * z) / (nu - 1)) - ((2 * Math.sqrt(nu)) / (nu - 1)) * Bterm)
  );
}
