/**
 * Day 16 v3 — Healthcare connector (refactored to overpassBatch).
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";

const RADIUS_M = 3_000;
const MAX_HEALTH = 25;

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
        ql: `node["amenity"~"hospital|clinic|doctors|pharmacy|dentist"](around:${RADIUS_M},${lat},${lng});`,
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
