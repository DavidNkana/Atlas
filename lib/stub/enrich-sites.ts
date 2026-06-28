/**
 * Day 21 v2 — enrich-sites-with-catalog.
 *
 * After the AI returns ranked_sites, this helper merges property-level
 * data from REAL_SITE_CATALOG into each site object when the AI's
 * site name matches a catalog entry (or its suburb does).
 *
 * Why this exists: Day 21 added cornerStand / facing / priceRange /
 * competition / arterial etc. to the catalog. But the AI models
 * (Tavily, Gemini Search, etc.) return their OWN site objects, not
 * catalog entries. Without this enrichment, users running a query
 * would see Gemini's output without the property data — even though
 * the data is right there in the catalog.
 *
 * The match algorithm:
 *   1. For each AI site, scan ALL 350 catalog entries across cities
 *      and verticals.
 *   2. Match if: catalog.name appears in site.name (case-insensitive)
 *      OR catalog.suburb appears in site.name (case-insensitive, only
 *      if suburb >= 4 chars).
 *   3. On match: copy the enriched fields onto the AI site object.
 *      The AI site keeps its rank/score/confidence/rationale/lat/lng —
 *      we only ADD the missing fields.
 *   4. Track which fields came from the catalog vs the AI so the UI
 *      can show "Sources: Property24 + OSM + Stats SA" attribution.
 *
 * Idempotent. Safe to call on any RankedSite[]. Pure function.
 */

import type { Vertical } from "@/lib/models/types";
import { REAL_SITE_CATALOG, type RealSite } from "./real-sites";

/**
 * Day 28 — supplement AI-ranked sites with catalog entries the AI
 * missed. The AI models (OpenRouter, Gemini) typically return 1-3
 * sites from their training data + reasoning. The curated stub has
 * 5-7 hand-curated sites per city×vertical. This function adds the
 * catalog sites the AI didn't mention, ranked below the AI results,
 * so the user always sees the full candidate set.
 */
export function supplementMissingCatalogSites<T extends { name: string; suburb?: string }>(
  sites: T[],
  cityName: string,
  vertical: string,
): T[] {
  // Normalise city display name → catalog key
  let catalogKey = cityName.toLowerCase().replace(/\s+/g, "_");
  let candidates = REAL_SITE_CATALOG[catalogKey]?.[vertical];

  // Day 28 hotfix v2: if direct catalog-key lookup fails (cityName is
  // a suburb like "Brooklyn"), try two fallbacks:
  //   a) Scan catalog entries for a matching name/suburb.
  //   b) Trust the caller to pass detectCity(question).id as cityName,
  //      which is already a valid catalog key.
  // Both are done here so the caller doesn't need catalog knowledge.
  if (!candidates) {
    const searchKey = cityName.toLowerCase().trim();
    for (const [cityKey, verticals] of Object.entries(REAL_SITE_CATALOG)) {
      const vertEntries = verticals[vertical];
      if (!vertEntries) continue;
      // Check if any site name or suburb contains the search key
      const found = vertEntries.some(
        (rs: RealSite) =>
          rs.name.toLowerCase().includes(searchKey) ||
          (rs.suburb && rs.suburb.toLowerCase().includes(searchKey))
      );
      if (found) {
        catalogKey = cityKey;
        candidates = REAL_SITE_CATALOG[catalogKey]?.[vertical];
        break;
      }
    }
    // If still no match, try the cityName as a catalog key for ALL
    // verticals (it might be a valid city key that has this vertical
    // but the key format didn't match due to casing/spacing).
    if (!candidates && REAL_SITE_CATALOG[catalogKey]) {
      // The city exists but this vertical doesn't — return empty.
      return sites;
    }
  }

  if (!candidates || candidates.length === 0) return sites;

  // Which catalog names are already in the AI results?
  const mentioned = new Set(
    sites.map((s) => s.name.toLowerCase().trim())
  );

  const missing = candidates.filter((c) => {
    const key = c.name.toLowerCase().trim();
    // Also check if the AI mentioned this site by suburb
    const bySuburb = sites.some(
      (s) => c.suburb && s.name.toLowerCase().includes(c.suburb.toLowerCase())
    );
    return !mentioned.has(key) && !bySuburb;
  });

  if (missing.length === 0) return sites;

  // Build stub-ranked-site objects for missing catalog entries.
  // Score them below the lowest AI score (or 0.5 if no AI sites).
  const lowestAiScore = sites.length > 0
    ? Math.min(...sites.map((s: any) => s.score ?? 0.8))
    : 0.8;
  const stubScore = Math.max(0.1, lowestAiScore - 0.15);

  const supplement = missing.map((rs: RealSite, i: number) => ({
    ...rs,
    rank: sites.length + i + 1,
    score: stubScore - i * 0.02,
    confidence: 0.5,
    signals: [],
    scoreBreakdown: {
      siteId: String(sites.length + i + 1),
      baseScore: stubScore - i * 0.02,
      signalScore: 0,
      confidence: 0.5,
      factors: [],
    },
    // Tag so the UI can show "From our catalog" badge
    _catalogSupplement: true,
  })) as unknown as T[];

  return [...sites, ...supplement];
}

