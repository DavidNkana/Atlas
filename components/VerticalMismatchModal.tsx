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

const VERTICAL_KEYWORDS: Record<string, string[]> = {
  gas_station: ["gas", "fuel", "petrol", "diesel", "station", "fueling", "forecourt"],
  restaurant: ["restaurant", "food", "cafe", "dining", "eatery", "kitchen", "menu", "chef", "table"],
  warehouse: ["warehouse", "storage", "logistics", "distribution", "fulfilment", "industrial space", "shed"],
  retail_shop: ["retail", "shop", "store", "boutique", "showroom", "outlet", "mall", "merchandise"],
  residential_land: ["residential", "house", "housing", "home", "townhouse", "apartment", "suburb", "estate", "family", "build a house"],
  commercial_land: ["commercial", "office", "mixed-use", "retail space", "shopping centre", "business park"],
  agricultural_land: ["farm", "agricultural", "farming", "crop", "livestock", "ranch", "orchard", "pasture"],
  industrial_land: ["industrial", "factory", "manufacturing", "plant", "heavy industry", "logistics hub"],
  mixed_use_land: ["mixed-use", "mixed use", "combined", "multi-use", "live-work", "town centre", "transit-oriented"],
  // Civic / institutional uses. The wedge of "where can I build X?"
  // needs X to map to something we can suggest. If the user picks
  // "school", we suggest a "civic" vertical which they can rename via
  // custom.
  civic_land: ["school", "hospital", "church", "clinic", "university", "campus", "civic", "institutional", "mosque", "temple", "public", "library", "community"],
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

function isStrongEntityHit(keyword: string): boolean {
  // Strong = at least 5 chars AND not a generic word AND not just
  // a common verb/preposition. A single match of "school" or
  // "hospital" or "warehouse" is enough to warn.
  if (keyword.length < 5) return false;
  if (GENERIC_WORDS.has(keyword)) return false;
  // Reject if the keyword is just a substring of a generic word
  // (e.g. "house" inside "household" handled by word boundary
  // check at the call site, not here).
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
