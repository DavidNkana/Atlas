/**
 * Day 5 (original) — Scoring engine types.
 * Day 24 — extended VerticalWeights to cover all signal types
 * collected by the planner.
 * Day 25 — added `customVerticalMatch` field to ScoreBreakdown so the
 * UI can show how the engine resolved a custom vertical.
 *
 * The scoring engine combines the AI's per-site score with signals
 * from connectors into a single [0..1] confidence score. It always
 * emits a breakdown so the UI can show "AI 0.85 → signals +0.09
 * (schools +0.04 · transit +0.02 · competitors -0.01)".
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
 *
 * Day 25: when the user asked a custom vertical (e.g.
 * "custom:antique_furniture_store"), the engine maps it to the
 * closest built-in vertical and tags the breakdown with the resolved
 * name. `customVerticalMatch` is omitted for built-in verticals.
 *   - "antique_furniture_store → Retail Shop" (matched via keyword)
 *   - "quantum_lab → (generic)" (no keyword matched, used generic weights)
 */
export interface ScoreBreakdown {
  siteId: string;
  baseScore: number;
  signalScore: number;
  confidence: number;
  factors: ScoreFactor[];
  customVerticalMatch?: string;
}

/**
 * Vertical-specific weights for each signal type.
 *
 * Each vertical (gas_station, restaurant, residential_land, etc.)
 * declares how much each SIGNAL TYPE should influence the final
 * confidence score. Values are in [0..1].
 *
 * Example: gas_station weights competitor count heavily (0.40 —
 * too crowded = bad) and schools very low (0.05 — irrelevant to
 * a fuel station decision). residential_land weights schools
 * heavily (0.40 — families look at schools) and competitor lower.
 *
 * NOTE: These values are intentionally heuristic, NOT empirically
 * calibrated against known-good/bad outcomes. They reflect domain
 * intuition about what should matter for each vertical. A future
 * iteration can calibrate them against actual user outcomes
 * (e.g. "did the user find a good site? did they come back?").
 *
 * Day 24: every signal type from the planner is now represented
 * here. Day 5 only had amenityDensity; the other connector
 * signals (schools, transit, healthcare, roads, competitor,
 * landuse, env_risk, demographics) were emitted but contributed 0
 * to the score — making the visible breakdown misleading. Now
 * each signal type contributes to the score with vertical-specific
 * weighting.
 */
export interface VerticalWeights {
  /** POI density within radius (restaurants near a restaurant, etc.). */
  amenityDensity: number;
  /** Same-vertical competitor count (lower = better, weight is INVERTED). */
  competitor: number;
  /** Schools, colleges, universities within radius. */
  schools: number;
  /** Bus stops + rail stations within radius (transit access). */
  transit: number;
  /** Hospitals, clinics, pharmacies within radius. */
  healthcare: number;
  /** Major roads (motorway/trunk/primary/secondary/tertiary) within radius. */
  roads: number;
  /** Land-use mix (residential/commercial/industrial counts from OSM). */
  landuse: number;
  /** Environmental risk (water/wetlands/protected/hazards — HIGHER = WORSE). */
  envRisk: number;
  /** Demographic profile (from hardcoded Stats SA-style data — city-level only). */
  demographics: number;
  /**
   * Maximum absolute contribution a single signal can apply (e.g. 0.10 = ±10%).
   * Caps how much any one signal type can swing the final score, so a
   * single outlier signal can't dominate.
   */
  maxSignalBoost: number;
}

