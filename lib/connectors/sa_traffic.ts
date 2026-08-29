/**
 * Task 3 — SA traffic count connector (SANRAL / provincial AADT).
 *
 * Answers the commercial half of "can I build here?": will anyone
 * drive past it. For fuel stations, drive-throughs and roadside retail
 * this is the single most decision-relevant number Atlas can produce,
 * and until now the Decision Block had nothing but a manual-check
 * callout in this slot.
 *
 * Offline by design: the lookup is a curated table of published counts
 * (see lib/data/sa-highway-traffic.ts for full provenance), so this
 * connector never fails, never rate-limits and needs no API key. When
 * a live SANRAL feed is wired the table becomes the fallback and this
 * file keeps its shape.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { findNearestHighway } from "@/lib/data/sa-highway-traffic";

/**
 * 50,000 veh/day pins the weight at 1.0.
 *
 * Rationale: SA fuel-station feasibility rules of thumb put the
 * viability floor around 15,000 veh/day passing the forecourt, and
 * prime highway retail sits in the 40-60k band. Above ~50k the extra
 * traffic stops changing the go/no-go answer (access, zoning and site
 * geometry become the binding constraints instead), so the scale tops
 * out there rather than letting the 290k Ben Schoeman segment swamp
 * every other signal in the score.
 */
const AADT_FOR_MAX_WEIGHT = 50_000;

export const saTrafficConnector: Connector = {
  id: "sa_traffic",
  name: "SA highway traffic counts (SANRAL AADT)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const nearest = findNearestHighway(lat, lng);
    // No counted segment within range — say nothing rather than quote
    // a number from the wrong side of the metro.
    if (!nearest) return [];

    const { traffic, distanceKm } = nearest;
    const { aadt, ref, segment, heavyVehiclePct, year, source } = traffic;

    return [{
      id: `sa_traffic:${site.id}:aadt`,
      source: "sa_traffic",
      type: "traffic_aadt",
      lat: traffic.lat,
      lng: traffic.lng,
      label: `${aadt.toLocaleString()} veh/day on ${ref}${segment ? ` (${segment})` : ""} · ${distanceKm.toFixed(1)}km from site`,
      value: aadt,
      weight: Math.min(1, aadt / AADT_FOR_MAX_WEIGHT),
      fetchedAt: new Date().toISOString(),
      payload: { aadt, ref, segment, distanceKm, heavyVehiclePct, year, source },
    }];
  },
};
