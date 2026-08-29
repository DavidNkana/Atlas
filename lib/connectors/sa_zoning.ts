/**
 * Task 3 — SA metro zoning connector.
 *
 * Answers the legal half of "can I build here?". Snaps the site to one
 * of the three big metro schemes (CoCT, CoJ, eThekwini) and returns the
 * zone covering it, with a plain-English note on what that zone permits.
 *
 * Screening, not certification: the underlying layer is suburb-level,
 * not erf-level (see lib/data/sa-zoning.ts for the full limits), so the
 * Decision Block keeps the "confirm scheme rights with municipal Land
 * Use Management" line next to whatever this returns.
 *
 * Offline: no API key, no network, never fails.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { findMetroFor, findZoning } from "@/lib/data/sa-zoning";

export const saZoningConnector: Connector = {
  id: "sa_zoning",
  name: "SA metro zoning (CoCT / CoJ / eThekwini schemes)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    // Outside the three covered metros there is nothing honest to say.
    const metro = findMetroFor(lat, lng);
    if (!metro) return [];

    const zone = findZoning(metro.metro, lat, lng);
    if (!zone) return [];

    const { name, category, permittedUses } = zone;

    return [{
      id: `sa_zoning:${site.id}:zone`,
      source: "sa_zoning",
      type: "zoning_class",
      lat,
      lng,
      label: `${name} · ${permittedUses ?? "see municipal SDF"}`,
      // Presence indicator: the zone either applies or it doesn't.
      // There is no "more zoned" — so value and weight are binary.
      value: 1,
      weight: 1,
      fetchedAt: new Date().toISOString(),
      payload: { metro: metro.metro, name, category, permittedUses },
    }];
  },
};
