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
import { StreetViewPanel } from "./StreetViewPanel";

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
  advantages?: { economic?: string; geographic?: string; logistical?: string; demographic?: string; };
  disadvantages?: string;
  lat?: number;
  lng?: number;
  signals?: Signal[];
  scoreBreakdown?: ScoreBreakdown;
  // Day 21: property-level details from REAL_SITE_CATALOG
  // enrichment. All optional — only set for sites with hand-curated
  // or live data. UI renders the data section only if any field is set.
  suburb?: string;
  cornerStand?: boolean;
  facing?: "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
  plotSizeHectares?: number;
  priceRange?: string;
  zoning?: string;
  titleType?: "freehold" | "leasehold";
  arterial?: string;
  nearestHighwayKm?: number;
  competition?: string[];
  medianIncome?: number;
  dataProvenance?: string;
  // Day 22: live per-listing data from SA property portals via
  // Tavily. Max 3 per site (free-tier cap). UI renders as
  // "Live listings" section in the expanded card.
  liveListings?: Array<{
    id: string;
    suburb: string | null;
    portal: "property24" | "privateproperty" | "gumtree" | "bidx1" | "pamgolding" | "seeff" | "chaseveritt";
    url: string;
    price: string | null;
    erfSize: string | null;
    erfSizeM2: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    address: string | null;
    title: string;
    snippet: string;
    matchTier: 1 | 2 | 3;
  }>;
};