// Day 24: every signal type is now weighted per vertical.
//
// Heuristic guide for the values below (these are NOT empirically
// calibrated — see VerticalWeights doc above for how to calibrate
// them later):
//
//   gas_station     — competitor saturation matters most (a 5th
//                     station on the same corner = bad), transit
//                     and road access drive foot-traffic, demographics
//                     matter because they predict fuel-buying power.
//   restaurant      — competitor saturation again (too many = bad),
//                     amenities signal foot-traffic dining clusters,
//                     transit matters, demographics matter.
//   warehouse       — roads matter (truck access), transit matters,
//                     landuse matters (industrial vs not), env_risk
//                     matters (no flooding), competitor moderate.
//   retail_shop     — amenities, competitor, transit, demographics.
//   residential_land — schools + healthcare matter (families), landuse
//                     (residential mix), demographics, env_risk.
//   commercial_land — amenity, roads, transit, landuse, demographics.
//   agricultural_land — landuse dominant (vacant farmland?), env_risk
//                     (no protected land), demographics moderate.
//   industrial_land — roads, transit, landuse (industrial), env_risk.
//   mixed_use_land   — balanced across all signals.
//   civic_land       — schools, healthcare, demographics moderate.
export const VERTICAL_WEIGHTS: Record<Vertical, VerticalWeights> = {
  gas_station: {
    amenityDensity: 0.20,
    competitor: 0.40,    // crowding is the #1 factor
    schools: 0.05,
    transit: 0.20,
    healthcare: 0.05,
    roads: 0.20,        // highway access
    landuse: 0.10,
    envRisk: 0.15,
    demographics: 0.20, // median income matters for fuel demand
    maxSignalBoost: 0.15,
  },
  restaurant: {
    amenityDensity: 0.30, // dining clusters = foot traffic
    competitor: 0.30,    // over-saturated cuisines fail
    schools: 0.05,
    transit: 0.20,
    healthcare: 0.05,
    roads: 0.15,
    landuse: 0.10,
    envRisk: 0.10,
    demographics: 0.25, // neighbourhood income
    maxSignalBoost: 0.15,
  },
  warehouse: {
    amenityDensity: 0.10,
    competitor: 0.20,    // saturated industrial zone = bad
    schools: 0.02,
    transit: 0.20,      // freight access
    healthcare: 0.02,
    roads: 0.30,        // truck-route access critical
    landuse: 0.30,      // need industrial landuse context
    envRisk: 0.25,      // flooding = unusable
    demographics: 0.05,
    maxSignalBoost: 0.15,
  },
  retail_shop: {
    amenityDensity: 0.25,
    competitor: 0.30,
    schools: 0.05,
    transit: 0.20,
    healthcare: 0.05,
    roads: 0.15,
    landuse: 0.15,
    envRisk: 0.10,
    demographics: 0.25,
    maxSignalBoost: 0.15,
  },
  residential_land: {
    amenityDensity: 0.15,
    competitor: 0.05,
    schools: 0.40,      // families look at schools
    healthcare: 0.25,  // nearby clinics/hospitals
    transit: 0.20,
    roads: 0.10,
    landuse: 0.20,     // residential mix
    envRisk: 0.30,    // flooding, wetlands, hazards = dealbreaker
    demographics: 0.30, // household income critical
    maxSignalBoost: 0.15,
  },
  commercial_land: {
    amenityDensity: 0.20,
    competitor: 0.20,
    schools: 0.05,
    transit: 0.20,
    healthcare: 0.05,
    roads: 0.25,       // drive-by traffic
    landuse: 0.25,      // existing commercial context
    envRisk: 0.20,
    demographics: 0.25,
    maxSignalBoost: 0.15,
  },
  agricultural_land: {
    amenityDensity: 0.05,
    competitor: 0.05,
    schools: 0.02,
    transit: 0.05,
    healthcare: 0.02,
    roads: 0.15,       // farm-to-market access
    landuse: 0.50,    // rural landuse signal dominant
    envRisk: 0.35,    // protected/farmland constraint
    demographics: 0.15,
    maxSignalBoost: 0.15,
  },
  industrial_land: {
    amenityDensity: 0.10,
    competitor: 0.20,
    schools: 0.02,
    transit: 0.20,
    healthcare: 0.02,
    roads: 0.30,       // freight access dominant
    landuse: 0.40,    // existing industrial context
    envRisk: 0.25,
    demographics: 0.05,
    maxSignalBoost: 0.15,
  },
  mixed_use_land: {
    amenityDensity: 0.20,
    competitor: 0.15,
    schools: 0.15,
    transit: 0.20,
    healthcare: 0.15,
    roads: 0.15,
    landuse: 0.20,
    envRisk: 0.20,
    demographics: 0.15,
    maxSignalBoost: 0.15,
  },
  civic_land: {
    amenityDensity: 0.10,
    competitor: 0.05,
    schools: 0.30,    // schools on civic land
    healthcare: 0.30, // hospitals, clinics
    transit: 0.20,
    roads: 0.10,
    landuse: 0.15,
    envRisk: 0.15,
    demographics: 0.20,
    maxSignalBoost: 0.15,
  },
};
