/**
 * Day 5 — Planner.
 *
 * buildPlan(vertical, location, sites) returns a Plan that the API route
 * iterates with Promise.allSettled, then collects signals per site.
 *
 * v1: for every site the planner emits exactly one step — `overpass`. The
 * planner is intentionally NOT smart yet. Its job today is to be a thin
 * translation layer so tomorrow's smarter planner can be slotted in without
 * touching the API route.
 */

import type { Vertical } from "@/lib/models/types";
import type { Plan, PlanStep } from "./types";

export type PlannerSite = {
  id?: string;
  rank?: number;
  name?: string;
  lat?: number;
  lng?: number;
};

/** Resolve a stable string id for a planner site. Falls back to the index. */
function siteKey(site: PlannerSite, idx: number): string {
  if (site.id) return site.id;
  if (typeof site.rank === "number") return String(site.rank);
  return String(idx);
}

/**
 * Build the plan. `location` is the user's query region (lat/lng + label).
 * `sites` is the AI's ranked_sites — we plan ONE step per site.
 *
 * If a site is missing lat/lng we still emit a step but mark it with
 * `__skip: true` in input — the API route filters those out before calling
 * connectors. We do this so the UI can show "plan issued N steps" matching
 * the number of ranked sites.
 */
export function buildPlan(
  vertical: Vertical,
  location: { lat: number; lng: number; label?: string },
  sites: PlannerSite[],
): Plan {
  const steps: PlanStep[] = [];

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const id = siteKey(site, i);
    const hasCoords =
      typeof site.lat === "number" &&
      typeof site.lng === "number" &&
      !Number.isNaN(site.lat) &&
      !Number.isNaN(site.lng);

    if (!hasCoords) {
      // Still emit one step per connector so the UI's plan counter matches.
      steps.push({
        connectorId: "overpass",
        input: { siteId: id, __skip: true },
        reason: `fetch POI density for site ${id} (skipped: missing coords)`,
      });
      steps.push({
        connectorId: "real_estate_listings",
        input: { siteId: id, __skip: true },
        reason: `fetch listing density for site ${id} (skipped: missing coords)`,
      });
      continue;
    }

    steps.push({
      connectorId: "overpass",
      input: { siteId: id },
      reason: `fetch POI density for site ${id} (${site.name ?? "unnamed"})`,
    });
    steps.push({
      connectorId: "real_estate_listings",
      input: { siteId: id },
      reason: `fetch listing density for site ${id} (${site.name ?? "unnamed"})`,
    });
  }

  return {
    vertical,
    location,
    steps,
  };
}
