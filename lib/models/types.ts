// Day 1-8: 4 chip verticals (gas_station, restaurant, warehouse, retail_shop)
// Day 9: +5 land verticals suggested by the vertical-mismatch modal
//        (residential_land, commercial_land, agricultural_land,
//         industrial_land, mixed_use_land) and +1 civic vertical
//        (civic_land — schools, hospitals, churches, clinics).
//        These are accepted by /api/ask so the "Switch to {suggested}"
//        one-click flow doesn't 401 with "Unsupported vertical".
export type Vertical =
  | 'gas_station'
  | 'restaurant'
  | 'warehouse'
  | 'retail_shop'
  | 'residential_land'
  | 'commercial_land'
  | 'agricultural_land'
  | 'industrial_land'
  | 'mixed_use_land'
  | 'civic_land';

export interface RankedSite {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;
  lng?: number;
}

export interface ModelRequest {
  vertical: Vertical;
  question: string;
}

/**
 * Day 5 hotfix v3 — ModelResponse now supports a union return shape.
 *
 * A model's .call() can return either:
 *   - { ok: true, ranked_sites, raw }   — success
 *   - { ok: false, error: string }       — failed cleanly, never throws
 *
 * The route.ts fallback chain checks `if ("ok" in result && result.ok === false)`
 * to decide whether to move to the next model. This guarantees that
 * .call() never throws out — every error is captured into the {ok:false,error}
 * shape so the chain always terminates.
 *
 * Day 12 v16 — geminiSearch extends the success shape with optional
 * `answer` (prose summary) and `sources` (citations). Models that
 * don't produce a research-grade answer simply omit these. The route
 * handler propagates them to the result page so the result page
 * can render a real Perplexity-style summary with links.
 */
export interface ModelCitation {
  title?: string;
  url: string;
}
export type ModelResponse =
  | {
      ok: true;
      ranked_sites: RankedSite[];
      raw?: string;
      /** v16: prose summary returned by Gemini Search. */
      answer?: string;
      /** v16: list of citation URLs returned by Gemini Search. */
      sources?: ModelCitation[];
    }
  | { ok: false; error: string };

export interface ModelInfo {
  id: string;
  displayName: string;
  /** Short label used in compact UI (e.g. the command-bar picker). */
  shortName: string;
  provider: 'google' | 'openai' | 'openrouter' | 'stub';
  free: boolean;
  description: string;
  /**
   * Brand color hex (#rrggbb). Used by the model icon + picker chip.
   * Atlas brand uses indigo for the default stub.
   */
  brandColor: string;
  /**
   * Inline SVG path data for the model's brand icon, drawn on a 24x24
   * viewBox. We inline the SVG so we don't need any image hosting, CDN,
   * or external requests. Each provider supplies a simplified mark.
   */
  logoPath: string;
}

export interface Model {
  info: ModelInfo;
  isAvailable: () => boolean;
  call: (req: ModelRequest) => Promise<ModelResponse>;
}
