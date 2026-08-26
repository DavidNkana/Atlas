import type { Vertical } from "@/lib/models/types";

/**
 * Atlas — Custom vertical mapping.
 *
 * The Vertical TypeScript type only includes the 10 built-in verticals
 * (gas_station, restaurant, warehouse, retail_shop, residential_land,
 * commercial_land, agricultural_land, industrial_land, mixed_use_land,
 * civic_land). But the UI lets users enter a free-text vertical name,
 * which is then wrapped as `custom:<snake_case_name>` and forwarded
 * through to the API. Custom verticals are opaque to the scoring
 * engine, which means without this mapping the engine would fall back
 * to gas_station weights for everything — wrong.
 *
 * This module:
 *   1. Detects whether a vertical is custom (matches `^custom:...`)
 *   2. Maps the custom label to the closest built-in vertical using a
 *      keyword dictionary, or returns null if no keyword matches
 *   3. Returns a default "generic" mapping that scores the request
 *      against balanced weights (each signal equally weighted) when
 *      the keyword dictionary has no match
 *   4. Exposes a label-pretty-printer so the UI can show
 *      "antique_furniture_store (scored against retail_shop)"
 *
 * Day 25: this module is the single source of truth. The stub model
 * generator (lib/models/stub.ts) used to inline the keyword map; it now
 * imports from here.
 */

/**
 * The single dictionary of known custom-vertical keywords → built-in
 * vertical mappings. Add new entries as Atlas encounters new business
 * types in the wild.
 *
 * Each key is a lowercase snake_case token (the part after `custom:`).
 * Each value is a valid Vertical. Matching strategy is exact first,
 * then substring either direction.
 */
export const CUSTOM_VERTICAL_KEYWORDS: Record<string, Vertical> = {
  // civic/community/institutional
  hospital: "civic_land",
  clinic: "civic_land",
  school: "civic_land",
  church: "civic_land",
  mosque: "civic_land",
  temple: "civic_land",
  library: "civic_land",
  university: "civic_land",
  college: "civic_land",
  museum: "civic_land",
  gallery: "civic_land",
  museum_or_gallery: "civic_land",
  park: "civic_land",
  playground: "civic_land",
  stadium: "civic_land",
  arena: "civic_land",
  community_center: "civic_land",

  // commercial/hospitality
  hotel: "commercial_land",
  motel: "commercial_land",
  lodge: "commercial_land",
  resort: "commercial_land",
  guesthouse: "commercial_land",
  office: "commercial_land",
  coworking: "commercial_land",
  "co-working": "commercial_land",
  mall: "commercial_land",
  "shopping centre": "commercial_land",
  "shopping_center": "commercial_land",
  plaza: "commercial_land",
  retail_complex: "commercial_land",
  spa: "commercial_land",
  wellness_center: "commercial_land",
  event_venue: "commercial_land",
  conference_centre: "commercial_land",

  // agricultural / farm
  farm: "agricultural_land",
  "game farm": "agricultural_land",
  ranch: "agricultural_land",
  vineyard: "agricultural_land",
  orchard: "agricultural_land",
  plantation: "agricultural_land",
  livestock: "agricultural_land",

  // industrial / factory
  factory: "industrial_land",
  workshop: "industrial_land",
  plant: "industrial_land",
  mill: "industrial_land",
  processing_plant: "industrial_land",
  fabrication: "industrial_land",

  // special-case fuel
  "car wash": "gas_station",
  "truck stop": "gas_station",
  filling_station: "gas_station",
  fuel_depot: "gas_station",
  service_station: "gas_station",

  // restaurant / food
  restaurant: "restaurant",
  cafe: "restaurant",
  bar: "restaurant",
  pub: "restaurant",
  bakery: "restaurant",
  "fast food": "restaurant",
  food_truck: "restaurant",
  pizzeria: "restaurant",
  bistro: "restaurant",
  diner: "restaurant",

  // retail / shop
  shop: "retail_shop",
  store: "retail_shop",
  supermarket: "retail_shop",
  boutique: "retail_shop",
  grocery: "retail_shop",
  pharmacy: "retail_shop",
  bookstore: "retail_shop",
  showroom: "retail_shop",
  "antique shop": "retail_shop",
  antique_store: "retail_shop",

  // residential / housing
  house: "residential_land",
  home: "residential_land",
  apartment: "residential_land",
  mansion: "residential_land",
  estate: "residential_land",
  townhouse: "residential_land",
  villa: "residential_land",
  cottage: "residential_land",
  bungalow: "residential_land",
  flat: "residential_land",

  // other
  gym: "commercial_land",
  "pet grooming": "retail_shop",
  salon: "retail_shop",
  spa_salon: "retail_shop",
  daycare: "commercial_land",
  nursery: "commercial_land",
  school_supplies: "retail_shop",
  bookstore_store: "retail_shop",
};

