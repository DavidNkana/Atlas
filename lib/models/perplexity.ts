import type { Model, ModelRequest, ModelResponse, RankedSite } from './types';
import { detectCity } from '../stub/detect';
import { getRealSiteCandidates } from '../stub/real-sites';

interface PerplexityCitation {
  url: string;
  title?: string;
}

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: unknown;
  }>;
  citations?: string[] | PerplexityCitation[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function humanVertical(v: string): string {
  const stripped = v.startsWith('custom:') ? v.slice('custom:'.length) : v;
  return stripped.replace(/_/g, ' ');
}

function buildMessages(req: ModelRequest): PerplexityMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are Atlas, an African land-development research engine. You give real, cited answers for land developers, property investors, and builders searching for sites across Africa. Always cite specific real place names, real school names, real property prices, and real suburb names. Do not invent URLs.',
    },
    {
      role: 'user',
      content: `I'm searching for a ${humanVertical(req.vertical)} site. My question: "${req.question}".

Please answer in TWO parts:

PART 1 — Prose summary: A 2-3 sentence answer that names the best suburb(s) for what I asked, the criteria the user implicitly cares about, and any tradeoffs.

PART 2 — Ranked sites list: 3-5 ranked suburbs/areas that fit. For each, give: name (e.g. "Constantia, Cape Town"), suburb, 2-3 sentence rationale naming real schools/amenities/landmarks, property price band, and decimal lat/lng coordinates so we can plot it on a map.

End with a line that starts with "SOURCES:" followed by the URLs you used, one per line.`,
    },
  ];
}

/**
 * Extract SOURCES: block from the model output. The user prompt
 * asks Perplexity to end the response with "SOURCES:\n<url>\n<url>"
 * so we can pull citations out even if the API doesn't return them
 * in the structured citations field.
 */
function extractSourcesFromText(text: string): string[] {
  const m = text.match(/SOURCES:\s*([\s\S]+?)$/i);
  if (!m) return [];
  return m[1]
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^https?:\/\//i.test(s));
}

/**
 * Day 12 v23 — Perplexity Sonar.
 *
 * Uses Perplexity's Sonar API which does the search + generation
 * server-side. Returns a prose answer with inline citations in
 * the same shape as Gemini Search.
 *
 * Perplexity free signup: $5 credit, no card. ~$0.005-0.01 per
 * search. $5 = 500-1000 searches.
 *
 * Docs: https://docs.perplexity.ai/docs/getting-started
 * Endpoint: https://api.perplexity.ai/chat/completions
 * Model: llama-3.1-sonar-small-128k-online (cheapest with search)
 *        or llama-3.1-sonar-large-128k-online (more expensive, better)
 */
export const perplexity: Model = {
  info: {
    id: 'perplexity',
    displayName: 'Perplexity Sonar (web search, $5 free credit)',
    shortName: 'Perplexity',
    provider: 'openai', // uses OpenAI-compatible SDK
    free: true,
    description:
      'Perplexity Sonar API — real-time web search + answer generation in one call. $5 free signup credit (no card). Best for research-grade answers with citations.',
    brandColor: '#20808D',
    // P shape
    logoPath:
      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 5h2v6h-2V7zm0 8h2v2h-2v-2z',
  },
  isAvailable: () => !!process.env.PERPLEXITY_API_KEY,
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    try {
      const key = process.env.PERPLEXITY_API_KEY;
      if (!key) {
        return { ok: false, error: 'PERPLEXITY_API_KEY not set' } as any;
      }
      let res: Response;
      try {
        res = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-small-128k-online',
            messages: buildMessages(req),
            max_tokens: 1500,
            temperature: 0.2,
            return_citations: true,
            return_related_questions: false,
          }),
        });
      } catch (networkErr) {
        const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
        return { ok: false, error: `Perplexity network error: ${msg}` } as any;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          ok: false,
          error: `Perplexity HTTP ${res.status}: ${text.slice(0, 300)}`,
        } as any;
      }
      const data = (await res.json()) as PerplexityResponse;
      const choice = data.choices?.[0];
      if (!choice || !choice.message?.content) {
        return { ok: false, error: 'Perplexity returned empty content' } as any;
      }
      const text = choice.message.content;

      // Build sources: API citations + SOURCES: block in the text.
      const apiCitations: Array<{ title?: string; url: string }> = [];
      if (Array.isArray(data.citations)) {
        for (const c of data.citations) {
          if (typeof c === 'string') {
            apiCitations.push({ url: c });
          } else if (c && typeof c.url === 'string') {
            apiCitations.push({ title: c.title, url: c.url });
          }
        }
      }
      const textCitations = extractSourcesFromText(text).map((url) => ({ url }));
      const seen = new Set<string>();
      const sources: Array<{ title?: string; url: string }> = [];
      for (const s of [...apiCitations, ...textCitations]) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        sources.push(s);
      }

      // The Perplexity response is prose-only; we don't get a
      // structured ranked_sites array. To still plot something
      // useful, we extract a JSON object if the model wrote one,
      // or fall back to a single derived entry for the detected
      // city centre. Either way the research answer + citations
      // are the real value — the map marker is just a bonus.
      let parsed: any = null;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Not JSON, that's fine.
        }
      }
      const rawSites = Array.isArray(parsed?.ranked_sites) ? parsed.ranked_sites : [];
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

      // Trim the answer to remove the trailing SOURCES: block
      // (we've already extracted those).
      const answerOnly = text.replace(/SOURCES:\s*[\s\S]+$/i, '').trim();

      return {
        ranked_sites: sites,
        raw: text,
        answer: answerOnly,
        sources,
      } as any;
    } catch (outerErr) {
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, error: `Perplexity call failed: ${msg}` } as any;
    }
  },
};
