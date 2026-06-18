import type { Model, ModelRequest, ModelResponse, RankedSite, Vertical } from './types';
import { detectCity } from '../stub/detect';
import { generateStubSites } from '../stub/sites';
import { getRealSiteCandidates, type RealSite } from '../stub/real-sites';
import { parseQuestion } from '../stub/question-parser';
import { buildRationale } from '../stub/rationale-builder';
import type { City } from '../stub/cities';

/**
 * Day 6 — location-aware curated stub.
 *
 * When the AI model chain fails (Gemini 500, OpenRouter rate limit,
 * whatever) the user is falling back to this stub. Previously it always
 * returned the same 5 hardcoded Lusaka gas-station points regardless
 * of the user's question. Now we:
 *
 *   1. Detect the city in the question text (lib/stub/detect.ts).
 *      Falls back to Johannesburg when nothing matches.
 *   2. Generate 5 plausible site candidates for (city, vertical)
 *      deterministically (lib/stub/sites.ts).
 *   3. Return the new `stub_demo` status with a `stubReason` field
 *      that route.ts surfaces in the response so the UI can show a
 *      clear "AI overloaded" banner.
 *
 * The legacy `STUB_RESPONSES` table is gone — every (city, vertical)
 * pair is now generated from the template. For the 4 supported
 * verticals (gas_station / restaurant / warehouse / retail_shop) the
 * site names and rationales are vertical-appropriate. For unknown
 * verticals the generator uses generic town-centre / main-road
 * templates.
 */

// `__stub` is read by route.ts (Day 6) to promote the response
// status to "stub_demo" and surface city / country / stubReason in
// the JSON the user sees. It is intentionally a non-standard field
// — model.call() is documented to return ModelResponse, and __stub
// is an optional escape hatch for stub-only metadata.
export type StubPayload = {
  status: 'stub_demo';
  vertical: string;
  city: string;
  country: string;
  ranked_sites: RankedSite[];
  stubReason: string;
};

export type StubModelResponse = ModelResponse & {
  ok: true;
  ranked_sites: RankedSite[];
  raw: string;
  __stub?: StubPayload;
};

export const curatedStub: Model = {
  info: {
    id: 'curated-stub',
    displayName: 'Curated stub (no API)',
    shortName: 'Curated stub',
    provider: 'stub',
    free: true,
    description: 'Hand-crafted demonstration response. Works without any API key.',
    brandColor: '#6366F1',
    // Simplified Atlas compass mark
    logoPath:
      'M12 2L20 12L12 22L4 12L12 2ZM12 6.5L7.5 12L12 17.5L16.5 12L12 6.5Z',
  },
  isAvailable: () => true,
  call: async (req: ModelRequest): Promise<StubModelResponse> => {
    const vertical = req.vertical as Vertical;
    const city: City = detectCity(req.question ?? '');

    // Day 12 v13: parse the question for intent tokens
    // (intent verb, farm type, size, distance, budget,
    // access hint, anchor name) so the rationale can be
    // built to match what the user actually asked for,
    // not a generic copy-paste of the catalog rationale.
    const parsed = parseQuestion(req.question ?? '');

    // Day 12 v12: prefer the REAL site catalog (hand-curated
    // real place names + real lat/lng) when the (city, vertical)
    // pair is in the table. Falls back to the old random-coord
    // generator for cities / verticals we haven't catalogued
    // yet. The result page already shows a "Demo placeholder"
    // banner, so the user knows the result is curated data,
    // not a live AI.
    const realSites = getRealSiteCandidates(city.id, vertical);
    let sites: RankedSite[];
    let usingRealCatalog = false;
    if (realSites && realSites.length > 0) {
      // Convert RealSite[] → RankedSite[] with deterministic
      // scores so the same query always returns the same
      // ranking. Top entry is the strongest candidate. The
      // rationale is built per-site from the parsed question
      // + the city's suburb data + the site-specific road /
      // landmark reference — so "find a cattle farm near
      // water" produces a different explanation per site than
      // "find a smallholding".
      sites = realSites.map((r: RealSite, i: number) => ({
        rank: i + 1,
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        score: +(0.92 - i * 0.05).toFixed(2),
        confidence: +(0.88 - i * 0.04).toFixed(2),
        rationale: buildRationale(parsed, city, r),
        // Empty signals array — real connector data will populate
        // this in a future version when we wire the Overpass +
        // Stats SA connectors into the stub path.
        signals: [],
      }));
      usingRealCatalog = true;
    } else {
      // Day 12 v14: run the fallback (old random-coord
      // generator) through the same context-aware builder
      // so even when a (city, vertical) isn't in the real
      // catalog, the rationale matches the question
      // instead of being a generic "mixed-use density"
      // copy. The fallback still uses random lat/lng,
      // but the explanation is now per-question.
      const fallback = generateStubSites(city, vertical);
      sites = fallback.map((s, i) => ({
        ...s,
        rank: i + 1,
        rationale: buildRationale(parsed, city, {
          name: s.name ?? "",
          lat: s.lat ?? city.lat,
          lng: s.lng ?? city.lng,
          rationale: s.rationale ?? "",
          source: "Fallback stub (random lat/lng)",
          suburb: undefined,
        }),
      }));
    }

    const payload: StubPayload = {
      status: 'stub_demo',
      vertical,
      city: city.name,
      country: city.country,
      ranked_sites: sites,
      // v12: when using the real catalog, the banner is a
      // softer "curated demo data" message instead of the
      // "AI models overloaded" message — because the sites
      // ARE real coordinates, just not live AI-ranked.
      stubReason: usingRealCatalog
        ? 'Live AI models are overloaded, so Atlas is showing real coordinates from a hand-curated catalog of candidate sites in this city. Each site has a real place name, real lat/lng, and a real reason it fits this query. Pick a real model when available to get the AI-ranked version.'
        : 'AI models are currently overloaded. This is a city-specific demo placeholder. Try a real model in a few minutes or pick curated-stub explicitly.',
    };

    return {
      ok: true,
      ranked_sites: sites,
      raw: 'stub_demo',
      __stub: payload,
    };
  },
};
