/**
 * MVP rebuild Sep 2026 — TomTom Places Search Nearby connector.
 *
 * Free-tier replacement for Google Places Nearby Search. Atlas now
 * fires TomTom first (free) and falls back to Google Places only when
 * TomTom returns nothing.
 *
 * Free tier (Sep 2026): 5,000 Places Search calls/month, plus
 * 20,000 reverse geocoding and 20,000 traffic flow segments/month.
 * With caching keyed by bbox-grid, Atlas stays well inside this.
 *
 * Endpoints used:
 *   - searchNearby: GET /search/2/places/searchNearby/{QUERY}.json
 *     with lat, lon, radius, categorySet, limit, key
 *
 * TomTom category IDs (vs Google Places primary types):
 *   7315  Restaurant
 *   7311  Cafe
 *   7314  Bar/Pub
 *   9361  Hotel/Lodging
 *   7320  Shopping/Retail
 *   7321  Supermarket/Grocery
 *   7339  Gas Station (Petrol Station)
 *   7335  School
 *   7376  Hospital/Clinic
 *   7372  Bank
 *   7322  Pharmacy
 *
 * Graceful degrade: missing key, quota exceeded, or HTTP error → empty
 * signals. UI shows "signals missing" not a hard error.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { withTimeout } from "@/lib/util/timeout";

const BASE_URL = "https://api.tomtom.com/search/2/places/searchNearby";
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;

/** Category ID → human label for the signal type field. */
interface TomtomCategory {
  id: string;
  /** TomTom category-set numeric ID. */
  ids: string[];
  /** Signal type this contributes to. */
  signalType: string;
  /** Display label. */
  label: string;
  /** Vertical-specific weight max — used to scale `value` → `weight`. */
  expectedMax: number;
}

/** Default categories for restaurant / mixed-use / general POI density. */
const CATEGORIES_DEFAULT: TomtomCategory[] = [
  { id: "food", ids: ["7315", "7311", "7314"], signalType: "amenity_density", label: "Food & drink", expectedMax: 30 },
  { id: "retail", ids: ["7320", "7321"], signalType: "retail_density", label: "Retail", expectedMax: 20 },
  { id: "lodging", ids: ["9361"], signalType: "lodging_density", label: "Lodging", expectedMax: 10 },
  { id: "services", ids: ["7372", "7322"], signalType: "services_density", label: "Services", expectedMax: 10 },
];

/** Vertical-aware category sets. */
const CATEGORIES_BY_VERTICAL: Record<string, TomtomCategory[]> = {
  restaurant: [
    { id: "food", ids: ["7315", "7311", "7314"], signalType: "amenity_density", label: "Food & drink", expectedMax: 30 },
    { id: "lodging", ids: ["9361"], signalType: "lodging_density", label: "Hotels (footfall)", expectedMax: 10 },
    { id: "retail", ids: ["7320", "7321"], signalType: "retail_density", label: "Retail", expectedMax: 20 },
  ],
  retail_shop: [
    { id: "retail", ids: ["7320", "7321"], signalType: "retail_density", label: "Retail", expectedMax: 25 },
    { id: "food", ids: ["7315", "7311"], signalType: "amenity_density", label: "Food & drink", expectedMax: 30 },
    { id: "services", ids: ["7372", "7322"], signalType: "services_density", label: "Services", expectedMax: 10 },
  ],
  gas_station: [
    { id: "fuel", ids: ["7339"], signalType: "fuel_stations_nearby", label: "Fuel stations", expectedMax: 5 },
    { id: "food", ids: ["7315", "7311"], signalType: "amenity_density", label: "Food & drink", expectedMax: 15 },
  ],
  warehouse: [
    { id: "industrial", ids: ["7320"], signalType: "retail_density", label: "Retail/Industrial", expectedMax: 10 },
  ],
  residential_land: [
    { id: "schools", ids: ["7335"], signalType: "schools_count", label: "Schools", expectedMax: 8 },
    { id: "food", ids: ["7321"], signalType: "amenity_density", label: "Groceries", expectedMax: 8 },
  ],
  commercial_land: CATEGORIES_DEFAULT,
  mixed_use_land: CATEGORIES_DEFAULT,
  industrial_land: [
    { id: "services", ids: ["7339"], signalType: "amenity_density", label: "Services", expectedMax: 5 },
  ],
  agricultural_land: [
    { id: "services", ids: ["7339"], signalType: "amenity_density", label: "Nearest services", expectedMax: 5 },
  ],
  civic_land: [
    { id: "services", ids: ["7335", "7376", "7372"], signalType: "amenity_density", label: "Public services", expectedMax: 10 },
  ],
};

