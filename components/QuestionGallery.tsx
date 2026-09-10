"use client";

/**
 * Atlas — sample questions dropdown.
 *
 * Replaces the always-visible chips. Click "View samples" to open
 * a vertically-laid-out dropdown with 20 hand-written
 * SA prompts grouped by vertical. Clicking a sample fills the
 * command bar AND sets the matching vertical.
 *
 * Scroll behavior: when the dropdown is open the page can scroll
 * normally so users can see all of the samples.
 */

import * as React from "react";

export type GalleryPick = { question: string; vertical: string };

type GallerySection = {
  label: string;
  vertical: string;
  questions: string[];
};

const SECTIONS: GallerySection[] = [
  {
    label: "Gas station",
    vertical: "gas_station",
    questions: [
      "Identify 3–5 vacant or redevelopment sites within 5 km of Sandton for a new fuel-station development; prioritize commercial zoning, arterial access, traffic demand, competition gaps, and flag approval constraints.",
      "Find candidate vacant land or redevelopment sites within 8 km of Soweto for a neighborhood fuel station; prioritize appropriate zoning, road access, underserved demand, nearby competition, and return diligence constraints.",
      "Rank 3–5 vacant or redevelopment opportunities within 10 km of Cape Town's Northern Suburbs for a fuel-station project; assess zoning, visibility, access, traffic demand, competing stations, and required approvals.",
      "Identify candidate vacant or redevelopment sites within 3 km of the Durban N3 corridor for a truck-stop development; prioritize heavy-vehicle access, logistics demand, suitable zoning, competition gaps, and site/entitlement constraints.",
    ],
  },
  {
    label: "Restaurant",
    vertical: "restaurant",
    questions: [
      "Identify 3–5 vacant or redevelopment sites within 5 km of Sandton for an upmarket restaurant development; prioritize mixed-use/commercial zoning, pedestrian access, affluent demand, competition gaps, and licensing or approval constraints.",
      "Find vacant land or redevelopment opportunities within 2 km of Cape Town's Bo-Kaap for a tourist-oriented bistro scheme; assess zoning, walkability, visitor footfall, competing venues, heritage constraints, and the recommended diligence output.",
      "Rank candidate vacant or redevelopment sites within 5 km of Pretoria Hatfield for a student-oriented restaurant project; prioritize commercial/mixed-use zoning, walkability to UP, transit access, student demand, competition, and approvals.",
      "Identify vacant or redevelopment sites within 3 km of Joburg Maboneng for a rooftop dining and entertainment development; assess mixed-use entitlement, pedestrian footfall, demand, competing venues, structural/access constraints, and next diligence actions.",
    ],
  },
  {
    label: "Warehouse",
    vertical: "warehouse",
    questions: [
      "Identify 3–5 vacant or redevelopment sites within 10 km of Johannesburg South for a logistics-warehouse development; prioritize industrial zoning, truck access, freight demand, competing logistics supply, and servicing or entitlement constraints.",
      "Find vacant land or redevelopment opportunities within 8 km of Durban Cato Ridge for a distribution-center project; assess industrial zoning, highway/rail access, regional demand, competition, and return site-servicing and approval constraints.",
      "Rank candidate vacant or redevelopment sites within 5 km of Cape Town Epping for a cold-storage facility; prioritize industrial entitlement, power and freight access, cold-chain demand, competing capacity, and infrastructure constraints.",
      "Identify 3–5 vacant or redevelopment opportunities within 10 km of Port Elizabeth's port for an export-warehouse scheme; assess industrial zoning, port and road access, export demand, competing supply, and approval or servicing constraints.",
    ],
  },
  {
    label: "Retail shop",
    vertical: "retail_shop",
    questions: [
      "Identify vacant or redevelopment sites within 5 km of Sandton City for a luxury retail development; prioritize commercial/mixed-use zoning, pedestrian and vehicle access, high-spend demand, competition gaps, and flag entitlement constraints.",
      "Find 3–5 candidate vacant or redevelopment sites within 4 km of Menlyn for a technology retail project; assess zoning, visibility, transit and parking access, demand, existing competition, and required approvals.",
      "Rank vacant or redevelopment opportunities within 3 km of Canal Walk for a flagship fashion retail scheme; prioritize retail entitlement, footfall, affluent demand, competitive whitespace, and disclose access, lease, or approval constraints.",
      "Identify candidate vacant or redevelopment sites within 5 km of uMhlanga for a beachwear retail development; assess commercial zoning, walkability and visitor access, seasonal demand, competition, and the next diligence action.",
    ],
  },
  {
    label: "Residential land",
    vertical: "custom:residential_land",
    questions: [
      "Identify 3–5 vacant or redevelopment sites within 8 km of Pretoria East for a family residential scheme; prioritize residential/mixed-use zoning, schools and road access, household demand, competing supply, and flag approval constraints.",
      "Find vacant land or redevelopment opportunities within 5 km of Constantia for a low-density luxury residential development; assess residential entitlement, access, buyer demand proxies, competing projects, environmental constraints, and next diligence steps.",
      "Rank 3–5 vacant or redevelopment sites within 10 km of Midrand for a new residential-estate project; prioritize residential/mixed-use zoning, transit and serviced access, demand-supply gaps, competition, and development approvals.",
      "Identify vacant or redevelopment sites within 5 km of Stellenbosch for student-oriented residential development; prioritize residential/mixed-use zoning, walkability to Stellenbosch University, serviced access, unmet demand, competing beds, and entitlement constraints.",
    ],
  },
];

