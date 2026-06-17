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
  gas_station_custom: "Custom",
  restaurant_custom: "Custom",
};

/**
 * Detect a likely mismatch. Returns the suggested vertical id if the
 * question's keywords clearly point to a different vertical than the
 * one selected. Returns null if no clear mismatch.
 */
function suggestVertical(question: string, current: string): string | null {
  const q = question.toLowerCase();
  if (q.length < 8) return null; // too short to judge

  // Build a list of (vertical, matchedKeywords[]) pairs
  const hits: Array<{ v: string; count: number; samples: string[] }> = [];
  for (const [v, kws] of Object.entries(VERTICAL_KEYWORDS)) {
    const matched: string[] = [];
    for (const kw of kws) {
      if (q.includes(kw)) matched.push(kw);
    }
    if (matched.length > 0) {
      hits.push({ v, count: matched.length, samples: matched });
    }
  }
  if (hits.length === 0) return null; // no signal — silent pass-through

  // Pick the strongest match (most keyword hits). Skip if that match
  // is the same as the current vertical.
  hits.sort((a, b) => b.count - a.count);
  if (hits[0].v === current) return null;

  // Only fire if the match is strong (>= 2 hits OR 1 strong hit).
  // Single weak hits are not enough to second-guess the user.
  if (hits[0].count < 2 && hits[0].samples[0].length < 6) return null;

  return hits[0].v;
}

export function VerticalMismatchModal({
  question,
  currentVertical,
  onClose,
  onUseVertical,
  onUseCustom,
  onOverride,
}: {
  question: string;
  currentVertical: string;
  onClose: () => void;
  onUseVertical: (v: string) => void;
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
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-atlas-accent">
              Examples for {suggestedLabel}
            </div>
            <ul className="space-y-1.5">
              {examples.map((ex, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onUseVertical(suggested)}
                    className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-left text-xs text-atlas-text transition-colors hover:border-atlas-accent hover:bg-atlas-surface2"
                  >
                    {ex}
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
            onClick={() => onUseVertical(suggested)}
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
