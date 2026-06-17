/**
 * Day 5 — OpenStreetMap Overpass connector.
 *
 * What is Overpass?
 *   Overpass is a free, public, no-API-key read API for OpenStreetMap.
 *   You POST a small query language (OverpassQL) and get back every OSM
 *   node/way/relation that matches. Docs: https://overpass-api.de/
 *
 * Why Overpass for Atlas?
 *   - Public + free + no key (no signup, no quota dashboard, no surprise bill).
 *   - Global coverage — works for Lusaka today, Tokyo tomorrow.
 *   - Rich POI taxonomy (amenity, shop, industrial) lets us reason about
 *     density of competitors / complementary businesses around a site.
 *   - Generous rate limit on the public instance (we add an 8s AbortController
 *     timeout so we never block the request handler for minutes).
 *
 * Per vertical we ask Overpass for the relevant POIs inside a radius
 * (1500m for fuel/convenience, 1000m for restaurants, etc.) and emit a
 * single Signal of type "amenity_density" — count of POIs / maxExpected.
 *
 * On any error (timeout, 5xx, malformed JSON) we swallow the error and
 * return [] so the API route can still serve a degraded response.
 */

import type { Connector, ConnectorContext, Signal } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 8_000;

/** Per-vertical max expected counts. Used to normalise the raw count into
 *  a weight in [0..1]. Picked by eyeballing OSM density in Lusaka CBD. */
const MAX_EXPECTED: Record<string, number> = {
  gas_station: 20,
  restaurant: 30,
  warehouse: 10,
  retail_shop: 25,
};

/** Per-vertical OverpassQL templates. LAT and LNG are substituted at call
 *  time. The `around:R` radius is in metres. */
const QUERIES: Record<string, string> = {
  gas_station:
    'node["amenity"~"fuel|convenience"](around:1500,LAT,LNG);',
  restaurant:
    'node["amenity"~"restaurant|cafe|bar|fast_food"](around:1000,LAT,LNG);',
  warehouse:
    'node["amenity"~"warehouse|industrial"](around:3000,LAT,LNG);',
  retail_shop:
    'node["shop"~"mall|supermarket|convenience|general"](around:1500,LAT,LNG);',
};

/** Per-vertical human radii for the UI label. */
const RADIUS_M: Record<string, number> = {
  gas_station: 1500,
  restaurant: 1000,
  warehouse: 3000,
  retail_shop: 1500,
};

function buildQuery(vertical: string, lat: number, lng: number): string {
  const inner = QUERIES[vertical];
  if (!inner) {
    // Unknown vertical — fall back to retail_shop so we never throw.
    const fallback = QUERIES.retail_shop
      .replace("LAT", lat.toString())
      .replace("LNG", lng.toString());
    return `[out:json][timeout:10];${fallback}`;
  }
  return `[out:json][timeout:10];${inner
    .replace("LAT", lat.toString())
    .replace("LNG", lng.toString())}`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

async function postOverpass(query: string, signal: AbortSignal): Promise<OverpassResponse> {
  // form-encoded body — what Overpass expects. The `data` field carries the
  // query itself.
  const body = new URLSearchParams({ data: query });
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status}`);
  }
  return (await res.json()) as OverpassResponse;
}

export const overpassConnector: Connector = {
  id: "overpass",
  name: "OpenStreetMap Overpass",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { vertical, site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return [];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const query = buildQuery(vertical, lat, lng);
      const data = await postOverpass(query, controller.signal);
      clearTimeout(timer);

      const elements = Array.isArray(data.elements) ? data.elements : [];
      const count = elements.length;
      const max = MAX_EXPECTED[vertical] ?? 20;
      const radius = RADIUS_M[vertical] ?? 1500;
      const weight = Math.max(0, Math.min(1, count / max));

      const signal: Signal = {
        id: `overpass:${site.id}:amenity_density`,
        source: "overpass",
        type: "amenity_density",
        lat,
        lng,
        label: `${count} amenities within ${(radius / 1000).toFixed(1)}km`,
        value: count,
        weight,
        fetchedAt: new Date().toISOString(),
      };
      return [signal];
    } catch {
      // Swallow every error (timeout, network, parse, 5xx). The API route
      // logs and reports the failure via connectorsRun[].status = "error".
      clearTimeout(timer);
      return [];
    }
  },
};