export function QuestionGallery({
  onPick,
}: {
  onPick: (pick: GalleryPick) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const galleryRef = React.useRef<HTMLDivElement>(null);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Close when clicking outside the trigger and dropdown
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!galleryRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={galleryRef} className="relative mt-4 w-full sm:mt-5">
      {/* Trigger button — centered, orange pill */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${
            open
              ? "border-atlas-accent bg-atlas-accent/15 text-atlas-accent"
              : "border-atlas-border bg-atlas-surface/40 text-atlas-muted hover:border-atlas-accent hover:text-atlas-text"
          }`}
          data-testid="atlas-samples-toggle"
        >
          <span>{open ? "Hide samples" : "View samples"}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Dropdown — opens below the trigger and expands with all samples */}
      {open && (
        <div
          className="mt-3 rounded-lg border border-atlas-border/60 bg-atlas-surface/85 backdrop-blur-xl backdrop-saturate-150 p-4 shadow-2xl shadow-black/50"
          data-testid="atlas-samples-dropdown"
        >
          <div className="mb-3 text-center text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
            Pick a South African question to start
          </div>

          <div className="space-y-4">
            {SECTIONS.map((section) => (
              <section key={section.vertical}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
                    {section.label}
                  </span>
                  <span className="rounded-full border border-atlas-border px-1.5 text-[9px] font-semibold text-atlas-muted">
                    {section.questions.length}
                  </span>
                  <span className="h-px flex-1 bg-atlas-border/50" />
                </div>

                <div className="flex flex-col gap-1">
                  {section.questions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        onPick({ question: q, vertical: section.vertical });
                        setOpen(false);
                      }}
                      title={q}
                      className="w-full rounded border border-transparent px-3 py-2 text-left text-xs text-atlas-muted transition-colors hover:border-atlas-accent/40 hover:bg-atlas-accent/5 hover:text-atlas-text"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Exported for tests / sanity checks: total prompts in the gallery. */
export const GALLERY_QUESTION_COUNT = SECTIONS.reduce(
  (n, s) => n + s.questions.length,
  0,
);

/** Exported for lightweight copy checks without coupling tests to the UI. */
export const GALLERY_QUESTIONS = SECTIONS.flatMap((section) => section.questions);
