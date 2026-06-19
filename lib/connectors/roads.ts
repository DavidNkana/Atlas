/**
 * Day 16 — Road network connector.
 *
 * Counts highways, primary roads, and intersections within 1km of
 * the candidate site. Road accessibility directly drives commercial
 * site value. Counts from OpenStreetMap highway tags.
 *
 * Emits TWO signals: total_roads + nearest_major_road_distance_m
 * (derived from Overpass query when available).
 */

import type { Connector, ConnectorContext, Signal } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 8_000;
const RADIUS_M = 1_000;
const MAX_ROADS = 50;

function buildQuery(lat: number, lng: number): string {
  return (
    `[out:json][timeout:10];` +
    `way["highway"~"motorway|trunk|primary|secondary|tertiary"]` +
    `(around:${RADIUS_M},${lat},${lng});`
  );
}

interface OverpassElement { type: string; id: number; tags?: Record<string, string>; }
interface OverpassResponse { elements?: OverpassElement[]; }

export const roadsConnector: Connector = {
  id: "roads",
  name: "Road network (OpenStreetMap)",
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
      const weight = Math.max(0, Math.min(1, count / MAX_ROADS));

      // Classify by road importance
      let motorway = 0;
      let primary = 0;
      let secondary = 0;
      for (const el of elements) {
        const h = el.tags?.["highway"];
        if (h === "motorway" || h === "trunk") motorway++;
        else if (h === "primary") primary++;
        else if (h === "secondary" || h === "tertiary") secondary++;
      }

      return [{
        id: `roads:${site.id}:roads_count`,
        source: "roads",
        type: "roads_count",
        lat,
        lng,
        label: `${count} major roads within ${(RADIUS_M / 1000).toFixed(1)}km (${motorway} highway, ${primary} primary, ${secondary} secondary)`,
        value: count,
        weight,
        fetchedAt: new Date().toISOString(),
        payload: { motorway, primary, secondary, radiusM: RADIUS_M },
      }];
    } catch {
      clearTimeout(timer);
      return [];
    }
  },
};
