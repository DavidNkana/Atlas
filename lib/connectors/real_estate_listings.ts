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
    const counts = await overpassBatch(lat, lng, [
      {
        key: "real_estate_landuse",
        ql: `(way["landuse"~"residential|commercial|industrial|retail"](around:${RADIUS_M},${lat},${lng}););`,
      },
      {
        key: "real_estate_buildings",
        ql: `(way["building"~"residential|commercial|industrial|retail|apartments|house|detached"](around:${RADIUS_M},${lat},${lng}););`,
      },
      {
        key: "real_estate_vacant",
        ql: `(way["landuse"~"brownfield|greenfield|construction"](around:${RADIUS_M},${lat},${lng});way["landuse"="vacant"](around:${RADIUS_M},${lat},${lng}););`,
      },
    ]);

    const landuse = counts.real_estate_landuse ?? 0;
    const buildings = counts.real_estate_buildings ?? 0;
    const vacant = counts.real_estate_vacant ?? 0;
    const fetchedAt = new Date().toISOString();

    const signals: Signal[] = [
      {
        id: `real_estate_listings:${site.id}:landuse_count`,
        source: "real_estate_listings",
        type: "landuse_count",
        lat, lng,
        label: `${landuse} ${targetLanduse} landuse polygons within ${(RADIUS_M/1000).toFixed(1)}km`,
        value: landuse,
        weight: Math.max(0, Math.min(1, landuse / 50)),
        fetchedAt,
      },
      {
        id: `real_estate_listings:${site.id}:building_density`,
        source: "real_estate_listings",
        type: "building_density",
        lat, lng,
        label: `${buildings} buildings within ${(RADIUS_M/1000).toFixed(1)}km`,
        value: buildings,
        weight: Math.max(0, Math.min(1, buildings / 100)),
        fetchedAt,
      },
    ];

    if (vacant > 0) {
      signals.push({
        id: `real_estate_listings:${site.id}:vacant_land`,
        source: "real_estate_listings",
        type: "vacant_land",
        lat, lng,
        label: `${vacant} vacant/development land parcels within ${(RADIUS_M/1000).toFixed(1)}km`,
        value: vacant,
        weight: Math.max(0, Math.min(1, vacant / 10)),
        fetchedAt,
      });
    }

    return signals;
  },
};
