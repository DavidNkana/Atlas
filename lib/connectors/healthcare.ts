/**
 * Day 16 — Healthcare connector.
 *
 * Counts hospitals, clinics, doctors, and pharmacies within 3km of
 * the candidate site. Healthcare access is a major residential
 * desirability signal and a civic-infrastructure quality signal.
 *
 * Uses OpenStreetMap Overpass with amenity=hospital|clinic|doctors|pharmacy.
 */

import type { Connector, ConnectorContext, Signal } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FETCH_TIMEOUT_MS = 8_000;
const RADIUS_M = 3_000;
const MAX_HEALTH = 25;

function buildQuery(lat: number, lng: number): string {
  return (
    `[out:json][timeout:10];` +
    `node["amenity"~"hospital|clinic|doctors|pharmacy|dentist"]` +
    `(around:${RADIUS_M},${lat},${lng});`
  );
}

interface OverpassElement { type: string; id: number; tags?: Record<string, string>; }
interface OverpassResponse { elements?: OverpassElement[]; }

export const healthcareConnector: Connector = {
  id: "healthcare",
  name: "Healthcare (OpenStreetMap)",
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
      const weight = Math.max(0, Math.min(1, count / MAX_HEALTH));

      let hospitals = 0;
      let clinics = 0;
      let pharmacies = 0;
      for (const el of elements) {
        const t = el.tags?.["amenity"];
        if (t === "hospital") hospitals++;
        else if (t === "clinic" || t === "doctors" || t === "dentist") clinics++;
        else if (t === "pharmacy") pharmacies++;
      }

      return [{
        id: `healthcare:${site.id}:healthcare_count`,
        source: "healthcare",
        type: "healthcare_count",
        lat,
        lng,
        label: `${count} healthcare facilities within ${(RADIUS_M / 1000).toFixed(1)}km (${hospitals} hospitals, ${clinics} clinics, ${pharmacies} pharmacies)`,
        value: count,
        weight,
        fetchedAt: new Date().toISOString(),
        payload: { hospitals, clinics, pharmacies, radiusM: RADIUS_M },
      }];
    } catch {
      clearTimeout(timer);
      return [];
    }
  },
};
