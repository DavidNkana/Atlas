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
 * Two-step model that gives Atlas Perplexity-style answers even
 * when the Gemini Search grounding tool is rate-limited:
 *
 *   1. POST https://api.tavily.com/search with the question.
 *      Tavily returns up to 5 web results with title, url, content.
 *   2. Feed those results to Gemini 1.5 Flash as context. Ask
 *      Gemini to produce the same Perplexity-shape JSON: answer
 *      paragraph + ranked_sites + sources.
 *
 * The Tavily search gives us real, current web data (Wikipedia,
 * property portals, news). Gemini Flash has the cheapest free
 * tier of the Gemini family. We use it just to structure the
 * Tavily results into Atlas's shape.
 *
 * Why this works even when Gemini Search fails: this path uses
 * 1.5-flash without the grounding tool (so no 429 from
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

      // Step 2: Gemini Flash synthesis.
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });
      let text: string;
      try {
        const result = await model.generateContent(buildSynthesisPrompt(req, tavily));
        text = result.response.text();
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        return { ok: false, error: `Tavily model: Gemini synthesis failed: ${msg}` } as any;
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
