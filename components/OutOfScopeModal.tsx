"use client";

/**
 * Atlas — Out-of-scope prompt modal.
 *
 * Day 8 polish. When the user types a question that doesn't fit Atlas's
 * real estate / location intelligence wedge (e.g. "write me a song",
 * "plan a party", "what's 2+2"), we show a friendly modal that:
 *
 *   1. Tells them what Atlas IS for (location intelligence for
 *      African real estate)
 *   2. Shows example prompts they can try (so they immediately see
 *      how to use the product)
 *   3. Lets them edit the question, pick one of the examples, or
 *      close and try a different one
 *
 * The relevance check is intentionally lightweight — a small set of
 * keywords. We don't want to over-engineer this: the goal is to
 * redirect the user to a usable question, not be a perfect
 * classifier. If we're unsure, we let the question through.
 */

import { useEffect, useState } from "react";

const LAND_KEYWORDS = [
  "where",
  "find",
  "site",
  "location",
  "plot",
  "land",
  "property",
  "invest",
  "develop",
  "build",
  "open",
  "open a",
  "put",
  "place",
  "start",
  "locate",
  "commercial",
  "residential",
  "industrial",
  "agricultural",
  "retail",
  "warehouse",
  "restaurant",
  "gas station",
  "gas",
  "shop",
  "store",
  "office",
  "mall",
  "factory",
  "farm",
  "house",
  "apartment",
  "townhouse",
  "sandton",
  "johannesburg",
  "pretoria",
  "cape town",
  "durban",
  "lusaka",
  "kitwe",
  "livingstone",
  "harare",
  "nairobi",
  "lagos",
  "kampala",
  "kigali",
  "addis",
  "cairo",
  "accra",
  "windhoek",
  "gaborone",
  "south africa",
  "zambia",
  "kenya",
  "namibia",
  "botswana",
  "zimbabwe",
  "nigeria",
  "ghana",
  "uganda",
  "rwanda",
  "ethiopia",
  "egypt",
  "africa",
  "zoning",
  "vacant",
  "erf",
  "suburb",
  "highway",
  "intersection",
  "ramp",
  "amenities",
  "footfall",
  "demographic",
  "traffic",
  "commuter",
  "tenant",
  "buyer",
  "tenant",
  "investor",
  "developer",
  "valuation",
  "feasibility",
  "rural",
  "urban",
  "per-urban",
  "peri-urban",
  "township",
];

const EXAMPLE_PROMPTS = [
  "Where in Sandton for a gas station?",
  "Where in Pretoria for a restaurant?",
  "Where in Lusaka for a warehouse?",
  "Where in Cape Town for retail?",
  "Where in Nairobi for a residential development?",
];

function isRelevant(question: string): boolean {
  const q = question.toLowerCase().trim();
  if (q.length < 4) return true; // too short to judge
  for (const kw of LAND_KEYWORDS) {
    if (q.includes(kw)) return true;
  }
  return false;
}

export function OutOfScopeModal({
  question,
  onClose,
  onUseExample,
}: {
  question: string;
  onClose: () => void;
  onUseExample: (example: string) => void;
}) {
  // Esc closes the modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-oot-title"
    >
      {/* Click-outside to close */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-2xl border border-atlas-border bg-atlas-surface p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
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

        {/* Icon + title */}
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <h2
              id="atlas-oot-title"
              className="text-lg font-semibold text-atlas-text"
            >
              This question is outside Atlas&apos;s focus
            </h2>
            <p className="mt-0.5 text-xs text-atlas-muted">
              Atlas is built for one thing — and it does it well.
            </p>
          </div>
        </div>

        {/* What Atlas is */}
        <section className="mb-4 rounded-lg border border-atlas-border bg-atlas-bg p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-atlas-accent">
            What Atlas is for
          </div>
          <p className="mt-1 text-sm text-atlas-text">
            Atlas answers <strong className="text-atlas-text">where to build, invest, or grow</strong>{" "}
            in African real estate. It blends AI reasoning with real
            property data, demographics, and live POI signals.
          </p>
        </section>

        {/* What Atlas is NOT for (briefly) */}
        <p className="mb-3 text-xs text-atlas-muted">
          Atlas is <em>not</em> a general chatbot. It won&apos;t write
          songs, plan parties, code, do math homework, or answer
          off-topic questions. We&apos;d rather redirect you than give
          you a bad answer.
        </p>

        {/* The user's question, for context */}
        <div className="mb-4 rounded-md border border-atlas-border bg-atlas-bg/60 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
            Your question
          </div>
          <p className="mt-0.5 text-xs italic text-atlas-muted">
            &ldquo;{question}&rdquo;
          </p>
        </div>

        {/* Example prompts */}
        <section>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-atlas-accent">
            Try one of these
          </div>
          <ul className="space-y-1.5">
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onUseExample(ex)}
                  className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-left text-sm text-atlas-text transition-colors hover:border-atlas-accent hover:bg-atlas-surface2"
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Action row */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-atlas-border bg-atlas-bg px-3 py-1.5 text-xs font-medium text-atlas-muted transition-colors hover:border-atlas-accent hover:text-atlas-text"
          >
            Edit my question
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to use the modal from a parent component. Returns:
 *   - openModalFor: function that checks the question and opens the
 *     modal if it's out of scope, returns true if it should be blocked
 *   - modal state and handlers
 */
export function useOutOfScopeGate(): {
  showModal: boolean;
  blockedQuestion: string;
  checkQuestion: (q: string) => boolean;
  closeModal: () => void;
  Modal: () => React.ReactElement;
} {
  const [showModal, setShowModal] = useState(false);
  const [blockedQuestion, setBlockedQuestion] = useState("");

  function checkQuestion(q: string): boolean {
    if (isRelevant(q)) return false; // relevant — don't block
    setBlockedQuestion(q);
    setShowModal(true);
    return true; // blocked
  }

  function closeModal() {
    setShowModal(false);
  }

  const Modal = () =>
    showModal ? (
      <OutOfScopeModal
        question={blockedQuestion}
        onClose={closeModal}
        onUseExample={(ex) => {
          setShowModal(false);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("atlas:use-example", { detail: ex })
            );
          }
        }}
      />
    ) : (
      <></>
    );

  return { showModal, blockedQuestion, checkQuestion, closeModal, Modal };
}
