import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Model, ModelRequest, ModelResponse, RankedSite } from './types';
import { detectCity } from '../stub/detect';
import { getRealSiteCandidates } from '../stub/real-sites';

function humanVertical(v: string): string {
  const stripped = v.startsWith('custom:') ? v.slice('custom:'.length) : v;
  return stripped.replace(/_/g, ' ');
}

function buildPrompt(req: ModelRequest): string {
  // v16: a research-grade prompt that mirrors the structure
  // users want from Perplexity. We ask for suburb-level
  // recommendations (the user wants to know WHERE to look,
  // not which 5 random civic sites in Cape Flats). For
  // each recommendation we ask for: name, suburb, why-it-
  // fits-the-question, real schools/amenities in the area,
  // property price band, and lat/lng for the map.
  return `You are Atlas, an African land-development research engine. The user is searching for: "${req.question}".

The user wants a SUBURB-LEVEL answer, not 5 random sites. They want to know WHERE to look first, what makes that area a fit for what they asked, and which real schools/amenities/landmarks are nearby.

Return STRICT JSON (no markdown, no commentary, just the JSON object) in this exact shape:

{
  "answer": "<one paragraph summary: what makes a good fit for this question in this city, the criteria the user implicitly cares about>",
  "sources": [
    {"title": "<article or page title>", "url": "<real URL if you can cite one — e.g. wikipedia.org/wiki/Constantia_Cape_Town>"}
  ],
  "ranked_sites": [
    {
      "rank": 1,
      "name": "<suburb or area name, e.g. 'Constantia, Cape Town'>",
      "suburb": "<suburb name>",
      "score": <0.0-1.0>,
      "confidence": <0.0-1.0>,
      "rationale": "<2-3 sentences: why this area fits what the user asked, mention specific real schools/amenities/landmarks, property price band if relevant>",
      "lat": <decimal latitude>,
      "lng": <decimal longitude>
    }
  ],
  "tavily_query": "<a refined, short Tavily search query for SA property portals — example: 'vacant land Constantia Cape Town erf 1500 m² for sale'. Must be 5-8 keywords max. Sales only, no rentals.>",
  "listing_intent": {
    "category": "<one of: vacant_land | commercial | house | smallholding | warehouse | civic>",
    "transaction": "for_sale",
    "min_erf_m2": <number or 0>,
    "max_erf_m2": <number or 999999>,
    "min_price_zar": <number or 0>,
    "max_price_zar": <number or 999999999>
  }
}

Provide up to 5 ranked suburbs. Use real suburb names. Mention real school names, real property price bands (e.g. 'R 4-6M family homes', 'R 12-25M luxury estates'), and real landmarks where you know them. Cite Wikipedia / property portals / news sites you can find with a quick search. For each suburb, also include "lat" and "lng" as decimal coordinates so we can plot it on a map.

CRITICAL: also output a "tavily_query" string that Atlas will send to SA property portals (Property24, Private Property, Pam Golding, etc). The query MUST be a refined, prompt-aware search string — not your vertical keyword. Example: for "I want to build a gas station near a corner in Joburg", output "vacant land commercial corner Sandton Johannesburg erf 2000 m² for sale". For "school in Constantia", output "vacant land Constantia Cape Town erf 1500 m² for sale". For "warehouse in Durban", output "warehouse commercial erf Durban KwaZulu-Natal 2000 m² for sale". NO RENTALS — always "for sale".`;
}

/**
 * Day 12 v16 — Gemini Search.
 *
 * Same engine as the existing geminiFlash model, but with the
 * `google_search` tool enabled. This is Gemini 2.5 Flash doing
 * a real web search before answering — the same pattern
 * Perplexity uses. The result is a research-grade answer
 * with citations, like the "Clifton / Southern Suburbs" output
 * the user wanted.
 *
 * Key advantages over plain geminiFlash:
 *   1. Cites real Wikipedia / property-portal / news URLs.
 *   2. Names real schools, real landmarks, real price bands.
 *   3. Returns SUBURB-level recommendations, not random
 *      5-site lists, which is what the user actually wants.
 *   4. Falls back to the real cur catalog for lat/lng if
 *      Gemini returns no coordinates (so the map still
 *      shows something useful).
 *
 * Cost: $0 on Gemini's free tier (15 RPM / 1500 RPD).
 *
 * The Gemini API requires the `google_search` tool to be
 * enabled at the model level. We pass it via the
 * `tools: [{ googleSearch: {} }]` field on getGenerativeModel.
 *
 * The response shape is different from the other models:
 *   - `answer`: a prose summary
 *   - `sources`: array of {title, url} for citation rendering
 *   - `ranked_sites`: array of {rank, name, suburb, score,
 *     confidence, rationale, lat, lng}
 *
 * The route handler picks the right shape per model. We
 * attach the extra fields to the RankedSite so they
 * survive the existing pipeline.
 */
