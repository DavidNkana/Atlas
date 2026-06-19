/**
 * Day 16 — Environmental constraints connector.
 *
 * Detects nearby environmental risks that would constrain development:
 * water bodies (flood risk), protected areas (no-build), wetlands,
 * steep terrain, and industrial hazards (waste, power plants).
 *
 * Uses OpenStreetMap tags: natural=water|wetland, boundary=protected_area,
 * power=plant, landuse=industrial with hazardous=*.
 *
 * Why this matters: a site next to a wetland or under a protected
 * area gets a major red flag. SA's environmental authorisation
 * process (NEMA, EIA regulations) can take 12-18 months and reject
 * otherwise-viable sites. Atlas should warn developers BEFORE they
 * commit capital.
 *
 * Emits a single weight in [0..1] where 1 = no nearby constraints
 * (safe to build), 0 = multiple severe constraints nearby.
 */

import type { Connector, ConnectorContext, Signal } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 8_000;
const RADIUS_M = 2_000;

function buildQuery(lat: number, lng: number): string {
  return (
    `[out:json][timeout:10];` +
    `(` +
    `node["natural"~"water|wetland|marsh"](around:${RADIUS_M},${lat},${lng});` +
    `way["natural"~"water|wetland|marsh"](around:${RADIUS_M},${lat},${lng});` +
    `way["boundary"="protected_area"](around:${RADIUS_M},${lat},${lng});` +
    `node["power"="plant"](around:${RADIUS_M},${lat},${lng});` +
    `way["landuse"="industrial"](around:${RADIUS_M},${lat},${lng});` +
    `);`
  );
}

interface OverpassElement { type: string; id: number; tags?: Record<string, string>; }
interface OverpassResponse { elements?: OverpassElement[]; }

export const envConstraintsConnector: Connector = {
  id: "env_constraints",
  name: "Environmental constraints (OpenStreetMap)",
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
      let water = 0;
      let protectedAreas = 0;
      let hazards = 0;
      for (const el of elements) {
        const n = el.tags?.["natural"];
        const b = el.tags?.["boundary"];
        const p = el.tags?.["power"];
        const l = el.tags?.["landuse"];
        if (n === "water" || n === "wetland" || n === "marsh") water++;
        if (b === "protected_area") protectedAreas++;
        if (p === "plant" || (l === "industrial" && el.tags?.["hazardous"])) hazards++;
      }

      // Severity scoring. Protected areas = hard constraint (instant fail).
      // Water bodies = soft constraint (need flood study). Hazards = medium.
      let severity = 0;
      const flags: string[] = [];
      if (water > 0) {
        severity += 0.3;
        flags.push(`${water} water/wetland`);
      }
      if (protectedAreas > 0) {
        severity += 0.8; // hard constraint
        flags.push(`${protectedAreas} protected area`);
      }
      if (hazards > 0) {
        severity += 0.5;
        flags.push(`${hazards} hazard`);
      }
      severity = Math.min(1, severity);
      const weight = Math.max(0, 1 - severity); // 1 = no constraints, 0 = multiple severe

      const label = flags.length === 0
        ? `No environmental constraints within ${(RADIUS_M / 1000).toFixed(1)}km`
        : `Environmental risks within ${(RADIUS_M / 1000).toFixed(1)}km: ${flags.join(", ")}`;

      return [{
        id: `env_constraints:${site.id}:env_risk`,
        source: "env_constraints",
        type: "env_risk",
        lat,
        lng,
        label,
        value: severity,
        weight,
        fetchedAt: new Date().toISOString(),
        payload: { water, protectedAreas, hazards, severity: Number(severity.toFixed(3)), radiusM: RADIUS_M, flags },
      }];
    } catch {
      clearTimeout(timer);
      return [];
    }
  },
};
