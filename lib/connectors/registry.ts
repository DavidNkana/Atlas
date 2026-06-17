/**
 * Day 5 — Connector registry.
 *
 * Atlas knows about N connectors. Today there is one (Overpass). To add
 * another: create lib/connectors/<name>.ts, then append it to ALL_CONNECTORS.
 * The registry stays the only file the planner and API route need to touch.
 */

import type { Connector } from "./types";
import { overpassConnector } from "./overpass";
import { realEstateListingsConnector } from "./real_estate_listings";

/**
 * The full list of connectors Atlas will consider running. Order matters:
 * the planner iterates this list. Today every plan runs every connector;
 * the planner is the place that will later learn to skip or fan-out.
 */
export const ALL_CONNECTORS: Connector[] = [
  overpassConnector,
  realEstateListingsConnector,
];

/** O(1) lookup by connector id. Throws if unknown so callers fail loudly. */
export function getConnector(id: string): Connector {
  const found = ALL_CONNECTORS.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Unknown connector id: ${id}. Registered: ${ALL_CONNECTORS.map((c) => c.id).join(", ")}`);
  }
  return found;
}

/**
 * Connectors that support the given vertical. Today every connector handles
 * every vertical via its internal branch — but the registry contract already
 * supports vertical-scoped connectors (e.g. a Google Places connector that
 * only does restaurant).
 */
export function getConnectorsForVertical(vertical: Connector["vertical"]): Connector[] {
  if (vertical === "all") return ALL_CONNECTORS;
  return ALL_CONNECTORS.filter((c) => c.vertical === "all" || c.vertical === vertical);
}
