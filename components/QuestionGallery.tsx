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
      "Where in Sandton for a gas station?",
      "Where in Soweto for a new fuel station?",
      "Where in Cape Town Northern Suburbs for a fuel station?",
      "Where in Durban along the N3 for a truck stop?",
    ],
  },
  {
    label: "Restaurant",
    vertical: "restaurant",
    questions: [
      "Where in Sandton for an upmarket restaurant?",
      "Where in Cape Town Bo-Kaap for a tourist-friendly bistro?",
      "Where in Pretoria Hatfield for a student-friendly restaurant?",
      "Where in Joburg Maboneng for a rooftop bar?",
    ],
  },
  {
    label: "Warehouse",
    vertical: "warehouse",
    questions: [
      "Where in Johannesburg South for a logistics warehouse?",
      "Where in Durban Cato Ridge for a distribution center?",
      "Where in Cape Town Epping for a cold-storage facility?",
      "Where in Port Elizabeth for an export warehouse?",
    ],
  },
  {
    label: "Retail shop",
    vertical: "retail_shop",
    questions: [
      "Where in Sandton City for a luxury retail outlet?",
      "Where in Menlyn for a tech retail store?",
      "Where in Canal Walk for a flagship fashion store?",
      "Where in uMhlanga for a beachwear boutique?",
    ],
  },
  {
    label: "Residential land",
    vertical: "custom:residential_land",
    questions: [
      "Where in Pretoria East for family residential development?",
      "Where in Constantia for luxury residential?",
      "Where in Midrand for new residential estates?",
      "Where in Stellenbosch for student housing?",
    ],
  },
];

export function QuestionGallery({
  onPick,
}: {
  onPick: (pick: GalleryPick) => void;
}) {
  const [open, setOpen] = React.useState(false);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative mt-4 w-full sm:mt-5">
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
