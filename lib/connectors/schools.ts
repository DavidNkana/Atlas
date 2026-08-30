/**
 * Day 16 v3 — Schools connector (refactored to overpassBatch).
 *
 * Mirror fallback + 5-min cache + 15s timeout now handled by the
 * shared client.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";
import { coordinatorFetch, registerModule, type CoordinatorCtx } from "./overpass-coordinator";

const RADIUS_M = 2_000;
const MAX_SCHOOLS = 15;

// Register query with the bundling coordinator so all Overpass-based
// connectors share one HTTP call per site instead of N separate calls.
registerModule({
  id: "schools",
  buildQueries: (lat, lng, ctx) => [
    {
      key: "schools",
      ql: `node["amenity"~"school|college|university|kindergarten"](around:${ctx?.radius ?? RADIUS_M},${lat},${lng});`,
    },
  ],
});

export const schoolsConnector: Connector = {
  id: "schools",
  name: "Schools (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    // Read count from the pre-fetched coordinator results.
    const all = await coordinatorFetch(lat, lng, {
      radius: RADIUS_M,
      vertical: ctx.vertical as string,
    });
    const count = all["schools:schools"] ?? 0;

    const weight = Math.max(0, Math.min(1, count / MAX_SCHOOLS));

    return [{
      id: `schools:${site.id}:schools_count`,
      source: "schools",
      type: "schools_count",
      lat,
      lng,
      label: `${count} schools within ${(RADIUS_M / 1000).toFixed(1)}km`,
      value: count,
      weight,
      fetchedAt: new Date().toISOString(),
      payload: { radiusM: RADIUS_M },
    }];
  },
};
