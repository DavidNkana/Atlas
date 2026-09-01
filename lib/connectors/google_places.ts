/**
 * MVP rebuild Sep 2026 — Google Places connector, expanded.
 *
 * Three things changed from the previous version:
 *   1. Multiple radii: 500m, 1500m, 3km. Each fires one Nearby Search.
 *      For a restaurant site that means we actually see competitors and
 *      amenities at walking, cycling and short-driving distances —
 *      not just the 500m bubble.
 *   2. Returns NAMED top-5 places per radius (name + distance). The UI
 *      can render "Trumps Grillhouse (24m), The Bigmouth Sushi (31m), …"
 *      instead of the prior opaque "20 amenities within 500m".
 *   3. Categorised counts (food, retail, services, health, education).
 *      Used by the scoring engine for per-vertical weighting.
 *
 * Google Places API pricing (Sep 2026): Nearby Search (New) = $32 per
 * 1,000 calls. With 3 radii × 5 sites = 15 calls per query, that's
 * roughly $0.48/query. At demo loads (sub-100/day) this stays inside
 * the $300 trial credit comfortably.
 *
 * Graceful degrade: missing key, quota exceeded, or HTTP error → empty
 * signals, same as before. The Decision Block shows "signals missing"
 * not a hard error.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { withTimeout } from "@/lib/util/timeout";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Category groups for restaurants/land-development sites. Kept narrow
 * because each includedType counts against the 50-type API limit per
 * Nearby Search request.
 */
const FOOD_RETAIL_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "fast_food_restaurant",
  "bakery",
  "meal_delivery",
  "meal_takeaway",
  "shopping_mall",
  "supermarket",
  "convenience_store",
  "clothing_store",
  "department_store",
];

const SERVICES_TYPES = [
  "bank",
  "atm",
  "pharmacy",
  "gas_station",
  "car_dealer",
  "car_rental",
  "real_estate_agency",
];

/** Vertical-aware category map. Default = food + retail + services. */
const VERTICAL_TYPES: Record<string, string[]> = {
  restaurant: [
    ...FOOD_RETAIL_TYPES,
    "lodging",          // hotel guests = footfall for restaurants
    "tourist_attraction",
  ],
  retail_shop: [...FOOD_RETAIL_TYPES, ...SERVICES_TYPES],
  gas_station: [
    "gas_station",
    "convenience_store",
    "car_dealer",
    "car_repair",
    "lodging",
    "restaurant",
  ],
  warehouse: ["warehouse", "logistics", "truck_repair"],
  residential_land: [
    "school",
    "primary_school",
    "secondary_school",
    "park",
    "supermarket",
    "transit_station",
  ],
  commercial_land: [...FOOD_RETAIL_TYPES, ...SERVICES_TYPES],
  mixed_use_land: [...FOOD_RETAIL_TYPES, ...SERVICES_TYPES],
};

const RADII_M = [500, 1500, 3000];

interface PlacesResponse {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    types?: string[];
    location?: { latitude: number; longitude: number };
    primaryType?: string;
  }>;
}

/** Haversine in metres. */
function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function fetchNearby(
  lat: number,
  lng: number,
  radius: number,
  types: string[],
  apiKey: string,
  signal: AbortSignal,
): Promise<PlacesResponse> {
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.types,places.location,places.primaryType",
    },
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius,
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
  name: "Live POI density (Google Places)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site, vertical } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return [];

    const types = VERTICAL_TYPES[vertical as string] ?? [
      ...FOOD_RETAIL_TYPES,
      ...SERVICES_TYPES,
    ];
    const fetchedAt = new Date().toISOString();

    // Fire all radii in parallel. Each returns up to 20 places.
    const responses = await Promise.all(
      RADII_M.map((radius) => {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          FETCH_TIMEOUT_MS,
        );
        return withTimeout(
          fetchNearby(lat, lng, radius, types, apiKey, controller.signal),
          FETCH_TIMEOUT_MS,
          `google_places_${radius}`,
        )
          .catch(() => ({ places: [] }))
          .finally(() => clearTimeout(timer));
      }),
    );

    const signals: Signal[] = [];

    // Per-radius count + named top-5 (closest to site)
    for (let i = 0; i < RADII_M.length; i++) {
      const radius = RADII_M[i];
      const data = responses[i];
      const places = (data?.places ?? []).map((p) => {
        const pLat = p.location?.latitude ?? lat;
        const pLng = p.location?.longitude ?? lng;
        const dist = haversineM(lat, lng, pLat, pLng);
        return {
          name: p.displayName?.text ?? "(unnamed)",
          type: p.primaryType ?? p.types?.[0] ?? "place",
          distM: Math.round(dist),
        };
      });
      places.sort((a, b) => a.distM - b.distM);

      const count = places.length;
      // Weight: scale to ~half-saturated at 30 places in 1.5km
      const expectedMax = radius === 500 ? 15 : radius === 1500 ? 30 : 50;
      const weight = Math.max(0, Math.min(1, count / expectedMax));

      signals.push({
        id: `google_places:${site.id}:poi_density_${radius}`,
        source: "google_places",
        type: "amenity_density",
        lat,
        lng,
        label:
          count === 0
            ? `0 places within ${radius}m`
            : `${count} places within ${radius}m · top: ${places
                .slice(0, 3)
                .map((p) => `${p.name} (${p.distM}m)`)
                .join(", ")}`,
        value: count,
        weight,
        fetchedAt,
        payload: {
          radius,
          top5: places.slice(0, 5),
          totalFound: count,
        },
      });
    }

    // Summary signal at 1.5km radius used for scoring
    const mid = responses[1];
    const midPlaces = mid?.places ?? [];
    if (midPlaces.length > 0) {
      const typeCounts: Record<string, number> = {};
      for (const p of midPlaces) {
        for (const t of p.types ?? []) {
          typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        }
      }
      const topTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t, n]) => `${t.replace(/_/g, " ")} (${n})`);
      signals.push({
        id: `google_places:${site.id}:amenity_mix`,
        source: "google_places",
        type: "amenity_mix",
        lat,
        lng,
        label: `Top types within 1.5km: ${topTypes.join(", ")}`,
        value: topTypes.length,
        weight: Math.min(1, topTypes.length / 5),
        fetchedAt,
        payload: { topTypes },
      });
    }

    return signals;
  },
};
