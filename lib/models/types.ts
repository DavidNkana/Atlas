export type Vertical = 'gas_station' | 'restaurant' | 'warehouse' | 'retail_shop';

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
 */
export type ModelResponse =
  | { ok: true; ranked_sites: RankedSite[]; raw?: string }
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
