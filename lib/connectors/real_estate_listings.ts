/**
 * Day 7 — Real estate listings connector.
 *
 * Atlas asks multiple data sources for "what listings exist near this point?"
 * to help land developers, property investors, and builders find the right plot.
 *
 * The connector returns a Signal of type "property_listing_density" with
 * a count of listings nearby. The user-facing label is "N development plots
 * within Rm" — Atlas never reveals the upstream listing source.
 *
 * Brand rule: this file is internal code, but any string the user sees in
 * the UI comes from `label`. The label must NOT mention any upstream source
 * (Property24 / Private Property / etc.). Atlas is the brand, the sources
 * are invisible infrastructure.
 *
 * v1: deterministic mock data using FNV-1a + Mulberry32 (same recipe as the
 * city-aware stub) so the demo is stable. Day 8 swaps in real listings via
 * Browse AI or direct publisher APIs.
 */

import type { Connector, ConnectorContext, Signal } from "./types";

const RADIUS_M = 2_000;
const MAX_EXPECTED = 15;

/** FNV-1a 32-bit hash, used to seed the per-site PRNG. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — same recipe as lib/stub/sites.ts. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const realEstateListingsConnector: Connector = {
  id: "real_estate_listings",
  name: "Real estate listings",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return [];
    }

    // Deterministic per-site count. Same site → same answer across requests.
    const seed = fnv1a(`${lat.toFixed(4)}:${lng.toFixed(4)}:listings`);
    const rng = mulberry32(seed);
    const count = Math.floor(rng() * MAX_EXPECTED);
    const weight = Math.max(0, Math.min(1, count / MAX_EXPECTED));

    const signal: Signal = {
      id: `real_estate_listings:${site.id}:listing_density`,
      source: "real_estate_listings",
      type: "property_listing_density",
      lat,
      lng,
      label: `${count} development plots within ${(RADIUS_M / 1000).toFixed(1)}km`,
      value: count,
      weight,
      fetchedAt: new Date().toISOString(),
    };
    return [signal];
  },
};
