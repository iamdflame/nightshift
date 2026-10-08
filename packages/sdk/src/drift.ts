/**
 * Doc-drift detection: compare a live response against the documented zod schema.
 *
 *   undocumented = keys present in the response but absent from the documented schema
 *   missing      = documented keys absent from the response
 *
 * Paths are normalized (`data[].statusInfo.reasonCode`) so records aggregate across calls. Map-like
 * documented objects (z.record) accept any key. Arrays are sampled (first N items) to bound cost.
 */
import type { z } from "zod";

type Schema = z.ZodType;
interface Def {
  type: string;
  [key: string]: unknown;
}

export interface DriftReport {
  undocumented: string[];
  missing: string[];
}

function defOf(s: unknown): Def | undefined {
  return (s as { def?: Def } | undefined)?.def;
}

/** Strip wrappers that don't change the documented shape. */
function unwrap(schema: Schema): Schema {
  let s = schema;
  for (let i = 0; i < 32; i++) {
    const d = defOf(s);
    if (!d) return s;
    switch (d.type) {
      case "optional":
      case "nullable":
      case "default":
      case "prefault":
      case "readonly":
      case "catch":
      case "nonoptional":
        s = d.innerType as Schema;
        continue;
      case "lazy":
        s = (d.getter as () => Schema)();
        continue;
      case "pipe": {
        const out = d.out as Schema;
        s = defOf(out)?.type === "transform" ? (d.in as Schema) : out;
        continue;
      }
      default:
        return s;
    }
  }
  return s;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

function kindMatches(schema: Schema, value: unknown): boolean {
  const t = defOf(unwrap(schema))?.type;
  if (value === null || value === undefined) return true;
  if (t === "object" || t === "record") return isPlainObject(value);
  if (t === "array" || t === "tuple") return Array.isArray(value);
  if (t === "string" || t === "enum" || t === "literal") return typeof value === "string" || t === "literal";
  if (t === "number" || t === "int" || t === "bigint") return typeof value === "number" || typeof value === "bigint";
  if (t === "boolean") return typeof value === "boolean";
  return true;
}

function walk(schema: Schema, value: unknown, path: string, und: Set<string>, mis: Set<string>, maxItems: number, depth: number): void {
  if (depth > 40 || value === null || value === undefined) return;
  const s = unwrap(schema);
  const d = defOf(s);
  if (!d) return;
  switch (d.type) {
    case "object": {
      if (!isPlainObject(value)) return;
      const shape = d.shape as Record<string, Schema>;
      for (const key of Object.keys(value)) if (!Object.hasOwn(shape, key)) und.add(join(path, key));
      for (const [key, sub] of Object.entries(shape)) {
        if (!Object.hasOwn(value, key)) mis.add(join(path, key));
        else walk(sub, value[key], join(path, key), und, mis, maxItems, depth + 1);
      }
      return;
    }
    case "array":
      if (Array.isArray(value)) for (const item of value.slice(0, maxItems)) walk(d.element as Schema, item, `${path}[]`, und, mis, maxItems, depth + 1);
      return;
    case "tuple":
      if (Array.isArray(value)) (d.items as Schema[]).forEach((item, i) => walk(item, value[i], `${path}[${i}]`, und, mis, maxItems, depth + 1));
      return;
    case "record":
      if (isPlainObject(value))
        for (const v of Object.values(value).slice(0, maxItems)) walk(d.valueType as Schema, v, join(path, "*"), und, mis, maxItems, depth + 1);
      return;
    case "union": {
      let best: { u: Set<string>; m: Set<string> } | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const option of d.options as Schema[]) {
        const u = new Set<string>();
        const m = new Set<string>();
        walk(option, value, path, u, m, maxItems, depth + 1);
        const score = (kindMatches(option, value) ? 0 : 1e6) + u.size + m.size;
        if (score < bestScore) {
          bestScore = score;
          best = { u, m };
        }
      }
      best?.u.forEach((x) => und.add(x));
      best?.m.forEach((x) => mis.add(x));
      return;
    }
    default:
      return;
  }
}

export function detectDrift(schema: Schema, value: unknown, opts: { maxArrayItems?: number } = {}): DriftReport {
  const und = new Set<string>();
  const mis = new Set<string>();
  walk(schema, value, "", und, mis, opts.maxArrayItems ?? 25, 0);
  return { undocumented: [...und].sort(), missing: [...mis].sort() };
}

/** Human-readable zod issues ("data[0].price: expected string, received number"), capped. */
export function formatIssues(error: z.ZodError, max = 20): string[] {
  return error.issues.slice(0, max).map((i) => {
    const path = i.path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), "");
    return `${path || "(root)"}: ${i.message}`;
  });
}
