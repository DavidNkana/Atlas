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
import { ALL_CONNECTORS } from "@/lib/connectors/registry";

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
 * Day 16: iterates ALL_CONNECTORS so adding a new connector to the
 * registry automatically makes it part of every plan. Previously this
 * function hardcoded the 4 connector IDs and would silently skip any
 * new ones — which is why property developers only ever saw 1-2
 * signals per site even after more connectors were added.
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
  // Snapshot connector IDs once. Re-deriving per iteration is fine but
  // pulling them out makes the diff against the old hardcoded list obvious.
  const connectorIds = ALL_CONNECTORS.map((c) => c.id);

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
      for (const connectorId of connectorIds) {
        steps.push({
          connectorId,
          input: { siteId: id, __skip: true },
          reason: `fetch ${connectorId} for site ${id} (skipped: missing coords)`,
        });
      }
      continue;
    }

    for (const connectorId of connectorIds) {
      steps.push({
        connectorId,
        input: { siteId: id },
        reason: `fetch ${connectorId} for site ${id} (${site.name ?? "unnamed"})`,
      });
    }
  }

  return {
    vertical,
    location,
    steps,
  };
}
