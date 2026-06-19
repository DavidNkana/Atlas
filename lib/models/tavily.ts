import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Model, ModelRequest, ModelResponse, RankedSite } from './types';
import { detectCity } from '../stub/detect';
import { getRealSiteCandidates } from '../stub/real-sites';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  score?: number;
}

interface TavilyResponse {
  query: string;
  results: TavilyResult[];
  answer?: string;
}

function humanVertical(v: string): string {
  const stripped = v.startsWith('custom:') ? v.slice('custom:'.length) : v;
  return stripped.replace(/_/g, ' ');
}

/**
 * Day 12 v23 — Tavily + Gemini Flash synthesis.
 *
 * Day 17 v2 — switched synthesis model from gemini-1.5-flash to
 * gemini-2.0-flash. David's Vercel Gemini key has confirmed free-tier
 * access to 2.0-flash but 1.5-flash hits 429 quota exhausted. This was
 * the silent failure mode that made Atlas cascade from "Tavily picked"
 * to gemini-search even though Tavily itself was returning data.
 *
 * Day 17 v2 — also added a Tavily-answer-only path that returns
 * ok:true with Tavily's own answer + sources + site matches from
 * REAL_SITE_CATALOG, even when Gemini synthesis is unavailable.
 * This means Atlas now ALWAYS returns Tavily's answer when Tavily
 * succeeded, regardless of Gemini quota state.
 *
 * Two-step model that gives Atlas Perplexity-style answers even
 * when the Gemini Search grounding tool is rate-limited:
 *
 *   1. POST https://api.tavily.com/search with the question.
 *      Tavily returns up to 5 web results with title, url, content.
 *   2. (optional) Feed those results to Gemini 2.0 Flash as
 *      context. Ask Gemini to produce the same Perplexity-shape
 *      JSON: answer paragraph + ranked_sites + sources.
 *      If this step fails (quota, network, etc.), we still
 *      return Tavily's own answer + sources + REAL_SITE_CATALOG
 *      matches. Never cascade.
 *
 * The Tavily search gives us real, current web data (Wikipedia,
 * property portals, news). 2.0 Flash has the cheapest free tier
 * of the Gemini family. We use it just to structure the Tavily
 * results into Atlas's shape.
 *
 * Why this works even when Gemini Search fails: this path uses
 * 2.0-flash without the grounding tool (so no 429 from
 * generate_content_free_tier). Tavily does the search; Gemini
 * does the formatting. Both have generous free tiers.
 *
 * Tavily free tier: 1,000 credits/month, no card.
 *   1 search = 1 credit. 1 user question = 1 search.
 *   1,000 questions/month = ~33/day = plenty for Atlas demo.
 *
 * The model returns the same Perplexity-style shape as
 * gemini-search: {answer, sources[], ranked_sites[]}.
 */
async function callTavilySearch(query: string, apiKey: string): Promise<TavilyResponse> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      include_answer: true,
      max_results: 5,
      include_raw_content: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavily search HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TavilyResponse;
}

/**
 * Day 17 v2 — Build an ok:true response from Tavily data alone,
 * used when Gemini synthesis is unavailable. We extract site names
 * from Tavily result titles + URLs by matching against the REAL_SITE_CATALOG.
 *
 * This is the key fix: previously a Gemini 1.5-flash quota error
 * meant the whole Tavily model returned ok:false, even though
 * Tavily itself had done the real research. Now Atlas returns
 * Tavily's answer + the real place names Tavily mentioned + the
 * clickable web sources. The developer sees a real Perplexity-style
 * answer instead of "fall back to gemini-search".
 */
function buildTavilyOnlyResponse(
  req: ModelRequest,
  tavily: TavilyResponse,
): {
  ranked_sites: RankedSite[];
  raw: string;
  answer: string;
  sources: Array<{ title?: string; url: string }>;
  extractionStatus: string;
} {
  const city = detectCity(req.question ?? '');
  const realSites = getRealSiteCandidates(city.id, req.vertical) ?? [];
  const seen = new Set<string>();
  const sites: RankedSite[] = [];

  // Try to extract site names from Tavily titles + URLs by matching
  // against REAL_SITE_CATALOG.
  const haystack = [
    tavily.answer ?? "",
    ...tavily.results.map((r) => `${r.title} ${r.url}`),
  ].join(" \n ").toLowerCase();

  for (const entry of realSites) {
    const name = String(entry?.name ?? "").trim();
    if (!name || name.length < 4 || seen.has(name.toLowerCase())) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(haystack)) {
      sites.push({
        rank: sites.length + 1,
        name,
        suburb: entry.suburb,
        score: 0.7,
        confidence: 0.6,
        rationale: entry.rationale ?? "Mentioned by Tavily in research answer",
        lat: entry.lat,
        lng: entry.lng,
      });
      seen.add(name.toLowerCase());
      if (sites.length >= 5) break;
    }
  }

  // If we found 0 catalog matches, fall back to first 5 catalog sites
  // so the map has something to render. The rationale makes clear
  // these are Atlas-curated because we couldn't extract from Tavily.
  if (sites.length === 0 && realSites.length > 0) {
    for (const entry of realSites.slice(0, 5)) {
      sites.push({
        rank: sites.length + 1,
        name: String(entry.name),
        suburb: entry.suburb,
        score: 0.5,
        confidence: 0.4,
        rationale: `Atlas-curated fallback. Tavily research is available above (see "Research answer" panel) but no specific place names matched the ${city.name} catalog.`,
        lat: entry.lat,
        lng: entry.lng,
      });
    }
  }

  const sources = tavily.results.map((r) => ({ title: r.title, url: r.url }));
  const raw = JSON.stringify({
    tavilyAnswer: tavily.answer,
    tavilyResults: tavily.results.map((r) => ({ title: r.title, url: r.url })),
    extractedSites: sites.map((s) => s.name),
  });

  return {
    ranked_sites: sites,
    raw,
    answer: tavily.answer ?? `Tavily returned ${tavily.results.length} web sources for "${req.question}".`,
    sources,
    extractionStatus: "tavily_only_synthesis_failed",
  };
}

