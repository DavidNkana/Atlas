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
 * gemini-2.0-flash + added graceful degradation.
 *
 * Day 17 v3 — REMOVED Gemini synthesis entirely. The Gemini
 * synthesis was returning sites that looked identical to our
 * curated stub (same suburb names, same lat/lng, same templated
 * rationales) because Gemini was drawing on its general training
 * knowledge instead of using the Tavily sources we fed it. This
 * made the result page misleading: model said "Tavily" but the
 * sites were Gemini's pre-training knowledge with no actual
 * Tavily provenance.
 *
 * Now Tavily alone does the work:
 *   1. Tavily search returns up to 5 web results + its own answer.
 *   2. We extract real place names from Tavily's `answer` field +
 *      each result's title+url by matching against REAL_SITE_CATALOG.
 *      This produces real, current, web-sourced sites on the map.
 *   3. The result page renders Tavily's prose answer + the clickable
 *      web sources + the catalog-matched sites on the map.
 *
 * Why this is honest:
 *   - Every site shown has a citation (Tavily result URL).
 *   - Sites NOT mentioned in Tavily's answer don't appear on the map
 *     (better than showing fake-looking Gemini hallucinations).
 *   - If 0 sites match the catalog, the map shows just the city
 *     center with a "no specific sites mentioned in research" message.
 *     Honest about what Tavily actually found.
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
  isAvailable: () => !!process.env.TAVILY_API_KEY,
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    try {
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (!tavilyKey) {
        return { ok: false, error: 'TAVILY_API_KEY not set' } as any;
      }

      // Step 1: Tavily search (the only step — Day 17 v3 dropped
      // the Gemini synthesis that was producing fake-looking
      // sites from Gemini's training data).
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

      // Build citations from Tavily results — these are the real,
      // authoritative sources for this query.
      const sources: Array<{ title?: string; url: string }> = tavily.results.map(
        (r) => ({ title: r.title, url: r.url }),
      );

      // Day 17 v3: extract real place names from Tavily's actual
      // answer text + each result's title+url. Match against the
      // 350-entry REAL_SITE_CATALOG so the map shows sites that are
      // BOTH in our known-cities catalog AND mentioned in the live
      // Tavily research. No more Gemini synthesis = no more
      // hallucinated sites that look like our curated stub.
      const city = detectCity(req.question ?? '');
      const realSites = getRealSiteCandidates(city.id, req.vertical) ?? [];
      const haystack = [
        tavily.answer ?? "",
        ...tavily.results.map((r) => `${r.title} ${r.url} ${r.content?.slice(0, 200) ?? ""}`),
      ].join(" \n ").toLowerCase();

      // Day 17 v4: catalog-match against BOTH name and suburb so
      // 'Woodlands' (which appears as a suburb label, not a primary
      // name) gets matched.
      const seen = new Set<string>();
      const sites: RankedSite[] = [];
      for (const entry of realSites) {
        const name = String(entry?.name ?? "").trim();
        const suburb = String(entry?.suburb ?? "").trim();
        if (!name || name.length < 4 || seen.has(name.toLowerCase())) continue;
        // Build candidate substrings to search for in the haystack.
        const candidates = [name];
        if (suburb && suburb.toLowerCase() !== name.toLowerCase() && suburb.length >= 4) {
          candidates.push(suburb);
        }
        let matched = false;
        let matchingSource: TavilyResult | undefined;
        for (const candidate of candidates) {
          const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`\\b${escaped}\\b`, "i");
          if (re.test(haystack)) {
            matched = true;
            matchingSource = tavily.results.find((r) =>
              re.test(`${r.title} ${r.url} ${r.content?.slice(0, 400) ?? ""}`),
            );
            break;
          }
        }
        if (matched) {
          sites.push({
            rank: sites.length + 1,
            name,
            suburb: suburb || undefined,
            score: 0.75,
            confidence: 0.7,
            rationale: matchingSource
              ? `Mentioned by Tavily in "${matchingSource.title}". ${entry.rationale ?? ""}`
              : (entry.rationale ?? "Mentioned by Tavily in research answer"),
            lat: entry.lat,
            lng: entry.lng,
          });
          seen.add(name.toLowerCase());
          if (sites.length >= 5) break;
        }
      }

      // Day 17 v4: city-centre fallback. If Tavily mentioned places
      // but 0 matched the catalog (e.g. Ridgeway didn't exist in
      // catalog until today), still plot the city centre so the map
      // has SOMETHING to show — with a clear "research mentioned X,
      // map pending" badge. Honest about the catalog gap.
      if (sites.length === 0 && (tavily.answer ?? "").length > 0) {
        sites.push({
          rank: 1,
          name: `${city.name} city centre`,
          suburb: city.name,
          score: 0.5,
          confidence: 0.4,
          rationale: `Tavily returned research for "${req.question}" but no specific place name matched the ${city.name} catalog. Map shows the city centre as a fallback. The Research Answer panel above names the actual sites Tavily found — see the web sources below for clickable citations.`,
          lat: city.lat,
          lng: city.lng,
        });
      }

      // The honest answer: Tavily's prose + the clickable sources +
      // any sites we could match. If 0 sites matched, that's OK —
      // we still show Tavily's prose research answer. The map will
      // show the city center with a "no specific sites in research"
      // message instead of fake-looking catalog filler.
      return {
        ok: true,
        ranked_sites: sites,
        raw: JSON.stringify({
          tavilyAnswer: tavily.answer,
          tavilyResults: tavily.results.map((r) => ({
            title: r.title,
            url: r.url,
            contentPreview: r.content?.slice(0, 300),
          })),
          extractedSites: sites.map((s) => s.name),
          matchedFromCatalog: sites.length,
          catalogTotalForCity: realSites.length,
        }),
        answer: tavily.answer ??
          `Tavily returned ${tavily.results.length} web sources for "${req.question}". ${sources.slice(0, 3).map((s) => s.title).join("; ")}.`,
        sources,
        extractionStatus: "tavily_only",
      } as any;
    } catch (outerErr) {
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, error: `Tavily call failed: ${msg}` } as any;
    }
  },
};
