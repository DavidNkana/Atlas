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

The user wants a SUBURB-LEVEL answer with real, detailed analysis. For each site, provide WHY it fits — not generic descriptions, but specific reasons based on real data about that location.

Return STRICT JSON (no markdown, just the JSON):

{
  "answer": "<one paragraph summary of the best fit for this query>",
  "sources": [{"title":"<source>", "url":"<real URL>"}],
  "ranked_sites": [{
    "rank": 1,
    "name": "<suburb or area name>",
    "suburb": "<suburb name>",
    "score": <0-1>,
    "confidence": <0-1>,
    "rationale": "<2-3 sentences: why this fits>",
    "advantages": {
      "economic": "<paragraph: property prices, business activity, spending power, commercial density, rental yields>",
      "geographic": "<paragraph: terrain, soil, altitude, flood risk, any land constraints or advantages>",
      "logistical": "<paragraph: access to main roads, distance to CBD, freight routes, public transport, major airports>",
      "demographic": "<paragraph: population, income brackets, age profile, commuter patterns, education levels>"
    },
    "disadvantages": "<paragraph: specific drawbacks — competition, zoning restrictions, traffic congestion, crime concerns, supplier distance, seasonal demand issues. Be honest and specific.>",
    "lat": <decimal>,
    "lng": <decimal>
  }]
}

Provide up to 5 ranked sites. Use real suburb names, real property price bands, real school names, real landmarks. Write full paragraphs for each section. Be specific — not generic filler.`;
}

/**
 * Day 28 v4 — Gemini via raw REST API (no SDK).
 *
 * Uses the same fetch pattern as the /api/health endpoint
 * which confirms the key format and quota status. The old SDK
 * approach used googleSearch tool which consumed quota differently.
 */
export const geminiSearch: Model = {
  info: {
    id: 'gemini-search',
    displayName: 'Gemini Flash (free)',
    shortName: 'Gemini',
    provider: 'google',
    free: true,
    description:
      'Google Gemini 2.0 Flash via REST API. Fast, free tier: 15 RPM / 1500 RPD. Best for research-grade answers when quota is available.',
    brandColor: '#34A853',
    logoPath:
      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z',
  },
  isAvailable: () => !!process.env.GEMINI_API_KEY,
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return { ok: false, error: 'GEMINI_API_KEY not set' } as any;

      let text: string | undefined;
      let groundingSources: Array<{ title?: string; url: string }> = [];
      let errorLog: string[] = [];

      // Use raw fetch in parallel (SDK has network issues on Vercel)
      const results = await Promise.allSettled(
        ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'].map(async (modelId) => {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: buildPrompt(req) }] }],
                generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 2048 },
              }),
            }
          );
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`${res.status}: ${errText.slice(0, 100)}`);
          }
          const data = await res.json();
          const cand = data?.candidates?.[0];
          const t = cand?.content?.parts?.[0]?.text;
          if (!t) throw new Error('empty response');
          return { text: t, grounding: (cand?.groundingMetadata?.groundingChunks || []).filter((c: any) => c?.web?.uri).map((c: any) => ({ title: c.web.title ?? c.web.uri, url: c.web.uri })) };
        })
      );

      for (const settled of results) {
        if (settled.status !== 'fulfilled') {
          errorLog.push(`rejected: ${(settled as any).reason?.message?.slice(0, 100) ?? 'unknown'}`);
          continue;
        }
        const { text: t, grounding } = settled.value;
        if (!t) { errorLog.push('empty response'); continue; }
        text = t;
        groundingSources = grounding;
        break;
      }

      if (!text) return { ok: false, error: `All Gemini models failed: ${errorLog.join(' | ')}` } as any;

      // Dedupe grounding sources
      const gsSeen = new Set<string>();
      groundingSources = groundingSources.filter(s => gsSeen.has(s.url) ? false : (gsSeen.add(s.url), true));

      // Parse JSON from the model's text. Gemini may wrap the
      // object in ```json ... ``` fences; strip them.
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
      // If we still don't have JSON, surface the failure so the
      // route's fallback chain can try OpenRouter / curatedStub.
      // Day 22 v24 fix: returning ranked_sites:[] with no `ok: false`
      // was being interpreted as success by callModel(), which
      // short-circuited the entire fallback chain. Users saw empty
      // cards instead of OpenRouter / stub fallback results.
      // We still pass the prose answer + sources through so the
      // UI can render the "Research answer" panel even if no sites.
      if (!parsed || typeof parsed !== 'object') {
        return {
          ok: false,
          error: 'gemini-search: model returned no parseable JSON',
        } as any;
      }

      // Normalise ranked_sites: Gemini may omit the array if it
      // can't find anything. If we have no sites at all, propagate
      // as failure so the fallback chain fires.
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
        const site: any = {
          rank: s.rank ?? i + 1,
          name: s.name ?? 'Unknown',
          score: typeof s.score === 'number' ? s.score : 0.7,
          confidence: typeof s.confidence === 'number' ? s.confidence : 0.7,
          rationale: s.rationale ?? '',
          lat,
          lng,
        };
        if (s.advantages) site.advantages = s.advantages;
        if (s.disadvantages) site.disadvantages = s.disadvantages;
        if (s.suburb) site.suburb = s.suburb;
        return site;
      });

      // Day 22 v24 fix: if the model returned parseable JSON but
      // zero sites, treat that as a failure too. The fallback
      // chain (OpenRouter free tier, curatedStub) must get a
      // chance to deliver actual sites. Returning ranked_sites:[]
      // with no `ok: false` was the #1 cause of "empty result page
      // when Gemini has quota" — the cascade thought it had
      // succeeded and stopped.
      if (sites.length === 0) {
        return {
          ok: false,
          error: `gemini-search: returned 0 sites`,
        } as any;
      }

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
      } as any;
    } catch (outerErr) {
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, error: `Gemini Search call failed: ${msg}` } as any;
    }
  },
};
