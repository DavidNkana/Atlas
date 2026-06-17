/**
 * Day 5 — Planner types.
 *
 * A Plan is the recipe of connector calls Atlas will execute for a single
 * user question. It is built AFTER the AI returns ranked_sites and BEFORE
 * we start calling connectors. Today the plan is trivial (one step per
 * site — run overpass). Day 60+ the planner can:
 *   - skip connectors when the AI's confidence is already > 0.95
 *   - fan-out: call multiple connectors in parallel for the SAME site
 *   - cascade: call a cheap connector first, then a paid one only if needed
 */

import type { Vertical } from "@/lib/models/types";

/**
 * One connector call the API route should make.
 *
 * `input` is opaque to the planner — connectors know how to read it. v1 it
 * is always `{ siteId }` so the connector fetches one site. Later it may
 * be `{ bbox }` (one big call for many sites) or `{ siteIds: [...] }`.
 */
export interface PlanStep {
  connectorId: string;
  input: Record<string, unknown>;
  /** Short human sentence the UI can show ("fetch POI density for site 3"). */
  reason: string;
}

/**
 * The plan Atlas will run for one question. `steps[]` is what the API
 * route iterates with Promise.allSettled.
 */
export interface Plan {
  vertical: Vertical;
  location: { lat: number; lng: number; label?: string };
  steps: PlanStep[];
}
