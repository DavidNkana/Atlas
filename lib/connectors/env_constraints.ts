/**
 * Day 16 v3 — Environmental constraints connector (refactored to overpassBatch).
 *
 * Detects nearby environmental risks that would constrain development:
 * water bodies (flood risk), protected areas (no-build), wetlands,
 * industrial hazards.
 *
 * Emits a single weight in [0..1] where 1 = no nearby constraints
 * (safe to build), 0 = multiple severe constraints nearby.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";

const RADIUS_M = 2_000;

export const envConstraintsConnector: Connector = {
  id: "env_constraints",
  name: "Environmental constraints (OpenStreetMap)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const counts = await overpassBatch(lat, lng, [
      {
        key: "env_water",
        ql: `(node["natural"~"water|wetland|marsh"](around:${RADIUS_M},${lat},${lng});way["natural"~"water|wetland|marsh"](around:${RADIUS_M},${lat},${lng}););`,
      },
      {
        key: "env_protected",
        ql: `way["boundary"="protected_area"](around:${RADIUS_M},${lat},${lng});`,
      },
      {
        key: "env_hazards",
        ql: `(node["power"="plant"](around:${RADIUS_M},${lat},${lng});way["landuse"="industrial"](around:${RADIUS_M},${lat},${lng}););`,
      },
    ]);

    const water = counts.env_water ?? 0;
    const protectedAreas = counts.env_protected ?? 0;
    const hazards = counts.env_hazards ?? 0;

    let severity = 0;
    const flags: string[] = [];
    if (water > 0) {
      severity += 0.3;
      flags.push(`${water} water/wetland`);
    }
    if (protectedAreas > 0) {
      severity += 0.8;
      flags.push(`${protectedAreas} protected area`);
    }
    if (hazards > 0) {
      severity += 0.5;
      flags.push(`${hazards} hazard`);
    }
    severity = Math.min(1, severity);
    const weight = Math.max(0, 1 - severity);

    const label =
      flags.length === 0
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
      payload: {
        water,
        protectedAreas,
        hazards,
        severity: Number(severity.toFixed(3)),
        radiusM: RADIUS_M,
        flags,
      },
    }];
  },
};
