/**
 * Day 16 v3 — Public transport connector (refactored to overpassBatch).
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";

const RADIUS_M = 1_000;
const MAX_STOPS = 40;

export const transitConnector: Connector = {
  id: "transit",
  name: "Public transport (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const count = await overpassBatch(lat, lng, [
      {
        key: "transit",
        ql: `(node["highway"="bus_stop"](around:${RADIUS_M},${lat},${lng});node["public_transport"="platform"](around:${RADIUS_M},${lat},${lng});node["amenity"="bus_station"](around:${RADIUS_M},${lat},${lng});node["railway"="station"](around:${RADIUS_M},${lat},${lng});node["station"="subway"](around:${RADIUS_M},${lat},${lng}););`,
      },
    ]).then((c) => c.transit ?? 0);

    const weight = Math.max(0, Math.min(1, count / MAX_STOPS));

    return [{
      id: `transit:${site.id}:transit_count`,
      source: "transit",
      type: "transit_count",
      lat,
      lng,
      label: `${count} transit stops within ${(RADIUS_M / 1000).toFixed(1)}km`,
      value: count,
      weight,
      fetchedAt: new Date().toISOString(),
      payload: { radiusM: RADIUS_M },
    }];
  },
};
