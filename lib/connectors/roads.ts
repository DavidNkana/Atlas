/**
 * Day 16 v3 — Road network connector (refactored to overpassBatch).
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";

const RADIUS_M = 1_000;
const MAX_ROADS = 50;

export const roadsConnector: Connector = {
  id: "roads",
  name: "Road network (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const count = await overpassBatch(lat, lng, [
      {
        key: "roads",
        ql: `way["highway"~"motorway|trunk|primary|secondary|tertiary"](around:${RADIUS_M},${lat},${lng});`,
      },
    ]).then((c) => c.roads ?? 0);

    const weight = Math.max(0, Math.min(1, count / MAX_ROADS));

    return [{
      id: `roads:${site.id}:roads_count`,
      source: "roads",
      type: "roads_count",
      lat,
      lng,
      label: `${count} major roads within ${(RADIUS_M / 1000).toFixed(1)}km`,
      value: count,
      weight,
      fetchedAt: new Date().toISOString(),
      payload: { radiusM: RADIUS_M },
    }];
  },
};
