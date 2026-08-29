/**
 * Day 16 v3 — Competitor density connector (refactored to overpassBatch).
 *
 * Counts direct competitors within a vertical-specific radius.
 * Weight is INVERTED (1 = no competition, 0 = saturated).
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import type { Vertical } from "@/lib/models/types";
import { overpassBatch } from "./overpass-client";

interface CompetitorProfile {
  ql: (lat: number, lng: number) => string;
  radius: number;
  maxExpected: number;
}

/**
 * OSM mapping reality: a competitor is NOT always a `node`.
 *
 * Fuel stations, restaurants in malls, and most retail are commonly
 * mapped as a `way` (the forecourt / building polygon) with no
 * centroid node at all. Querying `node[...]` only meant those sites
 * were invisible — which is why a Cape Town gas-station query with
 * Shell/BP/Engen forecourts within 3km returned a competitor count of
 * 0 while the page text listed them by name. Unioning node + way
 * fixes the coherence bug at the source.
 *
 * Some operators also tag the retail side as `shop=fuel` rather than
 * `amenity=fuel`, so that tag is included for gas stations too.
 */
const COMPETITOR_PROFILES: Record<string, CompetitorProfile> = {
  gas_station: {
    ql: (lat, lng) =>
      `(node["amenity"="fuel"](around:3000,${lat},${lng});way["amenity"="fuel"](around:3000,${lat},${lng});node["shop"="fuel"](around:3000,${lat},${lng}););`,
    radius: 3000,
    maxExpected: 8,
  },
  restaurant: {
    ql: (lat, lng) =>
      `(node["amenity"~"restaurant|cafe|fast_food"](around:1500,${lat},${lng});way["amenity"~"restaurant|cafe|fast_food"](around:1500,${lat},${lng}););`,
    radius: 1500,
    maxExpected: 40,
  },
  warehouse: {
    ql: (lat, lng) => `node["amenity"~"warehouse|industrial"](around:5000,${lat},${lng});`,
    radius: 5000,
    maxExpected: 5,
  },
  retail_shop: {
    ql: (lat, lng) =>
      `(node["shop"~"mall|supermarket|convenience"](around:1500,${lat},${lng});way["shop"~"mall|supermarket|convenience"](around:1500,${lat},${lng}););`,
    radius: 1500,
    maxExpected: 15,
  },
  residential_land: {
    ql: (lat, lng) => `node["building"~"residential|apartments|house"](around:500,${lat},${lng});`,
    radius: 500,
    maxExpected: 200,
  },
  commercial_land: {
    ql: (lat, lng) => `node["office"~"yes|company"](around:500,${lat},${lng});`,
    radius: 500,
    maxExpected: 30,
  },
  industrial_land: {
    ql: (lat, lng) => `node["landuse"="industrial"](around:2000,${lat},${lng});`,
    radius: 2000,
    maxExpected: 10,
  },
  agricultural_land: {
    ql: (lat, lng) => `node["landuse"~"farmland|farmyard|orchard|vineyard"](around:5000,${lat},${lng});`,
    radius: 5000,
    maxExpected: 5,
  },
  mixed_use_land: {
    ql: (lat, lng) => `node["amenity"~"restaurant|cafe|shop|bank"](around:1000,${lat},${lng});`,
    radius: 1000,
    maxExpected: 25,
  },
  civic_land: {
    ql: (lat, lng) => `node["amenity"~"school|hospital|library|townhall"](around:2000,${lat},${lng});`,
    radius: 2000,
    maxExpected: 8,
  },
};

export const competitorDensityConnector: Connector = {
  id: "competitors",
  name: "Competitor density (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site, vertical } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    // Generic competitor fallback for verticals without a profile —
    // node + way for the same OSM-polygon reason as above.
    const profile = COMPETITOR_PROFILES[vertical as string] ?? {
      ql: (la: number, ln: number) =>
        `(node["amenity"~"restaurant|cafe|shop|office"](around:1500,${la},${ln});way["amenity"~"restaurant|cafe|shop|office"](around:1500,${la},${ln}););`,
      radius: 1500,
      maxExpected: 25,
    };

    const count = await overpassBatch(lat, lng, [
      { key: "competitors", ql: profile.ql(lat, lng) },
    ]).then((c) => c.competitors ?? 0);

    // `count` is the size of the node + way union (points AND
    // building/forecourt polygons), so it is a true competitor count
    // rather than the point-only undercount we had before.
    // maxExpected is left untouched — those are tuned values.
    const saturation = Math.min(1, count / profile.maxExpected);
    const weight = Math.max(0, Math.min(1, 1 - saturation));

    return [{
      id: `competitors:${site.id}:competitor_count`,
      source: "competitors",
      type: "competitor_count",
      lat,
      lng,
      label: `${count} ${vertical} competitors (points + premises) within ${(profile.radius / 1000).toFixed(1)}km (saturation ${(saturation * 100).toFixed(0)}%)`,
      value: count,
      weight,
      fetchedAt: new Date().toISOString(),
      payload: {
        vertical,
        count,
        saturation: Number(saturation.toFixed(3)),
        radiusM: profile.radius,
        maxExpected: profile.maxExpected,
      },
    }];
  },
};
