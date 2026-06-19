/**
 * Day 17 v1 — Lenient model output parser.
 *
 * The previous parsers (in google.ts, openrouter.ts, gemini-search.ts,
 * tavily.ts, perplexity.ts) all had the same bug: they returned
 * `{ ok: false }` when the model produced prose WITHOUT a structured
 * `ranked_sites` JSON array. This caused 80% of queries to cascade
 * to curated-stub even when the model was working fine.
 *
 * Example failure: Gemini returns "Cape Town's civic sites are in
 * Observatory, Maitland, and Goodwood because..." — beautiful answer,
 * wrong shape. Parser rejects. Model marked as failed. Cascade to
 * next model. After 5 cascades, curated stub fires.
 *
 * The new lenient parser:
 *
 *   1. Try to extract a strict JSON `ranked_sites` array (old behaviour).
 *      If we get ≥1 site with name + lat + lng, treat as ok.
 *
 *   2. If no JSON, scan the prose for "Place, Suburb" / "Place, City"
 *      patterns and try to geocode them via the REAL_SITE_CATALOG
 *      (which has 350 known place names + coords for 7 cities). If
 *      we can find ≥1 place in our catalog, return it as a partial
 *      result with status="parsed_text_fallback" so the UI knows
 *      the model worked but extraction was heuristic.
 *
 *   3. If prose has at least 1 place name match, return ok:true
 *      with the parsed sites + the prose answer in the modelAnswer
 *      field so the user sees BOTH the map AND the AI's reasoning.
 *
 *   4. Only return ok:false if BOTH JSON extraction AND prose
 *      extraction fail. (Down from "any of these fail" → "all fail".)
 *
 * Why this matters for the developer demo: developers were seeing
 * 8/10 queries land on curated stub even though 3/4 research
 * models were healthy. Most of those "failures" were beautiful
 * prose answers that the strict parser couldn't shape into JSON.
 */

import type { RankedSite } from "@/lib/models/types";
import { REAL_SITE_CATALOG } from "@/lib/stub/real-sites";

export type LenientParseResult =
  | {
      ok: true;
      ranked_sites: RankedSite[];
      status: "strict_json" | "parsed_text";
      extractedCount: number;
      raw: string;
    }
  | {
      ok: false;
      error: string;
      raw: string;
    };

/**
 * Parse a model's text output and return ranked sites. Tries strict
 * JSON first, then heuristic prose extraction.
 */
export function parseModelOutput(
  text: string,
  cityKey: string | null,
): LenientParseResult {
  if (!text || typeof text !== "string") {
    return { ok: false, error: "empty or non-string response", raw: text ?? "" };
  }

  // 1. Strict JSON extraction.
  const strictResult = tryExtractStrictJson(text);
  if (strictResult.ok && strictResult.ranked_sites.length > 0) {
    return {
      ok: true,
      ranked_sites: strictResult.ranked_sites,
      status: "strict_json",
      extractedCount: strictResult.ranked_sites.length,
      raw: text,
    };
  }

  // 2. Heuristic prose extraction against REAL_SITE_CATALOG.
  const proseResult = tryExtractFromProse(text, cityKey);
  if (proseResult.ok && proseResult.ranked_sites.length > 0) {
    return {
      ok: true,
      ranked_sites: proseResult.ranked_sites,
      status: "parsed_text",
      extractedCount: proseResult.ranked_sites.length,
      raw: text,
    };
  }

  // 3. Total failure — return the raw text anyway so the UI can
  // show "model answered but we couldn't parse it" rather than
  // silently cascading to stub.
  return {
    ok: false,
    error: strictResult.ok
      ? "no parseable sites in prose"
      : "no ranked_sites in JSON, no parseable sites in prose",
    raw: text,
  };
}

/** Try to extract strict JSON `ranked_sites` array from text. */
function tryExtractStrictJson(
  text: string,
): { ok: boolean; ranked_sites: RankedSite[] } {
  // Look for JSON block, possibly inside ```json fences.
  const jsonMatch =
    text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ??
    text.match(/(\{[\s\S]*"ranked_sites"[\s\S]*\})/);
  if (!jsonMatch) return { ok: false, ranked_sites: [] };

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (!Array.isArray(parsed?.ranked_sites)) {
      return { ok: false, ranked_sites: [] };
    }
    const sites = parsed.ranked_sites
      .filter(
        (s: any) =>
          s &&
          typeof s.name === "string" &&
          s.name.length > 0 &&
          typeof s.lat === "number" &&
          typeof s.lng === "number",
      )
      .slice(0, 5)
      .map((s: any, i: number) => ({
        rank: typeof s.rank === "number" ? s.rank : i + 1,
        name: s.name,
        suburb: typeof s.suburb === "string" ? s.suburb : undefined,
        score: typeof s.score === "number" ? s.score : 0.5,
        confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
        rationale: typeof s.rationale === "string" ? s.rationale : "",
        lat: s.lat,
        lng: s.lng,
      }));
    return { ok: sites.length > 0, ranked_sites: sites };
  } catch {
    return { ok: false, ranked_sites: [] };
  }
}

/**
 * Heuristic: find known REAL_SITE_CATALOG place names mentioned in
 * the prose. Returns them as ranked sites with coords from the catalog.
 *
 * The catalog shape is `REAL_SITE_CATALOG[cityId][vertical] = RealSite[]`.
 * We flatten all cities (or just the user's city if known) into one
 * candidate list and word-boundary match each name against the prose.
 */
function tryExtractFromProse(
  text: string,
  cityKey: string | null,
): { ok: boolean; ranked_sites: RankedSite[] } {
  const lower = text.toLowerCase();
  const matches: RankedSite[] = [];
  const seen = new Set<string>();

  // Flatten the catalog. If we know the city, scan just that city's
  // entries (faster, fewer false positives).
  let candidates: any[] = [];
  if (cityKey && REAL_SITE_CATALOG[cityKey]) {
    candidates = Object.values(REAL_SITE_CATALOG[cityKey]).flat() as any[];
  } else {
    candidates = Object.values(REAL_SITE_CATALOG)
      .map((cityBlock) => Object.values(cityBlock))
      .flat(2) as any[];
  }

  for (const entry of candidates) {
    const name = String(entry?.name ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    // Skip very short names (high false-positive rate).
    if (name.length < 4) continue;

    // Word-boundary case-insensitive match on the place name.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) {
      matches.push({
        rank: matches.length + 1,
        name,
        suburb: entry.suburb ?? undefined,
        score: 0.6,
        confidence: 0.5,
        rationale: entry.rationale ?? "Mentioned by AI in research answer",
        lat: entry.lat,
        lng: entry.lng,
      });
      seen.add(name.toLowerCase());
      if (matches.length >= 5) break;
    }
  }

  return { ok: matches.length > 0, ranked_sites: matches };
}
