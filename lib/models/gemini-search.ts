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
  ]
}

Provide up to 5 ranked suburbs. Use real suburb names. Mention real school names, real property price bands (e.g. 'R 4-6M family homes', 'R 12-25M luxury estates'), and real landmarks where you know them. Cite Wikipedia / property portals / news sites you can find with a quick search. For each suburb, also include "lat" and "lng" as decimal coordinates so we can plot it on a map.`;
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
    displayName: 'Gemini Search (Perplexity-style, free)',
    shortName: 'Gemini Search',
    provider: 'google',
    free: true,
    description:
      'Google Gemini 2.5 Flash with Google Search grounding. Returns real web citations, real school names, real property prices. Free tier: 15 RPM / 1500 RPD. Best for research-grade answers.',
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
      // The google_search tool is what enables Perplexity-style
      // real-time web grounding. Without it, Gemini answers from
      // training data only. With it, Gemini searches Google
      // before answering and cites the sources in the response.
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        tools: [{ googleSearch: {} }] as any,
        generationConfig: { responseMimeType: 'application/json' },
      });
      let text: string;
      try {
        const result = await model.generateContent(buildPrompt(req));
        text = result.response.text();
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        return { ok: false, error: `Gemini Search request failed: ${msg}` } as any;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        return { ok: false, error: `Gemini Search returned non-JSON: ${msg}` } as any;
      }
      if (!parsed || !Array.isArray(parsed.ranked_sites)) {
        return { ok: false, error: 'Gemini Search response missing ranked_sites array' } as any;
      }
      // v16: validate lat/lng. Gemini sometimes returns suburbs
      // without coordinates. Fall back to the city centre or the
      // nearest real catalog site so the map still shows
      // something useful instead of nothing.
      const city = detectCity(req.question ?? '');
      const realSites = getRealSiteCandidates(city.id, req.vertical);
      const fallbackSite = realSites && realSites.length > 0 ? realSites[0] : null;
      const sites: RankedSite[] = parsed.ranked_sites.map((s: any, i: number) => {
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
      // Attach the research answer + sources to the result so
      // the result page can render them. We use the raw field
      // to pass the full JSON through; the route handler
      // already supports reading the answer + sources off the
      // response body.
      return {
        ranked_sites: sites,
        raw: text,
        // Extra fields consumed by the result page:
        answer: parsed.answer,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      } as any;
    } catch (outerErr) {
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, error: `Gemini Search call failed: ${msg}` } as any;
    }
  },
};
