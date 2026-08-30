/**
 * Day 16 v3 — Healthcare connector (refactored to overpassBatch).
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";
import { coordinatorFetch, registerModule, type CoordinatorCtx } from "./overpass-coordinator";

const RADIUS_M = 3_000;
const MAX_HEALTH = 25;

/**
 * Hospitals and clinics are almost always mapped in OSM as a `way`
 * (the grounds or building footprint), not a point. Querying
 * `node[...]` only returned 0 for real Cape Town sites that have a
 * mapped hospital 1km away. Union node + way, and also pick up
 * `healthcare=*` which is the newer tagging scheme many SA imports
 * use instead of `amenity=*`.
 */
const HEALTH_AMENITIES = "hospital|clinic|doctors|pharmacy|dentist";
const HEALTH_CARE_TAGS = "hospital|clinic|doctor|pharmacy|dentist|centre";

export const healthcareConnector: Connector = {
  id: "healthcare",
  name: "Healthcare (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const count = await overpassBatch(lat, lng, [
      {
        key: "healthcare",
        ql: `(node["amenity"~"${HEALTH_AMENITIES}"](around:${RADIUS_M},${lat},${lng});way["amenity"~"${HEALTH_AMENITIES}"](around:${RADIUS_M},${lat},${lng});node["healthcare"~"${HEALTH_CARE_TAGS}"](around:${RADIUS_M},${lat},${lng});way["healthcare"~"${HEALTH_CARE_TAGS}"](around:${RADIUS_M},${lat},${lng}););`,
      },
    ]).then((c) => c.healthcare ?? 0);

    const weight = Math.max(0, Math.min(1, count / MAX_HEALTH));

    return [{
      id: `healthcare:${site.id}:healthcare_count`,
      source: "healthcare",
      type: "healthcare_count",
      lat,
      lng,
      label: `${count} healthcare facilities within ${(RADIUS_M / 1000).toFixed(1)}km`,
      value: count,
      weight,
      fetchedAt: new Date().toISOString(),
      payload: { radiusM: RADIUS_M },
    }];
  },
};
