/**
 * Day 16 v3 — Public transport connector (refactored to overpassBatch).
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";
import { coordinatorFetch, registerModule, type CoordinatorCtx } from "./overpass-coordinator";

const RADIUS_M = 1_000;
const MAX_STOPS = 40;

registerModule({
  id: "transit",
  buildQueries: (lat, lng, ctx) => [
    {
      key: "transit",
      ql: `(node["highway"="bus_stop"](around:${ctx?.radius ?? RADIUS_M},${lat},${lng});node["public_transport"="platform"](around:${ctx?.radius ?? RADIUS_M},${lat},${lng});node["amenity"="bus_station"](around:${ctx?.radius ?? RADIUS_M},${lat},${lng});node["railway"="station"](around:${ctx?.radius ?? RADIUS_M},${lat},${lng});node["station"="subway"](around:${ctx?.radius ?? RADIUS_M},${lat},${lng}););`,
    },
  ],
});

export const transitConnector: Connector = {
  id: "transit",
  name: "Public transport (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const all = await coordinatorFetch(lat, lng, {
      radius: RADIUS_M,
      vertical: ctx.vertical as string,
    });
    const count = all["transit:transit"] ?? 0;

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
