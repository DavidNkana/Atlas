/**
 * Day 5 — Connector abstractions.
 *
 * Atlas pulls "signals" from external data sources to confirm or override an
 * AI's ranking. A signal is one fact about a candidate site (e.g. "there are
 * 12 fuel stations within 1.5 km of this point"). A connector is the thing
 * that fetches signals for a given site.
 *
 * This file defines the SHAPE only — concrete connectors live in their own
 * files (overpass.ts, etc.) and are registered in registry.ts.
 */

import type { Vertical } from "@/lib/models/types";

/**
 * A single observed fact about a candidate site.
 *
 * `weight` is normalised [0..1] and used by the scoring engine directly.
 * `value` is the raw count (e.g. 12 amenities). `label` is a human-readable
 * sentence the UI can show verbatim ("12 amenities within 1.5km").
 */
export interface Signal {
  /** Stable id: `${connectorId}:${siteId}:${type}` so the UI can dedupe. */
  id: string;
  /** Connector that produced the signal. */
  source: string;
  /** Type of signal — e.g. "amenity_density", "competitor_count". */
  type: string;
  /** Optional — some signals are area-level, not point-level. */
  lat?: number;
  lng?: number;
  /** Human-readable sentence the UI can render verbatim. */
  label: string;
  /** Raw value — e.g. the count of amenities found. */
  value: number;
  /** Normalised [0..1] — used by the scoring engine. */
  weight: number;
  /** ISO timestamp when the signal was fetched. */
  fetchedAt: string;
  /**
   * Optional structured metadata. Day 10: stats_sa connector uses
   * this to surface suburb name + economic zone + growth rate as
   * separate UI badges (instead of re-parsing the label string).
   * Connectors that don't need this field can omit it.
   */
  payload?: Record<string, unknown>;
}

/**
 * Input a connector needs to know what to fetch and for whom.
 * `site` is the candidate site from the AI ranking. `location` is the
 * user's query region (lat/lng + a free-text label).
 */
export interface ConnectorContext {
  vertical: Vertical;
  location: { lat: number; lng: number; label?: string };
  site: { id: string; name: string; lat: number; lng: number };
}

/**
 * A connector pulls signals for a single site.
 *
 * v1: each connector is invoked ONCE PER SITE. Day 60 may invoke a connector
 * ONCE PER QUERY (returning a Signal[] for many sites) to amortise cost —
 * until then, fetch() returns the signals that apply to ctx.site.
 */
export interface Connector {
  id: string;
  name: string;
  vertical: Vertical | "all";
  /** Fetch signals for the candidate site described by ctx. */
  fetch: (ctx: ConnectorContext) => Promise<Signal[]>;
}
