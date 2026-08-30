/**
 * Day 31 — Overpass bundling coordinator.
 *
 * Each Overpass-based connector registers its query needs at module load.
 * For each (lat, lng) we fire ONE chained Overpass call with every
 * registered query, then slice the response back to per-connector.
 *
 * Caching: 5-min TTL per (lat, lng), in-flight dedup so simultaneous
 * callers share one HTTP request.
 *
 * This is what the "working state" had. I lost it during my resets.
 */

import { overpassBatch } from "./overpass-client";

export type CoordinatorQuery = {
  /** Connector-local key — final map uses `${moduleId}:${key}`. */
  key: string;
  /** Full OverpassQL fragment ending in `;`. */
  ql: string;
};

export type CoordinatorModule = {
  id: string;
  buildQueries: (
    lat: number,
    lng: number,
    ctx?: CoordinatorCtx,
  ) => CoordinatorQuery[];
};

export type CoordinatorCtx = {
  radius?: number;
  vertical?: string;
};

const modules: CoordinatorModule[] = [];

export function registerModule(mod: CoordinatorModule): void {
  const idx = modules.findIndex((m) => m.id === mod.id);
  if (idx >= 0) modules[idx] = mod;
  else modules.push(mod);
}

interface CacheEntry {
  fetchedAt: number;
  counts: Record<string, number>;
}

const CACHE_TTL_MS = 5 * 60 * 1_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Record<string, number>>>();

function cacheKey(lat: number, lng: number, moduleIds: string[]): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(lat)}:${r(lng)}:${moduleIds.slice().sort().join("|")}`;
}

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
] as const;

/**
 * Run all registered modules for a single (lat,lng) in ONE Overpass call.
 * Returns a flat map: { "schools:count": 12, "schools:transit_count": 4, ... }.
 */
export async function coordinatorFetch(
  lat: number,
  lng: number,
  ctx: CoordinatorCtx = {},
): Promise<Record<string, number>> {
  if (modules.length === 0) return {};

  const moduleIds = modules.map((m) => m.id);
  const key = cacheKey(lat, lng, moduleIds);

  // Cache hit
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.counts;
  }

  // In-flight dedup
  const pending = inflight.get(key);
  if (pending) return pending;

  // Flatten every module's queries
  const flat: Array<{ moduleId: string; key: string; ql: string }> = [];
  for (const mod of modules) {
    const qs = mod.buildQueries(lat, lng, ctx);
    for (const q of qs) {
      flat.push({ moduleId: mod.id, key: q.key, ql: q.ql });
    }
  }
  if (flat.length === 0) return {};

  // Build chained query
  const inner = flat
    .map((q) => {
      let s = q.ql.replace(/;\s*$/, "").trim();
      s = s.replace(/out\s+count;?/gi, "").trim();
      if (!s) return "";
      return `${s};out count;`;
    })
    .filter(Boolean)
    .join("");
  if (!inner) return {};

  const fullQuery = `[out:json][timeout:25];${inner}`;
  const body = `data=${encodeURIComponent(fullQuery)}`;

  const promise = (async () => {
    for (const url of MIRRORS) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8_000);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Atlas/1.0 (+https://atlas.africa) site-intelligence",
          },
          body,
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) continue;
        const data = (await res.json()) as { elements?: Array<{ type: string; tags?: Record<string, string | number> }> };
        const elements = Array.isArray(data.elements) ? data.elements : [];
        const counts: Record<string, number> = {};
        let qIdx = 0;
        for (const el of elements) {
          if (el.type !== "count") continue;
          let v: number | null = null;
          if (typeof el.tags?.total === "number") v = el.tags.total;
          else if (
            typeof el.tags?.nodes === "number" ||
            typeof el.tags?.ways === "number" ||
            typeof el.tags?.relations === "number"
          ) {
            v =
              Number(el.tags?.nodes ?? 0) +
              Number(el.tags?.ways ?? 0) +
              Number(el.tags?.relations ?? 0);
          } else if (typeof el.tags?.count === "number") {
            v = el.tags.count;
          }
          const entry = flat[qIdx];
          if (!entry) break;
          counts[`${entry.moduleId}:${entry.key}`] = v ?? 0;
          qIdx++;
        }
        // Fill missing with 0
        for (const entry of flat) {
          const k = `${entry.moduleId}:${entry.key}`;
          if (!(k in counts)) counts[k] = 0;
        }
        cache.set(key, { fetchedAt: Date.now(), counts });
        inflight.delete(key);
        return counts;
      } catch {
        // try next mirror
      }
    }
    // All mirrors failed
    inflight.delete(key);
    return {};
  })();

  inflight.set(key, promise);
  return promise;
}
