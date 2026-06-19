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

/**
 * Day 12 v23 — Tavily + Gemini Flash synthesis.
 *
 * Day 17 v3 — dropped Gemini synthesis. David noticed that sites
 * returned from Gemini looked identical to REAL_SITE_CATALOG because
 * Gemini was drawing on its training data instead of the Tavily
 * sources we fed it.
 *
 * Day 17 v5 — restored Gemini synthesis with the attribution fix
 * that David actually wanted. The right architecture:
 *
 *   1. Tavily searches the web. Returns 5 real sources + answer.
 *   2. Gemini 2.0 Flash REASONS over those 5 sources + the user's
 *      question to produce ranked sites with real suburb names +
 *      lat/lng + reasoning. This is the "Perplexity-style" reasoning
 *      layer that v3 lost.
 *   3. Each Gemini-reasoned site gets a citation to the specific
 *      Tavily URL(s) it was derived from. If a site name doesn't
 *      appear in any Tavily source, it's flagged as
 *      'reasoned from general knowledge' so the user knows it's
 *      a Gemini inference, not a Tavily fact.
 *   4. If Gemini returns 0 sites (quota, parse error), fall back to
 *      catalog-match against Tavily's answer text. This is the v4
 *      safety net. When it kicks in, the rationale is honest about
 *      being catalog-derived.
 *
 * The result: real Perplexity-style reasoning with citations to the
 * actual web sources Tavily found, plus a safety net that prevents
 * empty maps when Gemini is rate-limited.
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

function humanVertical(v: string): string {
  const stripped = v.startsWith('custom:') ? v.slice('custom:'.length) : v;
  return stripped.replace(/_/g, ' ');
}

function buildSynthesisPrompt(req: ModelRequest, tavily: TavilyResponse): string {
  const contextLines = tavily.results
    .map(
      (r, i) =>
        `[${i + 1}] TITLE: ${r.title}\n    URL: ${r.url}\n    CONTENT: ${r.content.slice(0, 800)}`,
    )
    .join('\n\n');
  return (
    'You are Atlas, an African land-development intelligence engine. ' +
    'You have REAL WEB SEARCH RESULTS from Tavily below. Reason over them to recommend the best sites.\n\n' +
    'USER QUESTION: "' + req.question + '"\n' +
    'VERTICAL: ' + humanVertical(req.vertical) + '\n\n' +
    'WEB SEARCH RESULTS (from Tavily, last 24-48h):\n' + contextLines + '\n\n' +
    'Your job: read the web sources above. Identify up to 5 real place names (suburbs, streets, neighbourhoods) that fit the user\'s question. ' +
    'For each place, write a 2-3 sentence rationale citing SPECIFIC facts from the web sources (school names, prices, distances, demographics). ' +
    'Score 0.0-1.0 based on fit.\n\n' +
    'Return STRICT JSON only (no markdown fences, no commentary):\n' +
    '{\n' +
    '  "answer": "<one paragraph summary synthesising the Tavily sources>",\n' +
    '  "ranked_sites": [\n' +
    '    {\n' +
    '      "rank": 1,\n' +
    '      "name": "<suburb or place name>",\n' +
    '      "suburb": "<suburb label>",\n' +
    '      "score": <0.0-1.0>,\n' +
    '      "confidence": <0.0-1.0>,\n' +
    '      "rationale": "<2-3 sentences citing specific facts from the web sources>",\n' +
    '      "sources_used": [<list of source numbers like [1,3] that you actually used>],\n' +
    '      "lat": <decimal latitude>,\n' +
    '      "lng": <decimal longitude>\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'CRITICAL: Every site name MUST come from the web sources above. Cite which source number(s) you used in sources_used. ' +
    'If a source mentions Ridgeway Lusaka, use Ridgeway Lusaka. Do not invent place names. ' +
    'Use real coordinates for the suburbs you name. Estimate if needed.'
  );
}

/**
 * For each Gemini-reasoned site, find which Tavily sources actually
 * mention the place. Sets the `payload.sourceUrls` field so the UI
 * can show "Source: [Inspireli Awards](url)" attribution per site.
 */
function attributeSources(
  sites: RankedSite[],
  tavily: TavilyResponse,
): RankedSite[] {
  return sites.map((site) => {
    const name = String(site.name ?? "").trim();
    if (!name) return site;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    const sourceUrls = tavily.results
      .filter((r) =>
        re.test(`${r.title} ${r.url} ${r.content?.slice(0, 600) ?? ""}`),
      )
      .map((r) => r.url);
    return {
      ...site,
      payload: {
        ...(site.payload ?? {}),
        sourceUrls,
        // If no Tavily source mentions this site, mark it as Gemini
        // general knowledge — honest attribution.
        attribution: sourceUrls.length > 0 ? "tavily_cited" : "gemini_general_knowledge",
      },
    };
  });
}

/**
 * Day 17 v4 safety net: catalog-match fallback when Gemini returns
 * 0 sites OR fails entirely. Matches entry.name AND entry.suburb
 * against Tavily's answer text + each result's title/url.
 */
