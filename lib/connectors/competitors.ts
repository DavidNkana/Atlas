/**
 * Day 16 — Competitor density connector.
 *
 * Counts direct competitors within 1.5km of the candidate site.
 * "Competitors" means businesses matching the same vertical as the
 * user's query (e.g. for a restaurant query, count existing
 * restaurants). For vertical-agnostic queries we use a generic
 * business count as a competitive-density proxy.
 *
 * Why this matters for the trust story: a R50M site recommendation
 * SHOULD penalise sites that already have 20 competitors within
 * walking distance. Per-vertical max-expected maps come from
 * eyeballing density in Cape Town / Sandton / Lusaka CBDs.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import type { Vertical } from "@/lib/models/types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 8_000;

interface CompetitorProfile {
  query: string;
  radius: number;
  maxExpected: number;
}

const COMPETITOR_PROFILES: Record<string, CompetitorProfile> = {
  gas_station:       { query: 'node["amenity"="fuel"]',                 radius: 3000, maxExpected: 8 },
  restaurant:        { query: 'node["amenity"~"restaurant|cafe|fast_food"]', radius: 1500, maxExpected: 40 },
  warehouse:         { query: 'node["amenity"~"warehouse|industrial"]', radius: 5000, maxExpected: 5 },
  retail_shop:       { query: 'node["shop"~"mall|supermarket|convenience"]', radius: 1500, maxExpected: 15 },
  residential_land:  { query: 'node["building"~"residential|apartments|house"]', radius: 500, maxExpected: 200 },
  commercial_land:   { query: 'node["office"~"yes|company"]',           radius: 500, maxExpected: 30 },
  industrial_land:   { query: 'node["landuse"="industrial"]',           radius: 2000, maxExpected: 10 },
  agricultural_land: { query: 'node["landuse"~"farmland|farmyard|orchard|vineyard"]', radius: 5000, maxExpected: 5 },
  mixed_use_land:    { query: 'node["amenity"~"restaurant|cafe|shop|bank"]', radius: 1000, maxExpected: 25 },
  civic_land:        { query: 'node["amenity"~"school|hospital|library|townhall"]', radius: 2000, maxExpected: 8 },
};

const DEFAULT_PROFILE: CompetitorProfile = {
  query: 'node["amenity"~"restaurant|cafe|shop|office"]',
  radius: 1500,
  maxExpected: 25,
};

interface OverpassElement { type: string; id: number; }
interface OverpassResponse { elements?: OverpassElement[]; }

export const competitorDensityConnector: Connector = {
  id: "competitors",
  name: "Competitor density (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site, vertical } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const profile = COMPETITOR_PROFILES[vertical as string] ?? DEFAULT_PROFILE;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const query = `[out:json][timeout:10];${profile.query}(around:${profile.radius},${lat},${lng});`;
      const body = `data=${query}`;
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

      // For competitors, MORE is WORSE (saturation). Invert weight:
      // 0 competitors → weight 1 (great), maxExpected → weight 0 (saturated).
      const saturation = Math.min(1, count / profile.maxExpected);
      const weight = Math.max(0, Math.min(1, 1 - saturation));

      return [{
        id: `competitors:${site.id}:competitor_count`,
        source: "competitors",
        type: "competitor_count",
        lat,
        lng,
        label: `${count} similar ${vertical} competitors within ${(profile.radius / 1000).toFixed(1)}km (saturation ${(saturation * 100).toFixed(0)}%)`,
        value: count,
        weight,
        fetchedAt: new Date().toISOString(),
        payload: { vertical, count, saturation: Number(saturation.toFixed(3)), radiusM: profile.radius, maxExpected: profile.maxExpected },
      }];
    } catch {
      clearTimeout(timer);
      return [];
    }
  },
};
