import type { Model, ModelRequest, ModelResponse, RankedSite, Vertical } from './types';
import { detectCity } from '../stub/detect';
import { generateStubSites } from '../stub/sites';
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
    provider: 'stub',
    free: true,
    description: 'Hand-crafted demonstration response. Works without any API key.',
  },
  isAvailable: () => true,
  call: async (req: ModelRequest): Promise<StubModelResponse> => {
    const vertical = req.vertical as Vertical;
    const city: City = detectCity(req.question ?? '');
    const sites = generateStubSites(city, vertical);

    const payload: StubPayload = {
      status: 'stub_demo',
      vertical,
      city: city.name,
      country: city.country,
      ranked_sites: sites,
      stubReason:
        'AI models are currently overloaded. This is a city-specific demo placeholder. Try a real model in a few minutes or pick curated-stub explicitly.',
    };

    return {
      ok: true,
      ranked_sites: sites,
      raw: 'stub_demo',
      __stub: payload,
    };
  },
};