function buildSynthesisPrompt(req: ModelRequest, tavily: TavilyResponse): string {
  const contextLines = tavily.results
    .map(
      (r, i) =>
        `[${i + 1}] TITLE: ${r.title}\n    URL: ${r.url}\n    CONTENT: ${r.content.slice(0, 600)}`,
    )
    .join('\n\n');
  return `You are Atlas, an African land-development research engine. The user is searching for: "${req.question}".

You have REAL WEB SEARCH RESULTS from Tavily below. Synthesise them into a research-grade answer for an African land developer / property investor. Use real place names, real school names, real property prices, real suburb names. Mention specific landmarks when the source mentions them.

WEB SEARCH RESULTS (from Tavily, last 24-48h):
${contextLines}

Return STRICT JSON (no markdown, no commentary, just the JSON object) in this exact shape:

{
  "answer": "<one paragraph summary: what makes a good fit for this question in this city, the criteria the user implicitly cares about>",
  "sources": [
    {"title": "<article or page title>", "url": "<real URL from the Tavily results above>"}
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

Provide up to 5 ranked suburbs. Use real suburb names. Cite the actual URLs from the Tavily results (do not invent URLs). For each suburb, also include "lat" and "lng" as decimal coordinates so we can plot it on a map. If the sources don't give you exact coordinates, estimate from your knowledge of the suburb.`;
}

export const tavily: Model = {
  info: {
    id: 'tavily',
    displayName: 'Tavily + Gemini (Perplexity-style, free)',
    shortName: 'Tavily',
    provider: 'openrouter', // uses Gemini flash but goes through Tavily for the search
    free: true,
    description:
      'Tavily real-time web search (1,000 credits/month free, no card) + Gemini Flash for synthesis. Returns real web citations, real school names, real property prices. Best alternative when Gemini Search grounding is rate-limited.',
    brandColor: '#1F6FEB',
    // T shape
    logoPath:
      'M5 4h14v3h-4v13h-6V7H5V4z',
  },
  isAvailable: () => !!(process.env.TAVILY_API_KEY && process.env.GEMINI_API_KEY),
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    try {
      const tavilyKey = process.env.TAVILY_API_KEY;
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!tavilyKey) {
        return { ok: false, error: 'TAVILY_API_KEY not set' } as any;
      }
      if (!geminiKey) {
        return { ok: false, error: 'GEMINI_API_KEY not set' } as any;
      }

      // Step 1: Tavily search.
      let tavily: TavilyResponse;
      try {
        tavily = await callTavilySearch(req.question, tavilyKey);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `Tavily search failed: ${msg}` } as any;
      }
      if (!tavily.results || tavily.results.length === 0) {
        return { ok: false, error: 'Tavily returned 0 results' } as any;
      }

      // Step 2: Gemini 2.0 Flash synthesis (optional). Day 17 v2:
      // if this fails, we still return ok:true with Tavily's own
      // answer + sources + REAL_SITE_CATALOG matches below.
      // Previously a Gemini failure here meant the whole model
      // returned ok:false and cascaded to gemini-search — even
      // though Tavily had already done the real work.
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
      });
      let text: string;
      try {
        const result = await model.generateContent(buildSynthesisPrompt(req, tavily));
        text = result.response.text();
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        // Day 17 v2: graceful degradation. Tavily succeeded; don't
        // throw away the data. Return Tavily's own answer + sources
        // + REAL_SITE_CATALOG matches.
        console.warn(
          `[tavily] Gemini synthesis failed (${msg}); returning Tavily answer + catalog matches`,
        );
        return buildTavilyOnlyResponse(req, tavily) as any;
      }

      // Parse JSON from the model's text.
      let parsed: any = null;
      const cleaned = (text ?? '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Fall through to null
        }
      }

      // Build citations from Tavily results (authoritative) +
      // model's "sources" field (helpful but unverified).
      const tavilySources: Array<{ title?: string; url: string }> = tavily.results.map(
        (r) => ({ title: r.title, url: r.url }),
      );
      const modelSources: Array<{ title?: string; url: string }> = Array.isArray(
        parsed?.sources,
      )
        ? parsed.sources
            .filter((s: any) => s && typeof s.url === 'string' && s.url.length > 0)
            .map((s: any) => ({ title: s.title, url: s.url }))
        : [];
      const seen = new Set<string>();
      const merged: Array<{ title?: string; url: string }> = [];
      for (const s of [...tavilySources, ...modelSources]) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        merged.push(s);
      }

      // If we still don't have JSON, return the Tavily answer verbatim.
      if (!parsed || typeof parsed !== 'object') {
        return {
          ranked_sites: [],
          raw: text,
          answer: tavily.answer ?? cleaned,
          sources: merged,
        } as any;
      }

      // Normalise ranked_sites with city-centre fallback for missing lat/lng.
      const rawSites = Array.isArray(parsed.ranked_sites) ? parsed.ranked_sites : [];
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

      return {
        ranked_sites: sites,
        raw: text,
        answer: typeof parsed.answer === 'string' ? parsed.answer : (tavily.answer ?? cleaned),
        sources: merged,
      } as any;
    } catch (outerErr) {
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, error: `Tavily call failed: ${msg}` } as any;
    }
  },
};
