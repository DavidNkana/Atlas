/**
 * Day 5 (original) — Scoring engine.
 * Day 24 — expanded to apply per-signal-type weights per vertical.
 *
 * combine(aiSite, signals, vertical) takes the AI's score for a site
 * and the list of Signals connectors returned for it, and produces a
 * ScoreBreakdown the API route can attach to the response and the UI
 * can render.
 *
 * Per-signal-type scoring:
 *   - SIGNAL_TYPE_WEIGHT_KEYS maps signal.type → a key in
 *     VerticalWeights. So a `schools_count` signal in a
 *     residential_land query uses weights.schools.
 *   - Each signal's contribution is `(sig.weight - 0.5) * factorWeight`,
 *     so an "average" density (weight=0.5) contributes 0 and a high
 *     density (weight=1) contributes +factorWeight/2, low density
 *     contributes -factorWeight/2.
 *   - Competitor and env-risk signals are INVERTED — high values
 *     push the score DOWN because high competition or high
 *     environmental risk is bad for the user's site.
 *   - Each contribution is clamped to ±maxSignalBoost so one
 *     outlier signal can't dominate the final score.
 *   - Unrecognised signal types contribute 0 but are still surfaced
 *     in the breakdown for UI transparency.
 */

import type { Vertical } from "@/lib/models/types";
import type { Signal } from "@/lib/connectors/types";
import type {
  ScoreBreakdown,
  ScoreFactor,
  VerticalWeights,
} from "./types";
import { VERTICAL_WEIGHTS } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Combine one AI site with its connector signals into a ScoreBreakdown.
 *
 * `aiSite` needs at least `{ id, score }`. We do not require lat/lng/name —
 * those live on the original RankedSite that the caller already holds.
 */
export function combine(
  aiSite: { id: string; score: number },
  signals: Signal[],
  vertical: Vertical,
): ScoreBreakdown {
  const weights: VerticalWeights =
    VERTICAL_WEIGHTS[vertical] ?? VERTICAL_WEIGHTS.gas_station;

  const factors: ScoreFactor[] = [];
  let signalScore = 0;

  // Per-signal-type weighting. Each signal type has a dedicated
  // weight in VerticalWeights. Special-case: competitor is INVERTED
  // (high count = bad for the user's site) and env_risk is also
  // INVERTED (high risk = bad). Everything else follows the
  // standard "centre at 0.5" rule: weight=0.5 → 0, weight=1 → +half,
  // weight=0 → -half.
  const SIGNAL_TYPE_WEIGHT_KEYS: Record<string, keyof VerticalWeights> = {
    amenity_density: "amenityDensity",
    competitor_count: "competitor",
    schools_count: "schools",
    transit_count: "transit",
    healthcare_count: "healthcare",
    roads_count: "roads",
    landuse_count: "landuse",
    building_density: "landuse",  // same family as landuse
    vacant_land: "landuse",
    env_risk: "envRisk",
    demographic_profile: "demographics",
    economic_zone: "demographics",
    median_income: "demographics",
    population_growth: "demographics",
  };

  // Signal types that are INVERTED — high value = BAD for the user's
  // site. We negate the centred contribution so high signal value
  // pushes the score DOWN (and vice versa).
  const INVERTED_SIGNAL_TYPES = new Set([
    "competitor_count", // too many competitors = bad
    "env_risk",         // flood/protected/hazards = bad
  ]);

  for (const sig of signals) {
    const weightKey = SIGNAL_TYPE_WEIGHT_KEYS[sig.type];
    let factorWeight = 0;
    let contribution = 0;

    if (weightKey !== undefined) {
      factorWeight = weights[weightKey] as number;
      // sig.weight is normalised [0..1] by the connector. Centre
      // around 0.5 so "average" density contributes 0 and
      // "high"/"low" push the score positively or negatively.
      const centred = (sig.weight - 0.5) * factorWeight;
      // For competitor_count and env_risk, high values are bad.
      // Negate the centred value so a high signal value pushes
      // the score DOWN.
      const signed = INVERTED_SIGNAL_TYPES.has(sig.type) ? -centred : centred;
      contribution = clamp(
        signed,
        -weights.maxSignalBoost,
        weights.maxSignalBoost,
      );
    }
    factors.push({
      name: sig.type,
      weight: round2(factorWeight),
      contribution: round2(contribution),
      evidence: sig.label,
    });
    signalScore += contribution;
  }

  // Final confidence is base + signal boost, clamped to [0, 1].
  const confidence = clamp(round2(aiSite.score + signalScore), 0, 1);

  return {
    siteId: aiSite.id,
    baseScore: round2(aiSite.score),
    signalScore: round2(signalScore),
    confidence,
    factors,
  };
}
