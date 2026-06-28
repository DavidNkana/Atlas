"use client";

/**
 * Atlas — Vertical mismatch warning.
 *
 * Day 9 polish. When the user's question clearly doesn't match the
 * active vertical (e.g. "find a hospital" with vertical =
 * "gas_station"), we show this warning modal. The user can either:
 *   - Switch to a more appropriate vertical
 *   - Use a custom vertical
 *   - Edit their question
 *   - Override and submit anyway
 *
 * Matching is done by a small keyword-per-vertical table. We err on
 * the side of NOT warning (silent pass-through) when the question
 * is short or generic — only fire when the mismatch is clear.
 */

import { useEffect } from "react";

// Day 12 v8: massively expanded vertical keyword table.
//
// The previous table had ~7 words per vertical and missed all the
// natural phrasings users actually type. Examples that failed to
// match before:
//   "looking to build a home in Sandton"   → home was 4 chars, not strong
//   "open a restaurant in Cape Town"       → "open" was generic
//   "set up a warehouse in Lusaka"         → "set up" was generic
//   "put up a clinic in Nairobi"           → "put" was generic
//   "develop a residential plot"           → "develop" was generic
//   "looking for a school site"            → "school" worked, but "site" pulled
//
// The fix has three parts:
//   1. Many more words per vertical, including the actual noun
//      the user types ("home", "shop", "cafe", "mall", "clinic",
//      "church", "school").
//   2. Verb+noun phrases ("build a home", "open a restaurant",
//      "set up a warehouse", "put up a clinic", "construct a
//      school") so the matcher reads "looking to build a home"
//      as a residential_land signal.
//   3. The strong-hit threshold is lowered to 4 chars AND common
//      short nouns ("home", "shop", "mall", "cafe", "kitchen",
//      "bar", "pub", "spa", "gym") are added to a known-short
//      allowlist so they count even though they fail the
//      length>=5 rule.
//
// The phrase match uses an order-sensitive substring search
// (not a regex) so "build a home" matches even with extra
// words in between like "looking to build a nice home".
const VERTICAL_KEYWORDS: Record<string, string[]> = {
  gas_station: [
    // nouns
    "gas station", "gas", "petrol station", "fuel station", "filling station",
    "service station", "forecourt", "fuel pump", "pump",
    // short forms
    "petrol", "diesel", "fuel", "fueling", "refuel",
    "car wash", "truck stop", "charging station", "ev station",
    "electric charging", "electric vehicle",
    // common phrasings
    "build a gas station", "open a gas station", "build a petrol station",
    "build a fuel station", "set up a gas station", "put up a gas station",
    "open a petrol station", "open a fuel station", "open a filling station",
  ],
  restaurant: [
    // nouns
    "restaurant", "restaurants", "food", "cafe", "cafes", "dining", "eatery",
    "kitchen", "menu", "chef", "table", "bistro", "eateries", "diner",
    "dinners", "food court", "fast food", "coffee shop", "bakery", "deli",
    "pizzeria", "steakhouse", "food truck", "tavern", "pub", "bar",
    "lodge", "lodges", "hotel", "hotels", "motel", "guesthouse", "guest house",
    "bed and breakfast", "bnb", "airbnb", "resort", "resorts",
    // common phrasings
    "open a restaurant", "open a cafe", "build a restaurant", "set up a restaurant",
    "start a restaurant", "open a bar", "open a pub", "open a fast food",
    "start a cafe", "open a coffee shop",
    "open a lodge", "build a lodge", "open a hotel", "build a hotel",
  ],
  warehouse: [
    // nouns
    "warehouse", "warehouses", "storage", "logistics", "distribution",
    "fulfilment", "fulfillment", "industrial space", "shed", "sheds",
    "depot", "storehouse", "godown", "bonded warehouse",
    // common phrasings
    "build a warehouse", "set up a warehouse", "put up a warehouse",
    "open a warehouse", "construct a warehouse", "develop a warehouse",
    "need a warehouse", "looking for a warehouse",
  ],
  retail_shop: [
    // nouns
    "retail", "shop", "shops", "store", "stores", "boutique", "showroom",
    "outlet", "mall", "merchandise", "supermarket", "grocery",
    "clothing store", "fashion store", "electronics store", "furniture store",
    // common phrasings
    "open a shop", "open a store", "open a mall", "set up a shop",
    "set up a store", "start a shop", "build a shop", "build a mall",
    "build a retail", "open a retail", "open a boutique", "open a showroom",
    "open a supermarket", "open a grocery",
  ],
  residential_land: [
    // nouns
    "residential", "house", "houses", "housing", "home", "homes", "townhouse",
    "townhouses", "apartment", "apartments", "flat", "flats", "estate",
    "estates", "family", "residence", "residences", "villa", "villas",
    "cottage", "cottages", "bungalow", "bungalows", "duplex",
    "subdivision", "housing development", "residential development",
    "residential plot", "residential plots", "residential land",
    "mansion", "mansions", "manor", "manor house", "luxury home", "luxury estate",
    "penthouse", "condo", "condominium", "townhouse complex",
    // common phrasings
    "build a home", "build a house", "build homes", "build houses",
    "build a villa", "build a bungalow", "build a duplex", "build a mansion",
    "build a residence", "construct a home", "construct a house",
    "develop a home", "develop a house", "develop a residential",
    "looking to build a home", "looking to build a house",
    "where can I build a home", "where can I build a house",
    "set up a home", "put up a home", "start a home", "open a home",
    "build residential", "construct residential", "develop residential",
  ],
  commercial_land: [
    // nouns
    "commercial", "office", "offices", "office space", "business",
    "business park", "shopping centre", "shopping center", "mall",
    "retail space", "office block", "office park", "corporate",
    "co-working", "coworking", "showroom", "anchor store",
    "commercial plot", "commercial plots", "commercial land",
    "hotel", "hotels", "lodge", "lodges", "resort", "resorts",
    "guesthouse", "guest house", "motel", "inn",
    // common phrasings
    "build an office", "build offices", "build a mall", "build a shopping centre",
    "build a business park", "set up an office", "open an office",
    "develop a commercial", "develop commercial", "construct an office",
    "looking to build an office", "looking for office space",
    "open a coworking", "start a coworking",
    "build a hotel", "build a lodge", "open a hotel", "open a lodge",
    "build a resort", "develop a resort",
  ],
  agricultural_land: [
    // nouns
    "farm", "farms", "agricultural", "agriculture", "farming", "crop",
    "crops", "livestock", "cattle", "sheep", "poultry", "pigs",
    "ranch", "ranches", "orchard", "orchards", "pasture", "pastures",
    "maize", "wheat", "soya", "tobacco", "cotton", "coffee", "tea farm",
    "vineyard", "vineyards", "winery", "dairy", "dairy farm", "poultry farm",
    "agricultural land", "agricultural plot", "agricultural plots",
    "smallholder", "smallholder farm", "commercial farm",
    "game farm", "game ranch", "safari", "hunting farm",
    "plantation", "plantations", "timber", "forestry",
    "fish farm", "aquaculture", "fish farming",
    // common phrasings
    "buy a farm", "start a farm", "set up a farm", "build a farm",
    "develop a farm", "farm land", "farming land",
    "buy agricultural land", "buy farming land",
  ],
  industrial_land: [
    // nouns
    "industrial", "factory", "factories", "manufacturing", "plant", "plants",
    "heavy industry", "light industry", "logistics hub", "industrial park",
    "industrial estate", "industrial plot", "industrial plots", "industrial land",
    "manufacturing plant", "assembly plant", "processing plant",
    "smelter", "mill", "brewery", "tannery", "industrial zone",
    "abattoir", "slaughterhouse", "refinery", "foundry",
    "workshop", "fabrication", "machine shop", "engineering works",
    "power plant", "power station", "solar farm", "solar plant",
    // common phrasings
    "build a factory", "build a plant", "set up a factory", "open a factory",
    "develop an industrial", "develop industrial", "construct a factory",
    "looking for industrial land", "looking for industrial plot",
    "build a brewery", "build a workshop", "set up a workshop",
  ],
  mixed_use_land: [
    // nouns
    "mixed-use", "mixed use", "combined", "multi-use", "live-work",
    "town centre", "town center", "transit-oriented", "transit oriented",
    "TOD", "live work", "mixed development", "mixed use development",
    // common phrasings
    "build a mixed-use", "develop a mixed-use", "set up a mixed-use",
  ],
  civic_land: [
    // nouns
    "school", "schools", "hospital", "hospitals", "church", "churches",
    "clinic", "clinics", "university", "universities", "campus",
    "campuses", "civic", "institutional", "mosque", "mosques",
    "temple", "temples", "public", "library", "libraries", "community",
    "community centre", "community center", "police station",
    "fire station", "firehouse", "town hall", "courthouse",
    "place of worship", "synagogue", "shrine",
    "park", "parks", "play park", "playground", "playgrounds",
    "recreation", "sports field", "sports fields", "stadium",
    "sports complex", "sports centre", "sports center",
    "swimming pool", "tennis court", "basketball court",
    "college", "colleges", "boarding school", "academy",
    "museum", "museums", "gallery", "galleries", "theatre", "theater",
    // common phrasings
    "build a school", "build a hospital", "build a church", "build a clinic",
    "build a mosque", "build a temple", "build a university", "build a library",
    "build a park", "build a playground", "build a stadium",
    "set up a school", "set up a hospital", "set up a clinic", "set up a church",
    "open a school", "open a clinic", "open a hospital", "open a church",
    "open a park", "open a playground", "open a museum",
    "construct a school", "construct a hospital", "construct a clinic",
    "develop a school", "develop a hospital", "develop a clinic",
    "looking to build a school", "looking to build a hospital",
    "looking to build a church", "looking to build a clinic",
    "where can I build a school", "where can I build a hospital",
    "where can I build a church", "where can I build a clinic",
    "put up a school", "put up a hospital", "put up a church", "put up a clinic",
    "start a school", "start a hospital", "start a clinic", "start a church",
  ],
};

