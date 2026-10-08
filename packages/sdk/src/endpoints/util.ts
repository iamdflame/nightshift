import { BinanceWeb3Error, type ModuleName } from "../errors.ts";

/** Fail fast (no network) on a missing required parameter. */
export function need<T>(module: ModuleName, endpoint: string, name: string, value: T | undefined | null | ""): T {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
    throw new BinanceWeb3Error({ message: `${endpoint}: required parameter "${name}" is missing`, kind: "param", module, endpoint });
  }
  return value;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function toList(v: readonly string[] | string): string[] {
  return (typeof v === "string" ? v.split(",") : [...v]).map((s) => s.trim()).filter(Boolean);
}
