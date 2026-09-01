/**
 * MVP rebuild Sep 2026 — Building density connector.
 *
 * Replaces the previous "0 buildings within 2km" claim (which was the
 * single biggest credibility killer on the result page) with a real
 * count sourced from OpenStreetMap building polygons.
 *
 * The data lives in lib/data/sa-building-density.ts — a pre-computed
 * lookup keyed by SA suburb centroid. Vercel's 50MB function limit
 * rules out loading the full Google Open Buildings SA GeoJSON
 * (200MB+) at runtime, so we pre-compute counts offline and ship a
 * compact table.
 *
 * Renewal: run `pnpm tsx scripts/build-building-density.ts` monthly
 * (or whenever the catalog adds new suburbs). Until then, the same
 * table serves every query.
 *
 * Graceful degrade: suburb not in table → return [] (no signal). The
 * UI shows "buildings: not measured for this area" rather than the
 * previous fabricated "0".
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { findBuildingDensity } from "@/lib/data/sa-building-density";

/**
 * 2,000 buildings pins the weight at 1.0 — that's a dense inner-city
 * site (Sandton CBD / Cape Town CBD). 200 buildings (suburban) is
 * ~0.10 weight.
 */
const COUNT_FOR_MAX_WEIGHT = 2000;

export const buildingDensityConnector: Connector = {
  id: "building_density",
  name: "Building footprint density",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const entry = findBuildingDensity(lat, lng);
    if (!entry) return [];

    const fetchedAt = new Date().toISOString();
    const count = entry.count;
    const weight = Math.max(0, Math.min(1, count / COUNT_FOR_MAX_WEIGHT));

    return [{
      id: `building_density:${site.id}:count`,
      source: "building_density",
      type: "building_density",
      lat,
      lng,
      label: `${count.toLocaleString()} buildings within 2km of ${entry.suburb} (centroid)`,
      value: count,
      weight,
      fetchedAt,
      payload: {
        suburb: entry.suburb,
        suburbLat: entry.lat,
        suburbLng: entry.lng,
        radiusM: 2000,
        sourceFetchedAt: entry.fetchedAt,
      },
    }];
  },
};