const VERTICAL_LABEL: Record<string, string> = {
  gas_station: "Gas station",
  restaurant: "Restaurant",
  warehouse: "Warehouse",
  retail_shop: "Retail",
  residential_land: "Residential land",
  commercial_land: "Commercial land",
  agricultural_land: "Agricultural land",
  industrial_land: "Industrial land",
  mixed_use_land: "Mixed-use land",
  civic_land: "Civic / institutional",
  gas_station_custom: "Custom",
  restaurant_custom: "Custom",
};

/**
 * Detect a likely mismatch. Returns the suggested vertical id if the
 * question's keywords clearly point to a different vertical than the
 * one selected. Returns null if no clear mismatch.
 *
 * Day 9 polish: only fire when the prompt names an EXPLICIT ENTITY
 * (school, hospital, church, farm, warehouse, restaurant, etc.). A
 * generic question like "where can I build?" works for any vertical
 * and must NOT warn — only fire when the entity itself is a different
 * vertical than the one selected.
 *
 * Algorithm:
 *   1. Find every vertical whose keywords match the question.
 *   2. Sort by match strength.
 *   3. Require at least one STRONG match: a single keyword of length
 *      >= 5 that is a real vertical noun (school, hospital, church,
 *      farm, warehouse, restaurant, retail, gas station, industrial,
 *      etc.). Generic words like "where", "find", "build", "plot",
 *      "site", "land", "property" are explicitly excluded — they
 *      match everything and would warn on every prompt.
 *   4. Only fire if the top match is a DIFFERENT vertical than
 *      the one selected.
 */

