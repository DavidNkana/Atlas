/**
 * Day 22 v17 — AI Listing Evaluator.
 *
 * Runs AFTER Tavily returns raw listings, BEFORE they reach the UI.
 * Takes the user's prompt criteria + each listing and asks Gemini
 * to score match quality. Listings that don't meet criteria (e.g.
 * "apartment, not whole property" when user wants a gas station)
 * are filtered out.
 *
 * This is what Perplexity does: read each listing's content and
 * evaluate against the user's stated criteria. Without this,
 * Atlas shows every match, even unrelated apartments or offices.
 *
 * Why Gemini Search? Same model, same free tier, parallel batched
 * call. Costs ~1 credit per batch (50 listings at once).
 */

import type { LiveListing } from "./tavily-listings";
import { detectCity } from "../stub/detect";

interface EvalResult {
  id: string;
  matchScore: number;
  matchReasons: string[];
  disqualifyReason?: string;
  propertyType: string;
}

/**
 * Run Gemini over a batch of listings + user's criteria.
 * Returns scored evaluations.
 */
export async function evaluateListingsAgainstCriteria(
  userPrompt: string,
  listings: LiveListing[],
  apiKey: string | undefined,
): Promise<Map<string, EvalResult>> {
  if (!apiKey || listings.length === 0) return new Map();
  const city = detectCity(userPrompt);

  // Compact listing shape for the prompt — keep small so we fit
  // 50 listings per Gemini call. id, title, suburb, address,
  // price, erfSize, snippet (first 200 chars).
  const compactListings = listings.slice(0, 50).map((l) => ({
    id: l.id,
    portal: l.portal,
    title: l.title?.slice(0, 200) ?? "",
    suburb: l.suburb ?? "",
    address: l.address?.slice(0, 200) ?? "",
    price: l.price ?? "",
    erfSize: l.erfSize ?? "",
    snippet: l.snippet?.slice(0, 200) ?? "",
    url: l.url,
  }));

  const systemPrompt = `You are an AI real-estate analyst. The user is looking for: "${userPrompt}"

Evaluate each listing below against the user's criteria. Score each on:
- matchScore (0.0-1.0): how well it fits what the user actually wants
- matchReasons: short bullet points explaining why it matches
- disqualifyReason: if matchScore < 0.4, why it doesn't fit (e.g.
  "1-bedroom apartment when user wants whole property")
- propertyType: short label like "vacant land", "house",
  "apartment", "office", "townhouse", "farm", "warehouse"

Reject listings that are:
- Rentals (user wants to BUILD, not rent)
- Apartment units (user wants whole properties to develop)
- Houses that are clearly residential-only with no commercial potential
- Listings in wrong city when user specified a city
- Off-topic property types (e.g. user wants gas station, listing is school)

Keep responses as strict JSON array, one object per listing, same
id order as input. No commentary.`;

  const userMessage = JSON.stringify(compactListings);

  try {
    // Use Gemini 2.0-flash via GoogleGenerativeAI SDK (same pattern
    // as gemini-search.ts). Try models in sequence.
    const modelIds = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash"];
    let text: string | undefined;
    for (const modelId of modelIds) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: systemPrompt + "\n\nListings:\n" + userMessage }] },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.warn(`[listing-evaluator] ${modelId} ${res.status}: ${err.slice(0, 200)}`);
          continue;
        }
        const data = await res.json();
        text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) break;
      } catch (modelErr) {
        console.warn(`[listing-evaluator] ${modelId} failed:`, modelErr);
      }
    }
    if (!text) return new Map();

    // Parse the JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return new Map();
    let parsed: any[];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return new Map();
    }
    if (!Array.isArray(parsed)) return new Map();

    const resultMap = new Map<string, EvalResult>();
    for (const row of parsed) {
      if (typeof row?.id !== "string") continue;
      const score = typeof row?.matchScore === "number" ? row.matchScore : 0;
      const reasons = Array.isArray(row?.matchReasons) ? row.matchReasons.filter((s: any) => typeof s === "string") : [];
      const disq = typeof row?.disqualifyReason === "string" ? row.disqualifyReason : undefined;
      const ptype = typeof row?.propertyType === "string" ? row.propertyType : "unknown";
      resultMap.set(row.id, {
        id: row.id,
        matchScore: score,
        matchReasons: reasons,
        disqualifyReason: disq,
        propertyType: ptype,
      });
    }
    return resultMap;
  } catch (err) {
    console.error("[listing-evaluator] failed:", err);
    return new Map();
  }
}

/**
 * Apply evaluation to listings. Returns the original listings
 * with added matchScore/matchReasons/disqualifyReason fields.
 * Listings with score < 0.4 are dropped by default.
 */
export function applyEvaluation(
  listings: LiveListing[],
  evaluations: Map<string, EvalResult>,
  options: { minScore?: number } = {},
): LiveListing[] {
  const minScore = options.minScore ?? 0.4;
  return listings
    .map((l) => {
      const evalResult = evaluations.get(l.id);
      if (!evalResult) return l;
      return {
        ...l,
        matchScore: evalResult.matchScore,
        matchReasons: evalResult.matchReasons,
        disqualifyReason: evalResult.disqualifyReason,
        propertyType: evalResult.propertyType,
      };
    })
    .filter((l) => {
      const evalResult = evaluations.get(l.id);
      if (!evalResult) return true; // no eval = keep (better than nothing)
      return evalResult.matchScore >= minScore;
    })
    .sort((a, b) => {
      const aScore = (a as any).matchScore ?? 0;
      const bScore = (b as any).matchScore ?? 0;
      return bScore - aScore;
    });
}