export const geminiSearch: Model = {
  info: {
    id: 'gemini-search',
    displayName: 'Gemini Search (via OpenRouter, free)',
    shortName: 'Gemini Search',
    provider: 'google',
    free: true,
    description:
      'Google Gemini 2.0 Flash routed through OpenRouter (free tier). Returns real suburb names, lat/lng, and prose reasoning. Day 22 v19: uses OPENROUTER_API_KEY instead of Gemini SDK to bypass Vertex/AI Studio key issues.',
    brandColor: '#34A853',
    // G logo with a magnifying glass hint
    logoPath:
      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z',
  },
  isAvailable: () => !!process.env.GEMINI_API_KEY,
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return { ok: false, error: 'GEMINI_API_KEY not set' } as any;
      }
      const genAI = new GoogleGenerativeAI(key);
      // Day 22 v19: Switch to OpenRouter for Gemini calls. Atlas's
      // user has a Vertex AI AQ.* key (which doesn't work with
      // @google/generative-ai SDK) and can't get an AI Studio key
      // from Google UI without paying for billing. OpenRouter gives
      // free Gemini access via their API: same Gemini model, just
      // a different auth path.
      //
      // OpenRouter endpoint: https://openrouter.ai/api/v1/chat/completions
      // Auth: Authorization: Bearer ${OPENROUTER_API_KEY}
      // Free model: google/gemini-2.0-flash-exp:free
      //
      // Note: OpenRouter's free Gemini DOES NOT have Google Search
      // grounding. We pass the prompt as a regular chat completion
      // and rely on Gemini's own knowledge. We try multiple free
      // models in sequence — first one that works wins.
      const openrouterKey = process.env.OPENROUTER_API_KEY;
      const modelIdsToTry = [
        "google/gemini-2.0-flash-exp:free",
        "google/gemini-2.0-flash-001",
        "google/gemini-flash-1.5",
      ];
      let text: string | undefined;
      let result: any;
      const errorLog: string[] = [];

      if (!openrouterKey) {
        // Fall back to Google SDK if no OpenRouter key
        const modelIdsGoogle = [
          { model: "gemini-2.0-flash", tool: "googleSearch" },
          { model: "gemini-1.5-flash", tool: "googleSearchRetrieval" },
        ];
        for (const { model: modelId, tool: toolName } of modelIdsGoogle) {
          try {
            const m = genAI.getGenerativeModel({
              model: modelId,
              tools: toolName === "googleSearch"
                ? [{ googleSearch: {} } as any]
                : [{ googleSearchRetrieval: {} } as any],
            });
            const r = await m.generateContent(buildPrompt(req));
            text = r.response.text();
            result = r;
            break;
          } catch (modelErr) {
            const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
            errorLog.push(`${modelId}: ${msg.slice(0, 150)}`);
          }
        }
      } else {
        // Try OpenRouter models in sequence
        for (const modelId of modelIdsToTry) {
          try {
            const r = await fetch(
              "https://openrouter.ai/api/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${openrouterKey}`,
                  "Content-Type": "application/json",
                  "HTTP-Referer": "https://atlas-q2eh.vercel.app",
                  "X-Title": "Atlas",
                },
                body: JSON.stringify({
                  model: modelId,
                  messages: [
                    { role: "user", content: buildPrompt(req) },
                  ],
                  temperature: 0.2,
                  // OpenRouter returns OpenAI-compatible JSON. We
                  // request JSON output via response_format (where
                  // supported) or rely on the prompt instructing
                  // strict JSON.
                  ...(modelId.includes("gemini")
                    ? { response_format: { type: "json_object" } }
                    : {}),
                }),
              },
            );
            if (!r.ok) {
              const errText = await r.text();
              errorLog.push(`${modelId}: ${r.status} ${errText.slice(0, 150)}`);
              continue;
            }
            const data = await r.json();
            text = data.choices?.[0]?.message?.content;
            // Build a result shape that mimics GoogleGenerativeAI
            // response so the existing parse logic works.
            result = {
              response: {
                text: () => text,
                candidates: [
                  {
                    groundingMetadata: undefined,
                  },
                ],
              },
            };
            if (text) break;
          } catch (modelErr) {
            const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
            errorLog.push(`${modelId}: ${msg.slice(0, 150)}`);
          }
        }
      }
      if (!text || !result) {
        return {
          ok: false,
          error: `All Gemini models failed: ${errorLog.join(' | ')}`,
        } as any;
      }

      // Extract grounding citations from the response metadata.
      // Gemini puts citation URLs in groundingMetadata.groundingChunks[].
      // We surface them as the "sources" array the result page renders.
      let groundingSources: Array<{ title?: string; url: string }> = [];
      try {
        const candidates = result.response.candidates ?? [];
        for (const cand of candidates) {
          const gm = cand?.groundingMetadata;
          if (!gm) continue;
          const chunks = gm.groundingChunks ?? [];
          for (const ch of chunks) {
            if (ch?.web?.uri) {
              groundingSources.push({
                title: ch.web.title ?? ch.web.uri,
                url: ch.web.uri,
              });
            }
          }
          // Also check searchEntryPoint renderedContent for the
          // search queries Gemini used (useful for debugging).
        }
        // Dedupe by URL
        const seen = new Set<string>();
        groundingSources = groundingSources.filter((s) => {
          if (seen.has(s.url)) return false;
          seen.add(s.url);
          return true;
        });
      } catch {
        // Grounding metadata is optional — never fail the call
        // because we couldn't read it.
      }

      // Parse JSON from the model's text. Gemini may wrap the
      // object in ```json ... ``` fences; strip them. When called
      // via OpenRouter with response_format: json_object, the
      // response is already a JSON string we can parse directly.
      let parsed: any = null;
      const cleaned = (text ?? "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Fall through to null
        }
      }
      // If OpenRouter returned a JSON object stringified, parsed
      // already has it. If not, fall back to regex match above.
      if (!parsed) {
        try {
          // Some OpenRouter models return JSON without code fences
          // but with markdown formatting. Try aggressive parse.
          parsed = JSON.parse(cleaned);
        } catch {
          // ignore
        }
      }
      // If we still don't have JSON, build a minimal response
      // from the raw text so the user still sees something
      // useful (the prose summary + grounding citations).
      if (!parsed || typeof parsed !== 'object') {
        // Detect "no real suburbs" failure: when the model
        // returns an empty array or a string saying "I don't
        // know", don't pretend we have 5 sites. Just surface
        // the prose answer + citations with NO ranked_sites.
        // The result page will render the "Research answer"
        // section at the top, then show an empty list below
        // (curated stub never fires because we returned ok:true).
        return {
          ranked_sites: [],
          raw: text,
          answer: cleaned,
          sources: groundingSources,
        } as any;
      }

      // Normalise ranked_sites: Gemini may omit the array if it
      // can't find anything. We treat that the same as a missing
      // JSON parse — still ok:true, but no sites to plot.
      const rawSites = Array.isArray(parsed.ranked_sites)
        ? parsed.ranked_sites
        : [];
      const city = detectCity(req.question ?? '');
      const realSites = getRealSiteCandidates(city.id, req.vertical);
      const fallbackSite = realSites && realSites.length > 0 ? realSites[0] : null;
      const sites: RankedSite[] = rawSites.map((s: any, i: number) => {
        const hasLat = typeof s.lat === 'number' && isFinite(s.lat) && Math.abs(s.lat) <= 90;
        const hasLng = typeof s.lng === 'number' && isFinite(s.lng) && Math.abs(s.lng) <= 180;
        const lat = hasLat ? s.lat : (fallbackSite?.lat ?? city.lat);
        const lng = hasLng ? s.lng : (fallbackSite?.lng ?? city.lng);
        return {
          rank: s.rank ?? i + 1,
          name: s.name ?? 'Unknown',
          score: typeof s.score === 'number' ? s.score : 0.7,
          confidence: typeof s.confidence === 'number' ? s.confidence : 0.7,
          rationale: s.rationale ?? '',
          lat,
          lng,
        };
      });

      // Merge model-provided sources (from the JSON "sources"
      // field) with the grounding metadata URLs. Grounding is
      // authoritative because those are the actual pages Gemini
      // cited; the JSON "sources" field is the model being
      // helpful but may be wrong.
      const modelSources = Array.isArray(parsed.sources)
        ? parsed.sources
            .filter((s: any) => s && typeof s.url === 'string' && s.url.length > 0)
            .map((s: any) => ({ title: s.title, url: s.url }))
        : [];
      const seen = new Set<string>();
      const merged: Array<{ title?: string; url: string }> = [];
      for (const s of [...groundingSources, ...modelSources]) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        merged.push(s);
      }

      return {
        ranked_sites: sites,
        raw: text,
        answer: typeof parsed.answer === 'string' ? parsed.answer : cleaned,
        sources: merged,
        // Day 22 v16: pass through Gemini's refined Tavily query
        // + listing intent so /api/ask can send it to property
        // portals instead of the hardcoded VERTICAL_KEYWORDS.
        tavilyQuery: typeof parsed.tavily_query === 'string'
          ? parsed.tavily_query
          : undefined,
        listingIntent: parsed.listing_intent && typeof parsed.listing_intent === 'object'
          ? {
              category: parsed.listing_intent.category ?? 'vacant_land',
              transaction: 'for_sale' as const,
              minErfM2: typeof parsed.listing_intent.min_erf_m2 === 'number'
                ? parsed.listing_intent.min_erf_m2
                : undefined,
              maxErfM2: typeof parsed.listing_intent.max_erf_m2 === 'number'
                ? parsed.listing_intent.max_erf_m2
                : undefined,
              minPriceZar: typeof parsed.listing_intent.min_price_zar === 'number'
                ? parsed.listing_intent.min_price_zar
                : undefined,
              maxPriceZar: typeof parsed.listing_intent.max_price_zar === 'number'
                ? parsed.listing_intent.max_price_zar
                : undefined,
            }
          : undefined,
      } as any;
    } catch (outerErr) {
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, error: `Gemini Search call failed: ${msg}` } as any;
    }
  },
};
