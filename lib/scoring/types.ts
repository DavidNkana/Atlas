/**
 * Day 5 — Scoring engine types.
 *
 * The scoring engine combines the AI's per-site score with signals from
 * connectors into a single [0..1] confidence score. It always emits a
 * breakdown so the UI can show "AI 0.85 → signals +0.09".
 */

import type { Vertical } from "@/lib/models/types";

/**
 * One line of evidence in the breakdown. `contribution` is the signed
 * delta this factor applied to the base AI score (e.g. +0.09 for a strong
 * amenity-density signal, -0.05 for a thin one). `weight` is the factor's
 * importance in [0..1]. `evidence` is a short human sentence the UI can show.
 */
export interface ScoreFactor {
  name: string;
  weight: number;
  contribution: number;
  evidence: string;
}

/**
 * The full breakdown for a single site.
 *
 * - `baseScore` is the AI's raw score [0..1].
 * - `signalScore` is the boost from connectors, clamped to [-0.3, +0.3].
 * - `confidence` is the final score, rounded to 2 decimals.
 * - `factors[]` is the per-signal evidence the UI shows in the breakdown.
 */
export interface ScoreBreakdown {
  siteId: string;
  baseScore: number;
  signalScore: number;
  confidence: number;
  factors: ScoreFactor[];
}

/** Vertical-specific weights — exported so tests can pin them. */
export interface VerticalWeights {
  /** How much amenity density (POI count) influences the score. */
  amenityDensity: number;
  /** Maximum absolute boost a single signal may apply (e.g. 0.10 = ±10%). */
  maxSignalBoost: number;
}

export const VERTICAL_WEIGHTS: Record<Vertical, VerticalWeights> = {
  // Gas stations care MOST about competition density — too crowded = bad,
  // too empty = no demand. So we lean on amenity_density heavily.
  gas_station: { amenityDensity: 0.40, maxSignalBoost: 0.15 },
  // Restaurants care about amenities (other restaurants nearby = foot
  // traffic and dining clusters), but less aggressively.
  restaurant: { amenityDensity: 0.30, maxSignalBoost: 0.15 },
  // Warehouses care about INDUSTRIAL signal density, not generic amenities.
  // Today Overpass only emits amenity_density; the warehouse connector will
  // add industrial_density later. Same weights for now.
  warehouse: { amenityDensity: 0.30, maxSignalBoost: 0.15 },
  // Retail shops care about shop density (supermarkets, malls).
  retail_shop: { amenityDensity: 0.35, maxSignalBoost: 0.15 },
};
