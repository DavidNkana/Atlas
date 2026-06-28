/**
 * Day 16 v3 — Overpass amenity density connector (refactored).
 *
 * Now uses the shared overpassBatch() client which gives us:
 * - Mirror fallback (overpass-api.de → kumi.systems → openstreetmap.fr)
 * - 5-min in-memory cache keyed by lat/lng
 * - 15s timeout (was 8s — too tight under load)
 * - out count; so we only get counts, not full bodies
 *
 * For now this connector still fires ONE call to overpassBatch for
 * its own query. Day 17 will consolidate the 7 Overpass connectors
 * into a single per-site request — but this is already enough to
 * get past the rate-limit problem (mirrors + cache + longer timeout).
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { overpassBatch } from "./overpass-client";

const MAX_EXPECTED: Record<string, number> = {
  gas_station: 20,
  restaurant: 30,
  warehouse: 10,
  retail_shop: 25,
  residential_land: 30,
  commercial_land: 25,
  industrial_land: 10,
  agricultural_land: 5,
  mixed_use_land: 30,
  civic_land: 10,
};

const RADIUS_M: Record<string, number> = {
  gas_station: 1500,
  restaurant: 1000,
  warehouse: 3000,
  retail_shop: 1500,
  residential_land: 1500,
  commercial_land: 1000,
  industrial_land: 3000,
  agricultural_land: 5000,
  mixed_use_land: 2000,
  civic_land: 2000,
};

export const overpassConnector: Connector = {
  id: "overpass",
  name: "OpenStreetMap Overpass",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site, vertical } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const radius = RADIUS_M[vertical as string] ?? 1500;
    const counts = await overpassBatch(lat, lng, [
      {
        key: "overpass_amenities",
        ql: `node["amenity"~"restaurant|cafe|bar|fast_food|school|hospital|clinic|park|place_of_worship|supermarket|bank|pharmacy|fuel|warehouse|industrial"](around:${radius},${lat},${lng});`,
      },
      {
        key: "overpass_retail",
        ql: `node["shop"~"supermarket|convenience|mall|department_store|bakery|butcher"](around:${radius},${lat},${lng});`,
      },
      {
        key: "overpass_fuel",
        ql: `node["amenity"="fuel"](around:${radius},${lat},${lng});`,
      },
      {
        key: "overpass_transport",
        ql: `node["highway"~"bus_stop|traffic_signals|motorway_junction"](around:${radius},${lat},${lng});`,
      },
    ]);

    const amenities = counts.overpass_amenities ?? 0;
    const retail = counts.overpass_retail ?? 0;
    const fuel = counts.overpass_fuel ?? 0;
    const transport = counts.overpass_transport ?? 0;

    const max = MAX_EXPECTED[vertical as string] ?? 20;
    const fetchedAt = new Date().toISOString();

    const signals: Signal[] = [{
      id: `overpass:${site.id}:amenity_density`,
      source: "overpass",
      type: "amenity_density",
      lat, lng,
      label: `${amenities} amenities within ${(radius/1000).toFixed(1)}km`,
      value: amenities,
      weight: Math.max(0, Math.min(1, amenities / max)),
      fetchedAt,
    }];

    if (fuel > 0) {
      signals.push({
        id: `overpass:${site.id}:fuel_stations`,
        source: "overpass",
        type: "fuel_stations_nearby",
        lat, lng,
        label: `${fuel} fuel stations within ${(radius/1000).toFixed(1)}km`,
        value: fuel,
        weight: Math.min(1, fuel / 5),
        fetchedAt,
      });
    }

    signals.push({
      id: `overpass:${site.id}:retail_density`,
      source: "overpass",
      type: "retail_density",
      lat, lng,
      label: `${retail} retail outlets within ${(radius/1000).toFixed(1)}km`,
      value: retail,
      weight: Math.max(0, Math.min(1, retail / 15)),
      fetchedAt,
    });

    if (transport > 0) {
      signals.push({
        id: `overpass:${site.id}:transport_nodes`,
        source: "overpass",
        type: "transport_access",
        lat, lng,
        label: `${transport} bus stops/junctions within ${(radius/1000).toFixed(1)}km`,
        value: transport,
        weight: Math.min(1, transport / 10),
        fetchedAt,
      });
    }

    return signals;
  },
};
