/**
 * Day 16 v3 — Shared Overpass client with bundling, mirrors, and caching.
 *
 * The previous design had each Overpass-based connector fire its own
 * HTTP request (overpass, schools, transit, healthcare, roads,
 * competitors, env_constraints = 7 requests per site). With 5 sites
 * per query that's 35 Overpass requests — enough to hit the public
 * Overpass rate limit (~2 req/s sustained → IP block for 5-10 min).
 *
 * This client is the architectural fix:
 *
 *   1. ONE HTTP request per site with ALL queries chained via `;`
 *      (OverpassQL supports it natively).
 *
 *   2. Fallback chain: overpass-api.de → overpass.kumi.systems →
 *      overpass.openstreetmap.fr. If the primary returns 429/5xx,
 *      try the next mirror. Different mirrors run on different
 *      infrastructure so rate limits don't compound.
 *
 *   3. In-memory LRU cache with 5-min TTL. Keyed by `${lat}:${lng}`
 *      rounded to 4 decimal places (~11m precision). If the user
 *      retries the same question within 5 min, zero Overpass calls
 *      fire.
 *
 *   4. Per-request timeout 15s (was 8s — public Overpass is sometimes
 *      slow under load and the tighter timeout caused silent zero
 *      results).
 *
 *   5. Per-query `out count;` so we only get counts, not full bodies.
 *      Cuts response size by ~95%.
 */

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
] as const;

const FETCH_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

interface CacheEntry {
  fetchedAt: number;
  counts: Record<string, number>;
}

const cache = new Map<string, CacheEntry>();

/** Round to ~11m precision so cache hits work for nearby queries. */
function cacheKey(lat: number, lng: number, queryHash: string): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(lat)}:${r(lng)}:${queryHash}`;
}

/**
 * One query block to chain. OverpassQL syntax:
 *   node["amenity"~"school"](around:2000,LAT,LNG);out count;
 * Returns the element count when invoked with `out count;`.
 */
export type OverpassQuery = {
  /** Unique key — used to extract the count from the merged response. */
  key: string;
  /** Full OverpassQL fragment, with ;out count; appended. */
  ql: string;
};

/**
 * Run a batch of queries for ONE site in ONE HTTP request. Returns a
 * map of `key -> count` (0 if not found in the response).
 */
export async function overpassBatch(
  lat: number,
  lng: number,
  queries: OverpassQuery[],
): Promise<Record<string, number>> {
  if (queries.length === 0) return {};
  const queryHash = queries.map((q) => q.key).sort().join("|");
  const key = cacheKey(lat, lng, queryHash);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.counts;
  }

  // Chain all queries with `;` then `out count;` per statement so we
  // get per-query counts.
  const chained = queries
    .map((q) => q.ql.replace(/;\s*$/, ";out count;"))
    .join(";");
  const fullQuery = `[out:json][timeout:25];${chained}`;
  const body = `data=${encodeURIComponent(fullQuery)}`;

  let lastError: unknown = null;
  for (let i = 0; i < MIRRORS.length; i++) {
    const url = MIRRORS[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (
        res.status === 429 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504
      ) {
        lastError = new Error(`Overpass HTTP ${res.status} on ${url}`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`Overpass HTTP ${res.status} on ${url}`);
        break; // 4xx isn't a rate limit — don't try other mirrors
      }
      const data = (await res.json()) as OverpassResponse;
      const elements = Array.isArray(data.elements) ? data.elements : [];

      // Map counts in the order they appear in the response (Overpass
      // returns them in the same order as the chained statements).
      const counts: Record<string, number> = {};
      let qIdx = 0;
      for (const el of elements) {
        if (el.type === "count" && typeof el.tags?.count === "number") {
          const q = queries[qIdx];
          if (q) counts[q.key] = el.tags.count;
          qIdx++;
        }
      }
      // If we got fewer counts than queries, fill missing with 0.
      for (const q of queries) {
        if (!(q.key in counts)) counts[q.key] = 0;
      }
      cache.set(key, { fetchedAt: Date.now(), counts });
      return counts;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (i < MIRRORS.length - 1) await sleep(RETRY_DELAY_MS);
    }
  }

  // All mirrors failed — return zeros rather than throw. The route
  // marks the connectors as "error" and continues.
  console.warn(
    `[overpass-client] all mirrors failed for ${lat},${lng}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
  const zeros: Record<string, number> = {};
  for (const q of queries) zeros[q.key] = 0;
  return zeros;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface OverpassElement {
  type: string;
  id?: number;
  tags?: Record<string, string | number>;
}
interface OverpassResponse {
  elements?: OverpassElement[];
}

/** Cache stats for /api/connectors-status / debug. */
export function overpassCacheStats(): { size: number } {
  return { size: cache.size };
}
