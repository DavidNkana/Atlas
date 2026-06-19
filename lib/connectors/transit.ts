/**
 * Day 16 — Public transport connector.
 *
 * Counts bus stops, taxi ranks, and train stations within 1km of
 * the candidate site. Transport accessibility is the #1 driver of
 * foot-traffic-dependent businesses (retail, restaurant, gas
 * station) and a major factor for residential demand.
 *
 * Uses OpenStreetMap Overpass with public_transport=platform tags
 * + amenity=bus_station for major interchanges.
 */

import type { Connector, ConnectorContext, Signal } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 8_000;
const RADIUS_M = 1_000;
const MAX_STOPS = 40;

function buildQuery(lat: number, lng: number): string {
  return (
    `[out:json][timeout:10];` +
    `(` +
    `node["highway"="bus_stop"](around:${RADIUS_M},${lat},${lng});` +
    `node["public_transport"="platform"](around:${RADIUS_M},${lat},${lng});` +
    `node["amenity"="bus_station"](around:${RADIUS_M},${lat},${lng});` +
    `node["railway"="station"](around:${RADIUS_M},${lat},${lng});` +
    `node["station"="subway"](around:${RADIUS_M},${lat},${lng});` +
    `);`
  );
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
}
interface OverpassResponse {
  elements?: OverpassElement[];
}

export const transitConnector: Connector = {
  id: "transit",
  name: "Public transport (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const body = `data=${buildQuery(lat, lng)}`;
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const data: OverpassResponse = await res.json();
      clearTimeout(timer);

      const elements = Array.isArray(data.elements) ? data.elements : [];
      const count = elements.length;
      const weight = Math.max(0, Math.min(1, count / MAX_STOPS));

      // Classify: bus stops vs rail vs major stations.
      let busStops = 0;
      let rail = 0;
      let majorStations = 0;
      for (const el of elements) {
        if (el.tags?.["amenity"] === "bus_station" || el.tags?.["railway"] === "station") {
          majorStations++;
        } else if (el.tags?.["railway"] || el.tags?.["station"] === "subway") {
          rail++;
        } else {
          busStops++;
        }
      }

      return [{
        id: `transit:${site.id}:transit_count`,
        source: "transit",
        type: "transit_count",
        lat,
        lng,
        label: `${count} transit stops within ${(RADIUS_M / 1000).toFixed(1)}km (${busStops} bus, ${rail} rail, ${majorStations} major stations)`,
        value: count,
        weight,
        fetchedAt: new Date().toISOString(),
        payload: { busStops, rail, majorStations, radiusM: RADIUS_M },
      }];
    } catch {
      clearTimeout(timer);
      return [];
    }
  },
};
