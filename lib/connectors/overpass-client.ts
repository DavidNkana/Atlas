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

// MVP rebuild Sep 2026 — switched mirror chain to public instances
// that are reliable from South Africa. As of Aug 2026:
//   - overpass-api.de         → overloaded (10k/day soft cap, frequent 429s)
//   - overpass.kumi.systems   → DEAD (rebranded to private.coffee)
//   - overpass.openstreetmap.fr → intermittent
//   - overpass.private.coffee → no rate limit, 4×20-core / 256 GB (preferred primary)
//   - maps.mail.ru/osm/tools/overpass → VK Maps, 2×56-core, no rate limit
// Send a courtesy email to support@private.coffee if we push heavy load.
const MIRRORS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
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

  // Chain all queries, appending `out count;` per statement so we get
  // per-query counts.
  //
  // Joined with "" — NOT ";". Every fragment already ends in `;` after
  // the replace below, so joining on ";" produced `out count;;node[...`
  // and Overpass rejects the empty statement with HTTP 400. The 400
  // then hit the `4xx isn't a rate limit` branch, which breaks out of
  // the mirror loop and returns zeros. Any batch with 2+ queries —
  // env_constraints sends 3 — could therefore never return data.
  const chained = queries
    .map((q) => q.ql.replace(/;\s*$/, ";out count;"))
    .join("");
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
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // overpass-api.de answers 406 Not Acceptable to requests
          // without an identifying User-Agent / Accept pair (verified
          // against the live mirror). 406 is not in the retry list
          // below, so it broke the mirror loop and returned zeros.
          // Identifying the client is also required by the Overpass
          // usage policy.
          "User-Agent": "Atlas/1.0 (+https://atlas.africa) site-intelligence",
          Accept: "application/json",
        },
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
      //
      // ROOT CAUSE FIX: `out count;` does NOT emit `tags.count`. The
      // real shape is
      //   { type: "count", id: 0,
      //     tags: { nodes: "30", ways: "7", relations: "0", total: "37" } }
      // — four keys, and every value is a STRING. The old guard
      // (`typeof el.tags?.count === "number"`) therefore never matched
      // a single element, `counts` was left empty, and the
      // fill-missing-with-0 loop below handed every caller a 0. That
      // is why roads / healthcare / competitors / env_constraints all
      // reported zero on live queries regardless of what was actually
      // on the ground — the queries were fine, the parser was reading
      // a field that does not exist.
      const counts: Record<string, number> = {};
      let qIdx = 0;
      for (const el of elements) {
        if (el.type !== "count") continue;
        const q = queries[qIdx];
        if (q) counts[q.key] = readCount(el.tags);
        qIdx++;
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

/**
 * Read the element total out of an Overpass `out count;` result.
 *
 * Overpass reports `total` alongside the per-type breakdown, and all
 * values arrive as strings. We prefer `total` (it already covers the
 * node + way + relation unions the connectors now issue) and fall
 * back to summing the parts, then to a literal `count` key for any
 * mirror that formats differently.
 */
function readCount(tags: Record<string, string | number> | undefined): number {
  if (!tags) return 0;
  const num = (v: string | number | undefined): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  if (tags.total !== undefined) return num(tags.total);
  if (tags.nodes !== undefined || tags.ways !== undefined || tags.relations !== undefined) {
    return num(tags.nodes) + num(tags.ways) + num(tags.relations);
  }
  if (tags.count !== undefined) return num(tags.count);
  return 0;
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