function buildCatalogFallbackSites(
  req: ModelRequest,
  tavily: TavilyResponse,
): RankedSite[] {
  const city = detectCity(req.question ?? '');
  const realSites = getRealSiteCandidates(city.id, req.vertical) ?? [];
  const haystack = [
    tavily.answer ?? "",
    ...tavily.results.map((r) => `${r.title} ${r.url} ${r.content?.slice(0, 200) ?? ""}`),
  ].join(" \n ").toLowerCase();

  const seen = new Set<string>();
  const sites: RankedSite[] = [];
  for (const entry of realSites) {
    const name = String(entry?.name ?? "").trim();
    const suburb = String(entry?.suburb ?? "").trim();
    if (!name || name.length < 4 || seen.has(name.toLowerCase())) continue;
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
        score: 0.7,
        confidence: 0.6,
        rationale: matchingSource
          ? `Mentioned by Tavily in "${matchingSource.title}". ${entry.rationale ?? ""}`
          : (entry.rationale ?? "Mentioned by Tavily in research answer"),
        lat: entry.lat,
        lng: entry.lng,
        payload: {
          sourceUrls: matchingSource ? [matchingSource.url] : [],
          attribution: "tavily_cited",
        },
      });
      seen.add(name.toLowerCase());
      if (sites.length >= 5) break;
    }
  }

  // If still no matches, plot the city centre as a fallback so the
  // map has something. Honest about it being a fallback.
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
      payload: {
        sourceUrls: [],
        attribution: "catalog_fallback",
      },
    });
  }

  return sites;
}

export const tavily: Model = {
  info: {
    id: 'tavily',
    displayName: 'Tavily + Gemini (Perplexity-style)',
    shortName: 'Tavily + Gemini',
    provider: 'google',
    free: true,
    description:
      'Tavily real-time web search (1,000 credits/month free, no card) + Gemini 2.0 Flash for reasoning. Returns real web citations, real suburb names, and AI reasoning about which site fits your question. Each site card shows which Tavily URL it came from.',
    brandColor: '#1F6FEB',
    logoPath:
      'M5 4h14v3h-4v13h-6V7H5V4z',
  },
  isAvailable: () => !!(process.env.TAVILY_API_KEY && process.env.GEMINI_API_KEY),
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!tavilyKey) {
      return { ok: false, error: 'TAVILY_API_KEY not set' } as any;
    }
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return { ok: false, error: 'GEMINI_API_KEY not set' } as any;
    }

    // Step 1: Tavily web search.
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

    // Build authoritative sources list from Tavily.
    const tavilySources: Array<{ title?: string; url: string }> = tavily.results.map(
      (r) => ({ title: r.title, url: r.url }),
    );

    // Step 2: Gemini 2.0 Flash REASONS over the Tavily sources.
    // This is the layer David liked — it ranks the suburbs against
    // the user's specific question, not just regurgitates them.
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    let sites: RankedSite[] = [];
    let modelAnswer: string | undefined;
    let extractionStatus = 'tavily_cited';
    let geminiSucceeded = false;

    try {
      const result = await model.generateContent(buildSynthesisPrompt(req, tavily));
      const text = result.response.text().trim();

      // Parse the JSON Gemini returned.
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          modelAnswer = typeof parsed.answer === 'string' ? parsed.answer : undefined;

          if (Array.isArray(parsed.ranked_sites)) {
            const rawSites = parsed.ranked_sites;
            const city = detectCity(req.question ?? '');
            sites = rawSites
              .filter((s: any) => s && typeof s.name === 'string' && s.name.length > 0)
              .slice(0, 5)
              .map((s: any, i: number) => {
                const hasLat = typeof s.lat === 'number' && isFinite(s.lat) && Math.abs(s.lat) <= 90;
                const hasLng = typeof s.lng === 'number' && isFinite(s.lng) && Math.abs(s.lng) <= 180;
                return {
                  rank: typeof s.rank === 'number' ? s.rank : i + 1,
                  name: s.name,
                  suburb: typeof s.suburb === 'string' ? s.suburb : undefined,
                  score: typeof s.score === 'number' ? s.score : 0.7,
                  confidence: typeof s.confidence === 'number' ? s.confidence : 0.7,
                  rationale: typeof s.rationale === 'string' ? s.rationale : '',
                  lat: hasLat ? s.lat : city.lat,
                  lng: hasLng ? s.lng : city.lng,
                };
              });
            // Attribute each site to which Tavily sources actually
            // mention it. Honest attribution.
            sites = attributeSources(sites, tavily);
            geminiSucceeded = sites.length > 0;
            extractionStatus = geminiSucceeded ? 'tavily_plus_gemini' : 'gemini_returned_empty';
          }
        } catch (parseErr) {
          console.warn('[tavily] Gemini returned non-JSON, falling back to catalog-match');
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[tavily] Gemini synthesis failed (${msg}); falling back to catalog-match`);
    }

    // Day 17 v4 safety net: if Gemini returned 0 sites, use catalog-match.
    if (sites.length === 0) {
      sites = buildCatalogFallbackSites(req, tavily);
      extractionStatus = 'catalog_fallback';
    }

    return {
      ok: true,
      ranked_sites: sites,
      raw: JSON.stringify({
        tavilyAnswer: tavily.answer,
        tavilyResults: tavily.results.map((r) => ({
          title: r.title,
          url: r.url,
        })),
        geminiSucceeded,
        extractionStatus,
        extractionSiteCount: sites.length,
      }),
      answer: modelAnswer ?? tavily.answer ??
        `Tavily returned ${tavily.results.length} web sources for "${req.question}".`,
      sources: tavilySources,
      extractionStatus,
    } as any;
  },
};