// Words that match the atmoSphere of a real-estate question but are
// NOT specific to any one vertical. If a match consists only of
// these words, we don't warn — the question is genuinely generic.
const GENERIC_WORDS = new Set([
  "where", "find", "build", "plot", "site", "land", "property",
  "open", "put", "place", "start", "locate", "set up", "develop",
  "best", "good", "top", "right", "area", "location", "neighborhood",
  "neighbourhood", "south", "north", "east", "west", "central",
  "vacant", "erf", "suburb", "city", "town", "country",
  "invest", "investment", "developer", "develop", "build", "construct",
  "available", "buy", "purchase", "affordable", "size", "price",
  "zoning", "zoned", "permit", "approved", "ready",
]);

// Day 12 v8: known short nouns that should count as strong
// matches even though they fail the length>=5 rule. These are
// words that a user would type to clearly indicate a vertical:
//   "home"   → residential_land
//   "shop"   → retail_shop (also "store" / "mall")
//   "cafe"   → restaurant
//   "bar"    → restaurant
//   "pub"    → restaurant
//   "spa"    → retail_shop
//   "gym"    → retail_shop
//   "mall"   → retail_shop (also "commercial")
//   "kiosk"  → retail_shop
//   "shed"   → warehouse
//   "mill"   → industrial
const KNOWN_SHORT_NOUNS = new Set([
  "home", "homes", "shop", "shops", "store", "stores", "mall", "cafe", "cafes",
  "kiosk", "bar", "pub", "spa", "gym", "shed", "sheds", "mill", "barn",
  "plot", "plots", "erf", "farm", "farms", "tank", "tanks",
]);

