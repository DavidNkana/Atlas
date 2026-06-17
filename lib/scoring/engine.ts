/**
 * Day 5 — Scoring engine.
 *
 * combine(aiSite, signals, vertical) takes the AI's score for a site and the
 * list of Signals connectors returned for it, and produces a ScoreBreakdown
 * the API route can attach to the response and the UI can render.
 *
 * v1 is intentionally simple:
 *   - one signal type (amenity_density) is supported
 *   - the boost = signal.weight * verticalWeights.amenityDensity
 *   - the boost is clamped to [-maxSignalBoost, +maxSignalBoost]
 *   - the breakdown lists every signal as a ScoreFactor
 *
 * When Day 60 adds new signal types, the engine reads `signal.type` and
 * routes to per-type scoring functions. The API contract (ScoreBreakdown)
 * will not change.
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

  for (const sig of signals) {
    // Today we only score amenity_density. Other signal types add 0 and
    // are still surfaced as factors (so the UI can render them).
    let factorWeight: number;
    let contribution = 0;
    if (sig.type === "amenity_density") {
      factorWeight = weights.amenityDensity;
      // sig.weight is already normalised [0..1] by the connector. Multiply
      // by the vertical's factor weight, then centre around zero so a low
      // density is mildly negative and high density is mildly positive.
      // Centre = 0.5: weight=0.5 → 0, weight=1.0 → +factorWeight/2, weight=0 → -factorWeight/2.
      const centred = (sig.weight - 0.5) * factorWeight;
      contribution = clamp(
        centred,
        -weights.maxSignalBoost,
        weights.maxSignalBoost,
      );
    } else {
      factorWeight = 0;
    }
    factors.push({
      name: sig.type,
      weight: factorWeight,
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