interface EnrichedFields {
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
  suburb?: string;
}

/**
 * Walk the full REAL_SITE_CATALOG (all cities × verticals) and index
 * entries by searchable name fragments. Done once per request —
 * the catalog is small (~350 entries).
 */
function indexCatalog(): Array<{ name: string; suburb?: string; fields: EnrichedFields }> {
  const out: Array<{ name: string; suburb?: string; fields: EnrichedFields }> = [];
  for (const cityBlock of Object.values(REAL_SITE_CATALOG)) {
    for (const verticalEntries of Object.values(cityBlock)) {
      for (const entry of verticalEntries) {
        // Skip entries with no enriched data — there's nothing to add.
        if (
          !entry.cornerStand &&
          !entry.facing &&
          entry.plotSizeHectares == null &&
          !entry.priceRange &&
          !entry.competition
        ) {
          continue;
        }
        out.push({
          name: entry.name,
          suburb: entry.suburb,
          fields: {
            cornerStand: entry.cornerStand,
            facing: entry.facing,
            plotSizeHectares: entry.plotSizeHectares,
            priceRange: entry.priceRange,
            zoning: entry.zoning,
            titleType: entry.titleType,
            arterial: entry.arterial,
            nearestHighwayKm: entry.nearestHighwayKm,
            competition: entry.competition,
            medianIncome: entry.medianIncome,
            dataProvenance: entry.dataProvenance,
            suburb: entry.suburb,
          },
        });
      }
    }
  }
  return out;
}

/**
 * Try to match a single AI-returned site against the indexed catalog.
 * Returns the enriched fields if a match is found, or undefined.
 */
function findEnrichment(
  siteName: string,
  indexed: Array<{ name: string; suburb?: string; fields: EnrichedFields }>,
): { fields: EnrichedFields; matchedName: string } | undefined {
  const nameLower = siteName.toLowerCase();
  // Suburb-only match: if the AI site name includes "Constantia" or
  // "Bishopscourt" as a substring, match the catalog entry whose
  // name or suburb is the most specific match.
  for (const entry of indexed) {
    const catalogNameLower = entry.name.toLowerCase();
    // Exact substring match (most specific)
    if (nameLower.includes(catalogNameLower)) {
      return { fields: entry.fields, matchedName: entry.name };
    }
    // Suburb substring match (less specific but common)
    if (entry.suburb && entry.suburb.length >= 4) {
      const suburbLower = entry.suburb.toLowerCase();
      // Word-boundary check on the suburb so "Constantia" matches
      // "Constantia Upper" but not "Constantinople".
      const re = new RegExp(`\\b${suburbLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(nameLower)) {
        return { fields: entry.fields, matchedName: entry.name };
      }
    }
  }
  return undefined;
}

/**
 * Apply enrichment to a list of ranked_sites. Pure function —
 * does not mutate the input.
 */
export function enrichSitesWithCatalog<
  T extends { name: string; suburb?: string },
>(sites: T[]): T[] {
  if (sites.length === 0) return sites;
  const indexed = indexCatalog();
  return sites.map((site) => {
    const match = findEnrichment(site.name, indexed);
    if (!match) return site;
    // Merge: AI site's existing fields win. Only add catalog fields
    // the AI didn't provide.
    const merged: any = { ...site };
    for (const [k, v] of Object.entries(match.fields)) {
      if (v != null && (merged as any)[k] == null) {
        (merged as any)[k] = v;
      }
    }
    // Suburb: prefer the AI site's own suburb label, fall back to catalog
    if (merged.suburb == null && match.fields.suburb) {
      merged.suburb = match.fields.suburb;
    }
    return merged as T;
  });
}
