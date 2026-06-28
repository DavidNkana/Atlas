/**
 * Day 8 — Google Places API connector.
 *
 * Atlas asks Google Places "Nearby Search" for points of interest around each
 * candidate site: restaurants, schools, hospitals, transit. Returns a
 * single Signal of type "poi_density" with the count of nearby places.
 *
 * The Google Places API is paid but has a generous $200/month free credit
 * (≈28,000 Nearby Search requests). For Atlas demo volumes this is more
 * than enough. When the credit runs out, set GOOGLE_PLACES_API_KEY in
 * Vercel env vars to a billing-enabled key.
 *
 * If the env var is missing OR Google returns an error, this connector
 * returns an empty Signal[]. The API route reports the failure via
 * connectorsRun[].status = "error" so the UI can show the user the
 * signals are missing.
 *
 * Brand rule: the user never sees "Google Places" in copy. The label
 * Atlas shows is "N amenities within 500m" — Atlas is the brand, the data
 * sources are invisible.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { withTimeout } from "@/lib/util/timeout";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
const RADIUS_M = 500;
const FETCH_TIMEOUT_MS = 6_000;

/** Google place types we treat as "amenities" for the demo. */
const INCLUDED_TYPES = [
  "restaurant",
  "school",
  "hospital",
  "subway_station",
  "bus_station",
  "train_station",
  "transit_station",
  "supermarket",
  "shopping_mall",
  "bank",
  "pharmacy",
  "gas_station",
];

interface PlacesResponse {
  places?: Array<{ id: string; types?: string[] }>;
}

async function fetchNearby(
  lat: number,
  lng: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<PlacesResponse> {
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.types",
    },
    body: JSON.stringify({
      includedTypes: INCLUDED_TYPES,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: RADIUS_M,
        },
      },
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Google Places HTTP ${res.status}`);
  }
  return (await res.json()) as PlacesResponse;
}

export const googlePlacesConnector: Connector = {
  id: "google_places",
  name: "Live POI density",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      // Graceful degrade — no env var → empty signals → UI shows "signals
      // missing" banner. Same pattern as Overpass when the public server
      // is down.
      return [];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const data = await withTimeout(
        fetchNearby(lat, lng, apiKey, controller.signal),
        FETCH_TIMEOUT_MS,
        "google_places",
      );
      clearTimeout(timer);

      const places = Array.isArray(data.places) ? data.places : [];
      const count = places.length;
      const weight = Math.max(0, Math.min(1, count / 15));
      const fetchedAt = new Date().toISOString();

      // Count most common place types for a richer signal
      const typeCounts: Record<string, number> = {};
      for (const p of places) {
        for (const t of (p.types ?? [])) {
          typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        }
      }
      const topTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t, n]) => t.replace(/_/g, " "));

      const signals: Signal[] = [
        {
          id: `google_places:${site.id}:poi_density`,
          source: "google_places",
          type: "poi_density",
          lat, lng,
          label: `${count} amenities within ${RADIUS_M}m`,
          value: count, weight, fetchedAt,
        },
      ];

      if (topTypes.length > 0) {
        signals.push({
          id: `google_places:${site.id}:amenity_types`,
          source: "google_places",
          type: "amenity_mix",
          lat, lng,
          label: `Top types: ${topTypes.join(", ")}`,
          value: topTypes.length,
          weight: Math.min(1, topTypes.length / 5),
          fetchedAt,
          payload: { topTypes },
        });
      }

      return signals;
    } catch {
      clearTimeout(timer);
      return [];
    }
  },
};