// Portal branding for the live-listings badge.
// Each portal gets a distinct hue so users can spot them at a glance.
const PORTAL_LABEL: Record<string, string> = {
  property24: "Property24",
  privateproperty: "Private Property",
  gumtree: "Gumtree",
  bidx1: "BidX1",
  pamgolding: "Pam Golding",
  seeff: "Seeff",
  chaseveritt: "Chas Everitt",
};
const PORTAL_BADGE: Record<string, string> = {
  property24: "bg-blue-500/15 text-blue-300",
  privateproperty: "bg-purple-500/15 text-purple-300",
  gumtree: "bg-emerald-500/15 text-emerald-300",
  bidx1: "bg-amber-500/15 text-amber-300",
  pamgolding: "bg-rose-500/15 text-rose-300",
  seeff: "bg-cyan-500/15 text-cyan-300",
  chaseveritt: "bg-indigo-500/15 text-indigo-300",
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

export function RankedSiteCard({
  site,
  fallbackLatLng,
}: {
  site: Site;
  /**
   * Day 12 v10: city-centre coordinates to use as the Street
   * View fallback if the exact site coordinates have no
   * Google coverage. Computed once on the result page from
   * the detected city and passed down so each card doesn't
   * have to re-detect.
   */
  fallbackLatLng?: { lat: number; lng: number };
}) {
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

        {/* Day 21: Property facts row + Competition. Only renders if the
            site has hand-curated property data. The badges + plain-text
            property row is what Perplexity-style real estate answers
            look like (corner stand, facing, plot size, price range). */}
        {(site.cornerStand != null ||
          site.facing ||
          site.plotSizeHectares != null ||
          site.priceRange ||
          site.zoning ||
          site.titleType ||
          site.arterial ||
          site.nearestHighwayKm != null ||
          (site.competition && site.competition.length > 0)) && (
          <div className="ml-8 mt-2 space-y-1.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              {site.cornerStand === true && (
                <span
                  className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-300"
                  title="Two street frontages — typically commands a 10-20% premium in SA"
                >
                  ⌐ Corner stand
                </span>
              )}
              {site.facing && (
                <span
                  className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-300"
                  title={`Compass orientation — N-facing preferred in SA (sun + prevailing wind)`}
                >
                  ↑ {site.facing}-facing
                </span>
              )}
              {site.titleType && (
                <span className="rounded border border-atlas-border bg-atlas-surface2 px-1.5 py-0.5 text-atlas-text">
                  {site.titleType}
                </span>
              )}
              {site.zoning && (
                <span className="rounded border border-atlas-border bg-atlas-surface2 px-1.5 py-0.5 text-atlas-text">
                  {site.zoning}
                </span>
              )}
              {site.plotSizeHectares != null && (
                <span className="rounded border border-atlas-border bg-atlas-surface2 px-1.5 py-0.5 text-atlas-text">
                  {site.plotSizeHectares >= 1
                    ? `${site.plotSizeHectares} ha`
                    : `${Math.round(site.plotSizeHectares * 10000)} m²`}
                </span>
              )}
              {site.priceRange && (
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-300">
                  {site.priceRange}
                </span>
              )}
              {site.medianIncome != null && (
                <span
                  className="rounded border border-atlas-border bg-atlas-surface2 px-1.5 py-0.5 text-atlas-muted"
                  title="Median household income, Stats SA Census 2022"
                >
                  R {Math.round(site.medianIncome / 1000)}k/mo income
                </span>
              )}
            </div>
            {(site.arterial || site.nearestHighwayKm != null) && (
              <p className="text-atlas-muted">
                {site.arterial && (
                  <>
                    On <span className="text-atlas-text">{site.arterial}</span>
                  </>
                )}
                {site.arterial && site.nearestHighwayKm != null && " · "}
                {site.nearestHighwayKm != null && (
                  <>
                    {site.nearestHighwayKm} km to nearest highway
                  </>
                )}
              </p>
            )}
            {site.competition && site.competition.length > 0 && (
              <p className="text-atlas-muted">
                <span className="text-atlas-text">Competition:</span>{" "}
                {site.competition.join(" · ")}
              </p>
            )}
            {site.dataProvenance && (
              <div className="rounded border border-atlas-border bg-atlas-surface2 px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-atlas-muted">
                  Data provenance
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-atlas-text break-words">
                  {site.dataProvenance}
                </p>
                <p className="mt-1 text-[10px] text-atlas-muted">
                  {(site.confidence ?? 0) >= 0.6 ? (
                    <span className="text-emerald-400">✓ Confidence {(site.confidence * 100).toFixed(0)}% — sufficient</span>
                  ) : (
                    <span className="text-rose-400">⚠ Confidence {(site.confidence * 100).toFixed(0)}% — below threshold, treat with caution</span>
                  )}
                </p>
              </div>
            )}

            {/* Day 22 — live listings section. Shows up to 3 real
                Property24 / Private Property listings matched to this
                suburb. Each listing links out to the portal. Agent
                names redacted per privacy policy. */}
            {site.liveListings && site.liveListings.length > 0 && (
              <div className="mt-3 border-t border-atlas-border/50 pt-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
                  Live listings ({site.liveListings.length} on Property24 + Private Property)
                </p>
                <ul className="space-y-2">
                  {site.liveListings.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-baseline justify-between gap-3 rounded border border-atlas-border/40 bg-atlas-surface/40 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${PORTAL_BADGE[l.portal] ?? "bg-zinc-500/15 text-zinc-300"}`}
                          >
                            {PORTAL_LABEL[l.portal] ?? l.portal}
                          </span>
                          {l.matchTier === 1 && (
                            <span className="font-mono text-[9px] text-emerald-400">exact</span>
                          )}
                          {l.matchTier === 2 && (
                            <span className="font-mono text-[9px] text-amber-400">fuzzy</span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-atlas-text">{l.title}</p>
                        {l.address && (
                          <p className="truncate font-mono text-[10px] text-atlas-muted">
                            {l.address}
                          </p>
                        )}
                        <p className="mt-0.5 text-atlas-muted">
                          {l.price && (
                            <span className="text-atlas-text">{l.price}</span>
                          )}
                          {l.price && l.erfSize && " · "}
                          {l.erfSize && <span>{l.erfSize}</span>}
                          {l.bedrooms && ` · ${l.bedrooms} bed`}
                          {l.bathrooms && ` · ${l.bathrooms} bath`}
                        </p>
                      </div>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded border border-atlas-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-atlas-muted transition hover:border-atlas-accent hover:text-atlas-text"
                      >
                        View →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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

          {/* Day 12 v9: live Google Street View for this site.
              Lets the user eyeball the area without driving out.
              Renders a 640x360 jpeg from the Static API. Falls
              back to a setup hint when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
              is missing, and to "no coverage" + a Google Maps
              link when Google hasn't photographed this area. */}
          {site.lat != null && site.lng != null && (
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
                  <path d="M3 12a9 9 0 1 0 9-9"></path>
                  <path d="M3 12a9 9 0 0 1 9-9v9z"></path>
                </svg>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-atlas-accent">
                  Street view
                </h4>
              </div>
              <div className="ml-6">
                <StreetViewPanel
                  lat={site.lat}
                  lng={site.lng}
                  name={site.name}
                  fallbackLat={fallbackLatLng?.lat}
                  fallbackLng={fallbackLatLng?.lng}
                />
              </div>
            </section>
          )}

          {/* LCP-65: Sectioned advantages from Gemini */}
          {site.advantages && (
            <section className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Regional advantages</h4>
              </div>
              <div className="ml-6 space-y-3 text-sm leading-relaxed text-atlas-text">
                {site.advantages.economic && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-atlas-muted mb-1">Economic</h5>
                    <p>{site.advantages.economic}</p>
                  </div>
                )}
                {site.advantages.geographic && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-atlas-muted mb-1">Geographic</h5>
                    <p>{site.advantages.geographic}</p>
                  </div>
                )}
                {site.advantages.logistical && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-atlas-muted mb-1">Logistical</h5>
                    <p>{site.advantages.logistical}</p>
                  </div>
                )}
                {site.advantages.demographic && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-atlas-muted mb-1">Demographic</h5>
                    <p>{site.advantages.demographic}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Disadvantages */}
          {site.disadvantages && (
            <section className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Disadvantages &amp; risks</h4>
              </div>
              <div className="ml-6 text-sm leading-relaxed text-atlas-text">
                <p>{site.disadvantages}</p>
              </div>
            </section>
          )}

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
              {/* Day 28 v2 — suppressHydrationWarning because
                  Date.now() at SSR time vs first client paint
                  always produces different timestamps and was
                  causing React #418 hydration mismatches. The
                  displayed time is approximate (~1s precision)
                  and not worth a hydration error. */}
              Generated by Atlas ·{" "}
              <span suppressHydrationWarning>
                {new Date().toLocaleString()}
              </span>
            </p>
          </section>
        </div>
      )}
    </li>
  );
}
