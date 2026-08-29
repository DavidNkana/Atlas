"use client";

/**
 * Atlas — question gallery.
 *
 * Replaces the old four sample chips under the command bar. Those
 * chips mixed cities across three countries (Lusaka, Nairobi,
 * Sandton) which taught new users the wrong thing about what Atlas
 * covers today: South Africa.
 *
 * The gallery is 20 hand-written, SA-only prompts grouped by
 * vertical. Clicking one fills the command bar AND sets the matching
 * vertical, so the very first question a new user asks is already a
 * well-formed one — the fastest path to a good first answer.
 *
 * Each section scrolls horizontally so the whole gallery stays
 * short (5 rows) no matter how many prompts we add later.
 */

export type GalleryPick = { question: string; vertical: string };

type GallerySection = {
  /** Human label for the section header. */
  label: string;
  /** Vertical token sent to /api/ask (built-in or `custom:...`). */
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
  return (
    <div className="mt-5 w-full">
      <div className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-atlas-muted">
        Start with a real South African question
      </div>

      <div className="flex flex-col gap-3">
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

            {/* Horizontal scroller — no wrapping, so each vertical
                stays exactly one row tall. */}
            <div className="atlas-gallery-row -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {section.questions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() =>
                    onPick({ question: q, vertical: section.vertical })
                  }
                  title={q}
                  className="shrink-0 whitespace-nowrap rounded-full border border-atlas-border bg-atlas-surface px-3.5 py-2 text-xs text-atlas-muted transition-colors hover:border-atlas-accent hover:bg-atlas-surface2 hover:text-atlas-text"
                >
                  {q}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Exported for tests / sanity checks: total prompts in the gallery. */
export const GALLERY_QUESTION_COUNT = SECTIONS.reduce(
  (n, s) => n + s.questions.length,
  0,
);
