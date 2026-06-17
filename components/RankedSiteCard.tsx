"use client";

/**
 * Atlas — Ranked site card.
 *
 * A click-to-expand card that shows the AI's full reasoning for why a
 * particular site is the best fit. Two states:
 *
 *   1. Collapsed (default) — rank badge, name, score, confidence, brief
 *      rationale, coordinates. Click to expand.
 *
 *   2. Expanded — the same header, plus a "Why Atlas picked this" panel
 *      that breaks down:
 *        - The full AI reasoning (rationale)
 *        - The signals that contributed (POI density, demographics,
 *          listings, etc. — whatever the connectors returned for this
 *          site, with weights shown)
 *        - The score factors (which inputs pushed the score up/down)
 *        - Coordinates + generation timestamp
 *
 * v1: we use the existing rationale + signals as the explanation. v2
 * (Day 30+) can add a dedicated per-site follow-up question that
 * returns a long-form writeup.
 */

import { useState } from "react";

type Signal = {
  id: string;
  source: string;
  type: string;
  label: string;
  value: number;
  weight: number;
  fetchedAt: string;
};

type ScoreFactor = {
  name: string;
  weight: number;
  contribution: number;
  evidence: string;
};

type ScoreBreakdown = {
  siteId: string;
  baseScore: number;
  signalScore: number;
  confidence: number;
  factors: ScoreFactor[];
};

type Site = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;
  lng?: number;
  signals?: Signal[];
  scoreBreakdown?: ScoreBreakdown;
};

const SOURCE_LABEL: Record<string, string> = {
  overpass: "OpenStreetMap POI density",
  real_estate_listings: "Real estate listings",
  stats_sa: "Demographic profile",
  google_places: "Live POI density",
};

const TYPE_LABEL: Record<string, string> = {
  amenity_density: "Nearby amenities",
  property_listing_density: "Nearby listings",
  demographic_profile: "Suburb profile",
  poi_density: "Live POI",
};

function sourceLabel(s: Signal): string {
  return SOURCE_LABEL[s.source] ?? s.source;
}

function typeLabel(s: Signal): string {
  return TYPE_LABEL[s.type] ?? s.type;
}

function generateExplanation(site: Site): string {
  // Build a "Why Atlas picked this" paragraph from the available signals.
  // The AI's rationale is the spine; we append signal context where
  // available. Signals with weight > 0.4 are highlighted as supporting
  // evidence.
  const baseRationale =
    site.rationale?.trim() ||
    "Atlas scored this site highly based on its overall fit.";
  const signalSummary: string[] = [];
  if (site.signals) {
    for (const sig of site.signals) {
      if (sig.weight > 0.4) {
        signalSummary.push(
          `${sourceLabel(sig)}: ${sig.label} (weight ${(sig.weight * 100).toFixed(0)}%)`
        );
      }
    }
  }
  const signalParagraph =
    signalSummary.length > 0
      ? `\n\nSupporting evidence:\n${signalSummary.map((s) => `• ${s}`).join("\n")}`
      : "";
  return `${baseRationale}${signalParagraph}`;
}

export function RankedSiteCard({ site }: { site: Site }) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const explanation = generateExplanation(site);
  const factors = site.scoreBreakdown?.factors ?? [];
  const signals = site.signals ?? [];

  return (
    <li
      className={`overflow-hidden rounded-lg border bg-atlas-surface transition-colors ${
        expanded
          ? "border-atlas-accent"
          : "border-atlas-border hover:border-atlas-accent/50"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-atlas-accent/10 text-xs font-semibold text-atlas-accent">
              {site.rank}
            </span>
            <h3 className="text-sm font-medium text-atlas-text">
              {site.name}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px]">
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-emerald-300">
              score {site.score?.toFixed?.(2) ?? "—"}
            </span>
            <span className="rounded bg-atlas-surface2 px-1.5 py-0.5 font-mono text-atlas-muted">
              conf {site.confidence?.toFixed?.(2) ?? "—"}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-atlas-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>

        {site.rationale && (
          <p className="ml-8 mt-1 line-clamp-2 text-xs leading-relaxed text-atlas-muted">
            {site.rationale}
          </p>
        )}

        {site.lat != null && site.lng != null && (
          <p className="ml-8 mt-1 font-mono text-[10px] text-atlas-muted">
            {site.lat.toFixed(4)}, {site.lng.toFixed(4)}
          </p>
        )}
      </button>

      {expanded && (
        <div className="border-t border-atlas-border bg-atlas-bg/50 p-4">
          {/* Why Atlas picked this — the full AI explanation */}
          <section className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-atlas-accent"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-atlas-accent">
                Why Atlas picked this
              </h4>
            </div>
            <div className="ml-6 whitespace-pre-line text-sm leading-relaxed text-atlas-text">
              {explanation}
            </div>
          </section>

          {/* Score breakdown — what made the score what it is */}
          {factors.length > 0 && (
            <section className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-atlas-accent"
                >
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-atlas-accent">
                  Score breakdown
                </h4>
              </div>
              <ul className="ml-6 space-y-2">
                {factors.map((f, i) => {
                  const positive = f.contribution >= 0;
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-atlas-text"
                    >
                      <span
                        className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          positive ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-medium">{f.name}</span>
                          <span
                            className={`font-mono ${
                              positive ? "text-emerald-300" : "text-red-300"
                            }`}
                          >
                            {positive ? "+" : ""}
                            {f.contribution.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-atlas-muted">
                            (weight {(f.weight * 100).toFixed(0)}%)
                          </span>
                        </div>
                        {f.evidence && (
                          <p className="text-[10px] leading-relaxed text-atlas-muted">
                            {f.evidence}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* The raw signals Atlas used (POI density, demographics, listings) */}
          {signals.length > 0 && (
            <section className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-atlas-accent"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                </svg>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-atlas-accent">
                  Data Atlas used ({signals.length})
                </h4>
              </div>
              <ul className="ml-6 space-y-1.5">
                {signals.map((s, i) => (
                  <li key={i} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-atlas-surface2 px-1.5 py-0.5 text-[10px] font-medium text-atlas-muted">
                        {typeLabel(s)}
                      </span>
                      <span className="text-atlas-text">{s.label}</span>
                      <span className="font-mono text-[10px] text-atlas-muted">
                        · weight {(s.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Footer with coordinates and timestamp */}
          <section className="border-t border-atlas-border pt-3 font-mono text-[10px] text-atlas-muted">
            {site.lat != null && site.lng != null && (
              <p>
                Coordinates: {site.lat.toFixed(6)}, {site.lng.toFixed(6)}
              </p>
            )}
            <p className="mt-1">
              Generated by Atlas · {new Date().toLocaleString()}
            </p>
          </section>
        </div>
      )}
    </li>
  );
}
