/**
 * Day 5 hotfix v3 — sanitize payload for Prisma's `Json` codec.
 *
 * Why this exists:
 *   Prisma's Postgres `Json` column rejects values that JSON.stringify
 *   cannot represent natively:
 *     - `undefined` (Prisma serializes fields as `null`, but we sometimes
 *       build response objects where `lat?: number` may be undefined)
 *     - `NaN`, `Infinity`, `-Infinity` (not valid JSON numbers)
 *     - `function`, `symbol`, `bigint` (non-serializable)
 *
 *   When the route.ts build path produces a response with these (e.g.
 *   from a model that returned text without lat/lng, or a scoring
 *   engine that computed NaN from zero signals), Prisma's `Json`
 *   serializer throws PrismaClientValidationError. That throws up to
 *   route.ts which surfaces it as a 500.
 *
 * How it works:
 *   - Recursively walk the object.
 *   - Drop keys whose value is `undefined`.
 *   - Replace `NaN` / `Infinity` / `-Infinity` with `null`.
 *   - Replace functions/symbols/bigints with `null` (we don't have any
 *     in practice but it's a safety net).
 *   - Arrays are walked index-by-index.
 *   - Dates are preserved as ISO strings (JSON-friendly).
 */
export function sanitizeForJson<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: any): any {
  if (value === null) return null;
  if (value === undefined) return undefined; // filtered by parent
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    return null; // NaN / Infinity / -Infinity → null
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => walk(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      const v = (value as any)[key];
      if (v === undefined) continue; // drop undefined keys
      out[key] = walk(v);
    }
    return out;
  }
  return null;
}
