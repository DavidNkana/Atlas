import type { Model, ModelRequest, ModelResponse, RankedSite } from './types';
import { detectCity } from '../stub/detect';
import { getRealSiteCandidates } from '../stub/real-sites';

function humanVertical(v: string): string {
  const stripped = v.startsWith('custom:') ? v.slice('custom:'.length) : v;
  return stripped.replace(/_/g, ' ');
}

function buildPrompt(req: ModelRequest): string {
  return `You are Atlas, an African land-development research engine. The user is searching for: "${req.question}".

The user wants a SUBURB-LEVEL answer. They want to know WHERE to look first, what makes that area a fit, and which real schools/amenities/landmarks are nearby.

Return STRICT JSON (no markdown, no commentary, just the JSON object) in this exact shape:

{
  "answer": "<one paragraph summary: what makes a good fit for this question, criteria the user implicitly cares about>",
  "sources": [
    {"title": "<article or page title>", "url": "<real URL if known>"}
  ],
  "ranked_sites": [
    {
      "rank": 1,
      "name": "<suburb or area name, e.g. 'Constantia, Cape Town'>",
      "suburb": "<suburb name>",
      "score": <0.0-1.0>,
      "confidence": <0.0-1.0>,
      "rationale": "<2-3 sentences: why this area fits what the user asked>",
      "advantages": {
        "economic": "<1 paragraph: commercial activity, property prices, business density, spending power>",
        "geographic": "<1 paragraph: terrain, flood risk, soil, elevation>",
        "logistical": "<1 paragraph: road access, freight, public transport, airports>",
        "demographic": "<1 paragraph: population, income, age, growth rate>"
      },
      "disadvantages": "<1 paragraph: competition, zoning, congestion, crime>",
      "lat": <decimal latitude>,
      "lng": <decimal longitude>
    }
  ]
}

Provide up to 5 ranked suburbs. Use real suburb names. Mention real school names, real property price bands (e.g. 'R 4-6M family homes', 'R 12-25M luxury estates'), real landmarks. Be specific.`;
}

export const geminiSearch: Model = {
  info: {
    id: 'gemini-search',
    displayName: 'Gemini Search (Perplexity-style, free)',
    shortName: 'Gemini Search',
    provider: 'google',
    free: true,
    description: 'Google Gemini 2.0 Flash. Free tier: 15 RPM / 1500 RPD.',
    brandColor: '#34A853',
    logoPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z',
  },
  // LCP-64: Gemini free tier is perpetually rate-limited with AQ keys.
  // Disabled until a working API key is available. OpenRouter handles all queries.
  isAvailable: () => false,
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { ok: false, error: 'GEMINI_API_KEY not set' } as any;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(req) }] }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { ok: false, error: `gemini-2.0-flash: ${res.status} ${errText.slice(0, 100)}` } as any;
      }

      const data = await res.json() as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return { ok: false, error: 'gemini-2.0-flash: no text in response' } as any;

      // Parse JSON from model output
      const parsed = JSON.parse(
        text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim(),
      );

      const sites: RankedSite[] = (parsed.ranked_sites ?? []).map((s: any, i: number) => ({
        rank: i + 1,
        name: String(s.name ?? ''),
        suburb: s.suburb ?? undefined,
        score: Number(s.score) || 0.5,
        confidence: Number(s.confidence) || 0.5,
        rationale: String(s.rationale ?? ''),
        lat: Number(s.lat) || 0,
        lng: Number(s.lng) || 0,
        ...(s.advantages && { advantages: s.advantages }),
        ...(s.disadvantages && { disadvantages: s.disadvantages }),
      }));

      // Enrich with real catalog data
      const enriched = enrichSites(sites, req.question);

      return {
        ok: true,
        answer: String(parsed.answer ?? ''),
        sources: (parsed.sources ?? []) as any,
        ranked_sites: enriched,
      } as any;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fall back to curated stub sites on parse failure
      const location = detectCity(req.question);
      const real = getRealSiteCandidates(location.name, String(req.vertical || '')) ?? [];
      return {
        ok: false,
        error: `gemini-2.0-flash: ${msg.slice(0, 150)}`,
        ranked_sites: real.slice(0, 5).map((s, i) => ({
          rank: i + 1,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          score: 0.7,
          confidence: 0.8,
          rationale: s.rationale ?? `A candidate site in ${location.name}.`,
        })),
      } as any;
    }
  },
};

function enrichSites(sites: RankedSite[], question: string): RankedSite[] {
  const location = detectCity(question);
  const real = getRealSiteCandidates(location.name, '') ?? [];
  const realMap = new Map(real.map((r) => [r.name.toLowerCase().trim(), r]));

  return sites.map((s) => {
    const match = realMap.get(s.name.toLowerCase().trim());
    if (!match) return s;
    return {
      ...s,
      lat: s.lat || match.lat,
      lng: s.lng || match.lng,
      rationale: s.rationale || match.rationale || s.rationale,
    };
  });
}