function isStrongEntityHit(keyword: string): boolean {
  // Day 12 v8: a hit is "strong" (i.e. the question clearly names
  // this vertical) if EITHER:
  //   (a) the keyword is a known short noun (home, shop, mall, etc.)
  //   (b) the keyword is ≥ 5 chars AND not in the generic-word list
  // This fixes the bug where "looking to build a home in Sandton"
  // with gas_station selected failed to trigger the mismatch because
  // "home" was 4 chars and was rejected by the length rule.
  if (KNOWN_SHORT_NOUNS.has(keyword)) return true;
  if (keyword.length < 5) return false;
  if (GENERIC_WORDS.has(keyword)) return false;
  return true;
}

function suggestVertical(question: string, current: string): string | null {
  const q = question.toLowerCase();
  if (q.length < 8) return null; // too short to judge

  // Build a list of (vertical, matchedKeywords[]) pairs
  const hits: Array<{ v: string; count: number; strongCount: number; samples: string[] }> = [];
  for (const [v, kws] of Object.entries(VERTICAL_KEYWORDS)) {
    const matched: string[] = [];
    for (const kw of kws) {
      // Word-boundary check: don't match "house" inside "warehouse",
      // don't match "shop" inside "shopping". Use a simple
      // non-alphanumeric boundary on each side.
      const re = new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
      if (re.test(q)) matched.push(kw);
    }
    if (matched.length > 0) {
      const strongCount = matched.filter(isStrongEntityHit).length;
      hits.push({ v, count: matched.length, strongCount, samples: matched });
    }
  }
  if (hits.length === 0) return null; // no signal — silent pass-through

  // Pick the strongest match (most keyword hits, then most strong hits).
  // Skip if that match is the same as the current vertical.
  hits.sort((a, b) => (b.strongCount - a.strongCount) || (b.count - a.count));
  if (hits[0].v === current) return null;

  // Only fire if the top match has at least one STRONG entity hit
  // (a real vertical noun, not a generic word). Single weak hits
  // like "where" or "build" are not enough to second-guess the
  // user — those work for any vertical.
  if (hits[0].strongCount < 1) return null;

  return hits[0].v;
}

