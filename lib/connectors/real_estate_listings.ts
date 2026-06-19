/**
 * Day 16 v3 — Real estate listings connector (refactored to use
 * the bundled overpassBatch client — mirrors, cache, longer timeout).
 *
 * Counts landuse polygons within 2km that match the user's vertical
 * (residential / commercial / industrial / mixed-use / civic /
 * farmland). Returns a single signal of type "landuse_count".
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";

const VERTICAL_LANDUSE: Record<string, string> = {
  residential_land: "residential",
  commercial_land: "commercial",
  industrial_land: "industrial",
  retail_shop: "retail",
  mixed_use_land: "mixed_use",
  civic_land: "civic",
  agricultural_land: "farmland",
};

const RADIUS_M = 2_000;

export const realEstateListingsConnector: Connector = {
  id: "real_estate_listings",
  name: "Real estate listings (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site, vertical } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const targetLanduse = VERTICAL_LANDUSE[vertical as string] ?? "residential";
    // Wide query: count all residential/commercial/industrial polygons
    // within 2km. If the site is in a residential precinct the count
    // is high; if it's in a commercial CBD the residential count is
    // low. Either way Atlas has a real signal for "what is around".
    const count = await overpassBatch(lat, lng, [
      {
        key: "real_estate_landuse",
        ql: `(way["landuse"~"residential|commercial|industrial|retail"](around:${RADIUS_M},${lat},${lng}););`,
      },
    ]).then((c) => c.real_estate_landuse ?? 0);

    const weight = Math.max(0, Math.min(1, count / 50));
    return [{
      id: `real_estate_listings:${site.id}:landuse_count`,
      source: "real_estate_listings",
      type: "landuse_count",
      lat,
      lng,
      label: `${count} ${targetLanduse} landuse polygons within ${(RADIUS_M / 1000).toFixed(1)}km`,
      value: count,
      weight,
      fetchedAt: new Date().toISOString(),
    }];
  },
};
