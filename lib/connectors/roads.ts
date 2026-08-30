/**
 * Day 16 v3 — Road network connector (refactored to overpassBatch).
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";
import { coordinatorFetch, registerModule, type CoordinatorCtx } from "./overpass-coordinator";

/**
 * Radius: 2.5km, not 1km.
 *
 * The road network that actually decides a site is wider than the
 * walk-around. Fuel stations, drive-thrus and roadside retail are
 * highway-interchange businesses: the ramps feeding the interchange
 * and the arterials collecting traffic into it typically sit
 * 1.5-2.5km out. At 1km we were measuring the service road and
 * calling it "road access", which is why interchange sites near the
 * N1/N7 came back with 0-2 roads and scored as if they were
 * land-locked.
 */
const RADIUS_M = 2_500;
/**
 * TUNING DEBT (not changed here — needs a real distribution, Task 3).
 * Now that overpass-client actually parses `out count;` (it never did
 * before, see the ROOT CAUSE FIX comment there), a live probe of Cape
 * Town City Bowl at 2.5km returns ~1,100 matching ways. Against
 * MAX_ROADS = 50 that pins `weight` at 1.0 for every urban site, so
 * the signal stops discriminating between sites. It is not a
 * regression — the old value was pinned at 0.0 for the same reason —
 * but this ceiling wants re-tuning against measured counts across
 * urban / peri-urban / rural sites before it carries real score.
 */
const MAX_ROADS = 50;

/**
 * `*_link` ways are the on/off ramps. They are tagged separately from
 * their parent motorway/trunk in OSM, so the old regex silently
 * dropped every ramp — the single most decision-relevant piece of
 * road geometry for an interchange site.
 */
const HIGHWAY_CLASSES =
  "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|tertiary";

registerModule({
  id: "roads",
  buildQueries: (lat, lng, ctx) => [
    {
      key: "roads",
      ql: `way["highway"~"${HIGHWAY_CLASSES}"](around:${ctx?.radius ?? RADIUS_M},${lat},${lng});`,
    },
  ],
});

export const roadsConnector: Connector = {
  id: "roads",
  name: "Road network (OpenStreetMap)",
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
    const count = all["roads:roads"] ?? 0;

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