export function VerticalMismatchModal({
  question,
  currentVertical,
  onClose,
  onUseExample,
  onSwitchVertical,
  onUseCustom,
  onOverride,
}: {
  question: string;
  currentVertical: string;
  onClose: () => void;
  /**
   * Fill the input with an example (one of the clickable chips in
   * the "Use a starter prompt" section). The page sets
   * `vertical = newVertical`, `question = example`, closes the
   * modal, and does NOT submit. The user edits the example and
   * clicks Ask themselves.
   */
  onUseExample: (vertical: string, example: string) => void;
  /**
   * Day 12 v6: the big "Switch to {suggested}" button now ONLY
   * changes the vertical — it preserves the user's typed question.
   * Previously it called onUseExample(suggested, defaultExample)
   * which silently replaced the user's prompt with a pre-canned
   * example ("Where in Durban for a logistics warehouse?") and
   * auto-submitted, destroying the user's actual input ("Where
   * in Nairobi for an industrial warehouse"). The new behaviour:
   * vertical switches, question stays, user clicks Ask.
   */
  onSwitchVertical: (newVertical: string) => void;
  onUseCustom: () => void;
  onOverride: () => void;
}) {
  const suggested = suggestVertical(question, currentVertical);
  if (!suggested) return null; // safety: never render if no mismatch

  // Esc closes the modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentLabel = VERTICAL_LABEL[currentVertical] ?? currentVertical;
  const suggestedLabel = VERTICAL_LABEL[suggested] ?? suggested;

  // Show a handful of example prompts that match the suggested vertical
  // so the user can see what good input looks like.
  const examplePrompts: Record<string, string[]> = {
    gas_station: [
      "Where in Sandton for a gas station?",
      "Where in Pretoria for a fuel station near the highway?",
    ],
    restaurant: [
      "Where in Cape Town for a family restaurant?",
      "Where in Lagos for a fine-dining spot?",
    ],
    warehouse: [
      "Where in Durban for a logistics warehouse?",
      "Where in Nairobi for a distribution warehouse?",
    ],
    retail_shop: [
      "Where in Sandton for a retail clothing store?",
      "Where in Lusaka for a shopping mall location?",
    ],
    residential_land: [
      "Where in Sandton for vacant land to build houses?",
      "Where in Cape Town for a residential development plot?",
    ],
    commercial_land: [
      "Where in Sandton for a commercial office plot?",
      "Where in Pretoria for a shopping centre site?",
    ],
    agricultural_land: [
      "Where in Zambia for a smallholder farm?",
      "Where in Nairobi for an agricultural plot?",
    ],
    industrial_land: [
      "Where in Durban for an industrial plot?",
      "Where in Lagos for a manufacturing site?",
    ],
    mixed_use_land: [
      "Where in Sandton for a mixed-use development?",
      "Where in Cape Town for a live-work project?",
    ],
    civic_land: [
      "Where in Lusaka for a school site?",
      "Where in Nairobi for a community clinic?",
    ],
  };
  const examples = examplePrompts[suggested] ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-mismatch-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-md rounded-2xl border border-atlas-border bg-atlas-surface p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-atlas-muted transition-colors hover:bg-atlas-surface2 hover:text-atlas-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-400"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h2
              id="atlas-mismatch-title"
              className="text-lg font-semibold text-atlas-text"
            >
              Your question doesn&apos;t match this vertical
            </h2>
            <p className="mt-0.5 text-xs text-atlas-muted">
              {currentLabel} ⇆ {suggestedLabel}
            </p>
          </div>
        </div>

        <section className="mb-4 rounded-lg border border-atlas-border bg-atlas-bg p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
            Your question
          </div>
          <p className="mt-0.5 text-xs italic text-atlas-text">
            &ldquo;{question}&rdquo;
          </p>
          <p className="mt-2 text-[10px] text-atlas-muted">
            Selected:{" "}
            <span className="rounded bg-atlas-surface2 px-1.5 py-0.5 font-mono text-atlas-text">
              {currentLabel}
            </span>
            {" · "}Looks like:{" "}
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-amber-300">
              {suggestedLabel}
            </span>
          </p>
        </section>

        {examples.length > 0 && (
          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-atlas-accent">
                Use a starter prompt
              </div>
              <div className="text-[10px] text-atlas-muted">
                edit before sending ↓
              </div>
            </div>
            <ul className="space-y-1.5">
              {examples.map((ex, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onUseExample(suggested, ex)}
                    className="flex w-full items-start gap-2 rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-left text-xs text-atlas-text transition-colors hover:border-atlas-accent hover:bg-atlas-surface2"
                  >
                    <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-atlas-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-atlas-accent">
                      {suggestedLabel}
                    </span>
                    <span className="flex-1">{ex}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onOverride}
            className="rounded-md border border-atlas-border bg-atlas-bg px-3 py-1.5 text-xs font-medium text-atlas-muted transition-colors hover:border-atlas-accent hover:text-atlas-text"
          >
            Ask anyway
          </button>
          <button
            type="button"
            onClick={onUseCustom}
            className="rounded-md border border-atlas-border bg-atlas-bg px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
          >
            Use a custom vertical
          </button>
          <button
            type="button"
            onClick={() => onSwitchVertical(suggested)}
            className="rounded-md bg-atlas-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-atlas-accent2"
          >
            Switch to {suggestedLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { suggestVertical };
