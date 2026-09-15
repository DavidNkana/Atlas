/** Shared, server-safe vertical vocabulary used by validation and routing. */
export const VERTICALS = [
  "gas_station",
  "restaurant",
  "warehouse",
  "retail_shop",
  "residential_land",
  "commercial_land",
  "agricultural_land",
  "industrial_land",
  "mixed_use_land",
  "civic_land",
] as const;

export type SupportedVertical = (typeof VERTICALS)[number];
export type AtlasVertical = SupportedVertical | `custom:${string}`;

export const VERTICAL_LABELS: Record<SupportedVertical, string> = {
  gas_station: "Gas station",
  restaurant: "Restaurant",
  warehouse: "Warehouse",
  retail_shop: "Retail shop",
  residential_land: "Residential land",
  commercial_land: "Commercial land",
  agricultural_land: "Agricultural land",
  industrial_land: "Industrial land",
  mixed_use_land: "Mixed-use land",
  civic_land: "Civic / institutional",
};

/** Ordered longest-first so phrases win over single-word aliases. */
export const VERTICAL_ALIASES: Record<SupportedVertical, readonly string[]> = {
  gas_station: ["gas station", "petrol station", "fuel station", "filling station", "service station", "forecourt", "truck stop", "ev station", "charging station", "petrol", "fuel", "diesel"],
  restaurant: ["food court", "fast food", "coffee shop", "bed and breakfast", "guest house", "guesthouse", "restaurant", "cafe", "eatery", "diner", "bistro", "bakery", "deli", "pizzeria", "steakhouse", "tavern", "pub", "bar", "lodge", "hotel", "motel", "resort"],
  warehouse: ["bonded warehouse", "industrial space", "distribution centre", "distribution center", "warehouse", "logistics", "storage", "fulfilment", "fulfillment", "depot", "storehouse", "godown", "shed"],
  retail_shop: ["shopping centre", "shopping center", "clothing store", "fashion store", "electronics store", "furniture store", "supermarket", "grocery", "retail", "shop", "store", "boutique", "showroom", "outlet", "mall"],
  residential_land: ["residential development", "housing development", "residential plot", "residential land", "townhouse", "apartment", "housing", "home", "house", "estate", "villa", "duplex"],
  commercial_land: ["business park", "office block", "office park", "commercial plot", "commercial land", "shopping centre", "shopping center", "office", "commercial", "coworking", "co-working"],
  agricultural_land: ["agricultural land", "agricultural plot", "smallholder", "game farm", "dairy farm", "fish farm", "farm", "farming", "livestock", "orchard", "vineyard", "plantation"],
  industrial_land: ["industrial park", "industrial estate", "industrial plot", "industrial land", "manufacturing plant", "processing plant", "factory", "manufacturing", "industrial", "brewery", "workshop", "foundry"],
  mixed_use_land: ["mixed-use", "mixed use", "mixed development", "live-work", "live work", "multi-use", "town centre", "town center", "transit-oriented"],
  civic_land: ["community centre", "community center", "sports complex", "place of worship", "police station", "fire station", "school", "hospital", "clinic", "church", "mosque", "university", "college", "library", "museum", "park", "stadium", "civic", "institutional"],
};

export const CUSTOM_VERTICAL_RE = /^custom:[a-z][a-z0-9_]{1,39}$/;

export function isSupportedVertical(value: string): value is SupportedVertical {
  return (VERTICALS as readonly string[]).includes(value);
}

export function isAtlasVertical(value: string): value is AtlasVertical {
  return isSupportedVertical(value) || CUSTOM_VERTICAL_RE.test(value);
}

export function verticalLabel(value: string): string {
  if (isSupportedVertical(value)) return VERTICAL_LABELS[value];
  return value.replace(/^custom:/, "").split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