/** Haversine in metres. */
function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface TomtomPlace {
  id: string;
  poi?: { name?: string; categorySet?: Array<{ id: number }> };
  address?: { freeformAddress?: string };
  position?: { lat: number; lon: number };
  dist?: number;
}

interface TomtomResponse {
  results: TomtomPlace[];
  summary?: { totalResults?: number; numResults?: number };
}

/** In-memory cache keyed by bbox + categories to amortise calls. */
const cache = new Map<string, { fetchedAt: number; results: TomtomPlace[] }>();

function cacheKey(
  lat: number,
  lng: number,
  radius: number,
  categoryIds: string[],
): string {
  // ~1km grid for cache hits on nearby sites.
  return `${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}:${categoryIds.sort().join(",")}`;
}

async function fetchCategoryNearby(
  lat: number,
  lng: number,
  radius: number,
  categoryIds: string[],
  apiKey: string,
  signal: AbortSignal,
): Promise<TomtomPlace[]> {
  const key = cacheKey(lat, lng, radius, categoryIds);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.results;
  }

  const url =
    `${BASE_URL}/.json` +
    `?lat=${lat}` +
    `&lon=${lng}` +
    `&radius=${radius}` +
    `&categorySet=${categoryIds.join(",")}` +
    `&limit=50` +
    `&key=${apiKey}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`TomTom Places HTTP ${res.status}`);
  }
  const data = (await res.json()) as TomtomResponse;
  const results = Array.isArray(data.results) ? data.results : [];
  cache.set(key, { fetchedAt: Date.now(), results });
  return results;
}

export const tomtomPlacesConnector: Connector = {
  id: "tomtom_places",
  name: "Live POI density (TomTom)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site, vertical } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const apiKey = process.env.TOMTOM_API_KEY;
    if (!apiKey) {
      console.warn("[tomtom_places] TOMTOM_API_KEY not set in Vercel env");
      // Sep 2026 debug — surface the reason so the user can see why.
      return [{
        id: `tomtom_places:${site.id}:debug`,
        source: "tomtom_places",
        type: "amenity_density",
        lat, lng,
        label: "DEBUG: TOMTOM_API_KEY not set in Vercel env vars",
        value: 0, weight: 0, fetchedAt: new Date().toISOString(),
      }];
    }

    const categories =
      CATEGORIES_BY_VERTICAL[vertical as string] ?? CATEGORIES_DEFAULT;
    const fetchedAt = new Date().toISOString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      // Fire each category group in parallel.
      const responses = await withTimeout(
        Promise.all(
          categories.map((cat) =>
            fetchCategoryNearby(lat, lng, 1500, cat.ids, apiKey, controller.signal)
              .then((places) => ({ cat, places }))
              .catch((e) => {
                console.warn(`[tomtom] ${cat.id} failed: ${String(e)}`);
                return { cat, places: [] };
              }),
          ),
        ),
        FETCH_TIMEOUT_MS,
        "tomtom_places",
      );

      const signals: Signal[] = [];
      for (const { cat, places } of responses) {
        // Sort by distance to site.
        const enriched = places
          .map((p) => {
            const pLat = p.position?.lat ?? lat;
            const pLng = p.position?.lon ?? lng;
            const dist = p.dist ?? haversineM(lat, lng, pLat, pLng);
            return {
              name: p.poi?.name ?? "(unnamed)",
              distM: Math.round(dist),
              category: cat.label,
            };
          })
          .sort((a, b) => a.distM - b.distM);

        const count = enriched.length;
        const weight = Math.max(0, Math.min(1, count / cat.expectedMax));
        const top3 = enriched
          .slice(0, 3)
          .map((p) => `${p.name} (${p.distM}m)`)
          .join(", ");

        signals.push({
          id: `tomtom_places:${site.id}:${cat.id}`,
          source: "tomtom_places",
          type: cat.signalType,
          lat,
          lng,
          label:
            count === 0
              ? `0 ${cat.label.toLowerCase()} within 1.5km`
              : `${count} ${cat.label.toLowerCase()} within 1.5km · top: ${top3}`,
          value: count,
          weight,
          fetchedAt,
          payload: {
            categoryId: cat.id,
            radiusM: 1500,
            top5: enriched.slice(0, 5),
          },
        });
      }

      return signals;
    } catch (e) {
      console.warn(
        `[tomtom_places] fetch failed for ${lat},${lng}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      // Surface the error so the result page shows why the connector is empty.
      return [{
        id: `tomtom_places:${site.id}:debug`,
        source: "tomtom_places",
        type: "amenity_density",
        lat, lng,
        label: `DEBUG: TomTom error — ${
          e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80)
        }`,
        value: 0, weight: 0, fetchedAt: new Date().toISOString(),
      }];
    } finally {
      clearTimeout(timer);
    }
  },
};
