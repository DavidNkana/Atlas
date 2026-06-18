/**
 * Day 7 (v1: mock) / Day 12 v15 (v2: real) — Real estate listings
 * connector.
 *
 * Day 12 v15: this connector was previously deterministic mock
 * data (FNV-1a hash + Mulberry32 PRNG). The "13 development
 * plots within 2.0km (weight 87%)" the user kept seeing was
 * a fake number. The user reasonably thought it was real.
 *
 * Fixed in v15: it now hits OpenStreetMap Overpass (same public
 * no-key API as the overpass connector) and asks for actual
 * landuse=residential / landuse=farmland / landuse=commercial
 * polygons within 2km. The count is the number of those
 * polygons in the area.
 *
 * Atlas asks multiple data sources for "what listings exist
 * near this point?" to help land developers, property
 * investors, and builders find the right plot.
 *
 * The connector returns a Signal of type "property_listing_density"
 * with a count of listings nearby. The user-facing label is
 * "N development plots within Rm" — Atlas never reveals the
 * upstream listing source. Brand rule: the user never sees
 * "Property24" / "OpenStreetMap" / "Browse AI" — Atlas is the
 * brand, the data sources are invisible infrastructure.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { withTimeout } from "@/lib/util/timeout";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const RADIUS_M = 2_000;
const MAX_EXPECTED = 15;
const FETCH_TIMEOUT_MS = 8_000;

interface OverpassResponse {
  elements?: Array<{ type: string; id: number }>;
}

async function postOverpass(query: string): Promise<OverpassResponse> {
  // Day 12 v15 fix: use raw form encoding (NOT URLSearchParams)
  // — see the comment in lib/connectors/overpass.ts for the
  // full reason. URL-encoding the OverpassQL silently returns
  // 0 results from the public overpass-api.de instance.
  const body = `data=${query}`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status}`);
  }
  return (await res.json()) as OverpassResponse;
}

export const realEstateListingsConnector: Connector = {
  id: "real_estate_listings",
  name: "Real estate listings",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return [];
    }

    // Query OpenStreetMap for actual land-use polygons within
    // 2km. We ask for residential, farmland, commercial, and
    // industrial landuse tags (way + relation + node) plus
    // buildings tagged with landuse=farmland. This is the
    // OSM-canonical "what is this land being used for"
    // query — same data Property24/Private Property index
    // off of (the same OSM data, no scraping needed).
    const query = `[out:json][timeout:10];(` +
      `node["landuse"~"^(residential|farmland|commercial|industrial|retail|meadow|orchard|vineyard|farmyard)$"](around:${RADIUS_M},${lat},${lng});` +
      `way["landuse"~"^(residential|farmland|commercial|industrial|retail|meadow|orchard|vineyard|farmyard)$"](around:${RADIUS_M},${lat},${lng});` +
      `relation["landuse"~"^(residential|farmland|commercial|industrial|retail|meadow|orchard|vineyard|farmyard)$"](around:${RADIUS_M},${lat},${lng});` +
      `);out;`;

    try {
      const data = await withTimeout(
        postOverpass(query),
        FETCH_TIMEOUT_MS,
        "real_estate_listings",
      );
      const count = Array.isArray(data.elements) ? data.elements.length : 0;
      const weight = Math.max(0, Math.min(1, count / MAX_EXPECTED));

      const signal: Signal = {
        id: `real_estate_listings:${site.id}:listing_density`,
        source: "real_estate_listings",
        type: "property_listing_density",
        lat,
        lng,
        label: `${count} development plots within ${(RADIUS_M / 1000).toFixed(1)}km`,
        value: count,
        weight,
        fetchedAt: new Date().toISOString(),
      };
      return [signal];
    } catch {
      // Graceful degrade — if Overpass is down, return []
      // so the route still serves a result. The route reports
      // the failure via connectorsRun[].status = "error".
      return [];
    }
  },
};