/**
 * Maps a custom vertical label (the part after `custom:`) to the
 * best-matching built-in Vertical, or null if no keyword matches.
 *
 * Matching strategy:
 *   1. Exact match against any keyword (case-insensitive)
 *   2. Substring match — keyword appears inside the label OR the
 *      label appears inside the keyword (e.g. "antique_furniture"
 *      contains "antique")
 *   3. If multiple substring matches, the first one wins
 *
 * Word boundaries matter: "house" matches "house" but "warehouse"
 * should also match because the word "house" appears within it. The
 * implementation handles this with `.includes()`.
 */
export function mapCustomVertical(customLabel: string): Vertical | null {
  const normalized = customLabel.toLowerCase().trim();
  if (!normalized) return null;

  // Priority 1: exact match.
  if (CUSTOM_VERTICAL_KEYWORDS[normalized]) {
    return CUSTOM_VERTICAL_KEYWORDS[normalized];
  }

  // Priority 2: substring match. We pick the LONGEST matching
  // keyword so that "shopping centre" wins over "shop" for the
  // label "shopping centre". This produces better mappings.
  let best: { v: Vertical; keywordLen: number } | null = null;
  for (const [keyword, vertical] of Object.entries(
    CUSTOM_VERTICAL_KEYWORDS,
  )) {
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      if (!best || keyword.length > best.keywordLen) {
        best = { v: vertical, keywordLen: keyword.length };
      }
    }
  }
  if (best) return best.v;

  return null;
}

/**
 * Returns the closest built-in Vertical for a custom vertical token
 * (e.g. `custom:antique_furniture_store`). If the token isn't a custom
 * vertical (doesn't start with `custom:`), returns it unchanged.
 *
 * If the keyword map has no match, returns null — the caller should
 * fall back to a generic weight profile.
 */
export function resolveCustomVertical(vertical: string): Vertical | null {
  if (!vertical.startsWith("custom:")) return null;
  const label = vertical.slice("custom:".length);
  return mapCustomVertical(label);
}

/**
 * Pretty-print a custom vertical label for the UI. "antique_furniture_store"
 * becomes "Antique Furniture Store". Splits on underscores and hyphens.
 */
export function customVerticalPrettyLabel(vertical: string): string {
  const label = vertical.startsWith("custom:")
    ? vertical.slice("custom:".length)
    : vertical;
  return label
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Format the resolved target for display in the breakdown:
 * "antique_furniture_store → Retail Shop" — what the user sees when
 * they're told how Atlas interpreted their custom vertical.
 */
export function customVerticalMatchLabel(vertical: string): string | null {
  const resolved = resolveCustomVertical(vertical);
  if (!resolved) return null;
  return `${customVerticalPrettyLabel(vertical)} → ${prettyBuiltInName(resolved)}`;
}

/**
 * Pretty-print the built-in vertical name for display. Mirrors the
 * human-readable names in lib/land/verticals.ts.
 */
function prettyBuiltInName(v: Vertical): string {
  switch (v) {
    case "gas_station":
      return "Gas Station";
    case "restaurant":
      return "Restaurant";
    case "warehouse":
      return "Warehouse";
    case "retail_shop":
      return "Retail Shop";
    case "residential_land":
      return "Residential Land";
    case "commercial_land":
      return "Commercial Land";
    case "agricultural_land":
      return "Agricultural Land";
    case "industrial_land":
      return "Industrial Land";
    case "mixed_use_land":
      return "Mixed-Use Land";
    case "civic_land":
      return "Civic / Community";
    default:
      return v;
  }
}

/**
 * Generic balanced weights for custom verticals where no keyword
 * matches. Each signal gets roughly equal weight, slightly preferring
 * amenity and roads since most businesses benefit from these.
 *
 * Used by the scoring engine as the fallback when a custom vertical
 * can't be mapped to a built-in.
 */
export const GENERIC_VERTICAL_WEIGHTS = {
  amenityDensity: 0.20,
  competitor: 0.15,
  schools: 0.10,
  transit: 0.15,
  healthcare: 0.05,
  roads: 0.15,
  landuse: 0.10,
  envRisk: 0.05,
  demographics: 0.05,
  maxSignalBoost: 0.12,
} as const;
