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
import { withTimeout } from "@/lib/util/timeout";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 8_000;

/** Per-vertical max expected counts. Used to normalise the raw count into
 *  a weight in [0..1]. Picked by eyeballing OSM density in major
 *  African CBDs (Cape Town, Sandton, Lusaka, Nairobi, Lagos). */
const MAX_EXPECTED: Record<string, number> = {
  gas_station: 20,
  restaurant: 30,
  warehouse: 10,
  retail_shop: 25,
  // Day 12 v15: added missing verticals so a residential_land
  // or agricultural_land query doesn't fall back to the
  // retail_shop query (which on farmland returns 0).
  residential_land: 30, // schools, hospitals, parks nearby
  commercial_land: 25, // offices, retail, transit nearby
  industrial_land: 10, // warehouses, industrial nearby
  agricultural_land: 5, // farms, vineyards, pastures
  mixed_use_land: 30, // mixed amenities
  civic_land: 10, // schools, hospitals, civic buildings
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
  // Day 12 v15: each missing vertical gets a query that asks
  // for the POIs that actually matter for that vertical.
  residential_land:
    // Schools (parents care), parks (families), hospitals
    // (medical access), and general amenities within 1.5km.
    'node["amenity"~"school|hospital|clinic|park|place_of_worship|supermarket|bank|pharmacy"](around:1500,LAT,LNG);',
  commercial_land:
    // Offices, banks, retail, transit for foot traffic.
    'node["amenity"~"bank|atm|restaurant|cafe|fast_food|bus_station|taxi|post_office|insurance"](around:1000,LAT,LNG);',
  industrial_land:
    // Warehouses, industrial, freight, fuel — what makes a
    // good industrial site.
    'node["amenity"~"warehouse|industrial|truck_stop|fuel|logistics|factory"](around:3000,LAT,LNG);',
  agricultural_land:
    // Landuse tags for farms + nearby water/rural amenities.
    'node["landuse"~"farmland|farmyard|meadow|orchard|vineyard|forest"](around:5000,LAT,LNG);way["landuse"~"farmland|farmyard|meadow|orchard|vineyard|forest"](around:5000,LAT,LNG);',
  mixed_use_land:
    // Mixed-use sites need a mix of amenities. Wider radius
    // because mixed-use usually covers a larger precinct.
    'node["amenity"~"restaurant|cafe|shop|bank|school|bus_station|park"](around:2000,LAT,LNG);',
  civic_land:
    // Schools, hospitals, churches, libraries, community
    // centres — the things civic sites should be near.
    'node["amenity"~"school|college|university|hospital|clinic|place_of_worship|community_centre|library|townhall|courthouse|fire_station|police"](around:2000,LAT,LNG);',
};

/** Per-vertical human radii for the UI label. */
const RADIUS_M: Record<string, number> = {
  gas_station: 1500,
  restaurant: 1000,
  warehouse: 3000,
  retail_shop: 1500,
  // Day 12 v15: radii for the newly-added verticals. Wider for
  // agricultural (rural land needs to look across more area
  // to find any infrastructure) and mixed-use (the precinct
  // is usually larger than a single amenity radius).
  residential_land: 1500,
  commercial_land: 1000,
  industrial_land: 3000,
  agricultural_land: 5000,
  mixed_use_land: 2000,
  civic_land: 2000,
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
  // form-encoded body — what Overpass expects. The `data` field carries
  // the query itself.
  //
  // Day 12 v15 fix: do NOT use URLSearchParams.toString() here.
  // URLSearchParams URL-encodes the OverpassQL brackets and operators
  // (e.g. "[" becomes "%5B"), and the public overpass-api.de instance
  // silently returns 0 results for URL-encoded queries (vs. raw form
  // encoding which returns the full result set). Curl with --data
  // sends the body as raw form encoding by default; fetch + raw
  // string also works. The encoded variant was the bug that made
  // every Overpass signal come back as 0.
  const body = `data=${query}`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
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
      const data = await withTimeout(
        postOverpass(query, controller.signal),
        FETCH_TIMEOUT_MS,
        "overpass",
      );
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
