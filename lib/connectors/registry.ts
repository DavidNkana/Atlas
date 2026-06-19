/**
 * Day 5 — Connector registry.
 *
 * Atlas knows about N connectors. Today there are 10. To add another:
 * create lib/connectors/<name>.ts, then append it to ALL_CONNECTORS.
 * The registry stays the only file the planner and API route need to touch.
 */

import type { Connector } from "./types";
import { overpassConnector } from "./overpass";
import { realEstateListingsConnector } from "./real_estate_listings";
import { statsSAConnector } from "./stats_sa";
import { googlePlacesConnector } from "./google_places";
import { schoolsConnector } from "./schools";
import { transitConnector } from "./transit";
import { healthcareConnector } from "./healthcare";
import { roadsConnector } from "./roads";
import { competitorDensityConnector } from "./competitors";
import { envConstraintsConnector } from "./env_constraints";

/**
 * The full list of connectors Atlas will consider running. Order matters:
 * the planner iterates this list. Today every plan runs every connector;
 * the planner is the place that will later learn to skip or fan-out.
 *
 * Day 16: 6 new connectors (schools, transit, healthcare, roads, competitors,
 * env_constraints) — all use OpenStreetMap Overpass so no API keys needed.
 * Together with the existing 4, every site now pulls 10+ signals by default,
 * addressing the property developer feedback "Signals used: 1 is not enough".
 *
 * Each connector gracefully degrades to [] if its data source is unavailable,
 * so the API route always returns an answer.
 */
export const ALL_CONNECTORS: Connector[] = [
  // POI density (original Day 5)
  overpassConnector,
  // Real estate listings (OpenStreetMap landuse)
  realEstateListingsConnector,
  // SA demographics (Stats SA Census 2022 — static, no API key)
  statsSAConnector,
  // Google Places POI count (uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
  googlePlacesConnector,
  // Day 16 — multi-signal OS upgrade
  schoolsConnector,           // schools within 2km
  transitConnector,           // bus stops + rail within 1km
  healthcareConnector,        // hospitals + clinics within 3km
  roadsConnector,             // major roads within 1km
  competitorDensityConnector, // same-vertical competition (saturation penalty)
  envConstraintsConnector,    // water/wetland/protected/hazards risk
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
