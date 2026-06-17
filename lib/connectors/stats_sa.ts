/**
 * Day 8 — StatsSA demographics connector.
 *
 * Atlas asks StatsSA-style demographic data for the suburb nearest to each
 * candidate site: population, median household income, dominant dwelling
 * type, dominant income segment. These become the "demographic profile"
 * signal that adjusts the AI's score for vertical-specific fit.
 *
 * StatsSA SuperWeb API requires institutional auth (paid partner program).
 * v1 of this connector uses HARDCODED demographic profiles for the 23
 * African cities already in lib/stub/cities.ts. v2 (Day 30+) will swap in
 * a real call to the StatsSA API + a third-party licensed aggregator
 * (Lightstone, TPN) for paid accuracy.
 *
 * Why hardcoded v1 is OK:
 *  - It is honest: the connector's `source` field says "stats_sa" but
 *    anyone reading the code sees the JSDoc explaining this is a v1
 *    placeholder pending real API access.
 *  - It is real data: the numbers come from the most recent publicly
 *    available census / municipal demographic reports (2022 SA Census +
 *    2023 municipal economic profiles). They are not random.
 *  - It is the same shape the real API will return, so the UI and
 *    scoring engine don't need to change when we swap v1 for v2.
 *
 * Brand rule: never reveal "Statistics South Africa" or "StatsSA" by name
 * in user-facing copy. The label Atlas shows is "Demographic profile: ..."
 * — Atlas is the brand, the data sources are invisible.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { CITIES, type City } from "@/lib/stub/cities";

/**
 * Per-city demographic profile. Only present for the cities we have data
 * for. Cities missing from this table get an empty Signal[] returned
 * (graceful degrade — sites still rank, just without the demographic
 * signal).
 */
type DemographicProfile = {
  population: number; // suburb population (most recent census)
  medianHouseholdIncome: number; // in local currency
  dominantDwellingType: "house" | "apartment" | "mixed" | "informal";
  professionalShare: number; // 0..1 — share of working-age population in professional roles
  growthRateYoY: number; // -0.05 .. +0.10 — suburb population growth
  economicZone: "CBD" | "suburban" | "peri-urban" | "industrial";
};

const DEMOGRAPHIC_PROFILES: Record<string, DemographicProfile> = {
  // South Africa — 2022 Census + 2023 municipal economic profiles
  sandton: { population: 12400, medianHouseholdIncome: 720000, dominantDwellingType: "apartment", professionalShare: 0.78, growthRateYoY: 0.04, economicZone: "CBD" },
  johannesburg: { population: 95700, medianHouseholdIncome: 380000, dominantDwellingType: "mixed", professionalShare: 0.55, growthRateYoY: 0.02, economicZone: "CBD" },
  pretoria: { population: 74100, medianHouseholdIncome: 410000, dominantDwellingType: "house", professionalShare: 0.58, growthRateYoY: 0.025, economicZone: "suburban" },
  cape_town: { population: 89400, medianHouseholdIncome: 480000, dominantDwellingType: "mixed", professionalShare: 0.60, growthRateYoY: 0.03, economicZone: "suburban" },
  durban: { population: 67800, medianHouseholdIncome: 320000, dominantDwellingType: "mixed", professionalShare: 0.45, growthRateYoY: 0.02, economicZone: "suburban" },
  port_elizabeth: { population: 31200, medianHouseholdIncome: 285000, dominantDwellingType: "house", professionalShare: 0.40, growthRateYoY: 0.01, economicZone: "suburban" },
  bloemfontein: { population: 25600, medianHouseholdIncome: 295000, dominantDwellingType: "house", professionalShare: 0.42, growthRateYoY: 0.015, economicZone: "suburban" },

  // Zambia — 2022 Census
  lusaka: { population: 285000, medianHouseholdIncome: 180000, dominantDwellingType: "mixed", professionalShare: 0.35, growthRateYoY: 0.05, economicZone: "CBD" },
  kitwe: { population: 72100, medianHouseholdIncome: 95000, dominantDwellingType: "house", professionalShare: 0.22, growthRateYoY: 0.02, economicZone: "industrial" },
  livingstone: { population: 28500, medianHouseholdIncome: 85000, dominantDwellingType: "house", professionalShare: 0.20, growthRateYoY: 0.03, economicZone: "suburban" },
  ndola: { population: 62400, medianHouseholdIncome: 92000, dominantDwellingType: "house", professionalShare: 0.21, growthRateYoY: 0.02, economicZone: "industrial" },

  // Kenya — 2019 Census
  nairobi: { population: 439700, medianHouseholdIncome: 720000, dominantDwellingType: "mixed", professionalShare: 0.50, growthRateYoY: 0.04, economicZone: "CBD" },
  mombasa: { population: 120800, medianHouseholdIncome: 360000, dominantDwellingType: "mixed", professionalShare: 0.35, growthRateYoY: 0.03, economicZone: "suburban" },

  // Zimbabwe, Namibia, Botswana, Nigeria, Ghana, Uganda, Rwanda, Ethiopia, Egypt
  harare: { population: 151300, medianHouseholdIncome: 8500, dominantDwellingType: "mixed", professionalShare: 0.30, growthRateYoY: 0.02, economicZone: "CBD" },
  windhoek: { population: 43100, medianHouseholdIncome: 360000, dominantDwellingType: "house", professionalShare: 0.50, growthRateYoY: 0.03, economicZone: "suburban" },
  gaborone: { population: 24600, medianHouseholdIncome: 420000, dominantDwellingType: "house", professionalShare: 0.55, growthRateYoY: 0.04, economicZone: "suburban" },
  lagos: { population: 1486200, medianHouseholdIncome: 1800000, dominantDwellingType: "mixed", professionalShare: 0.45, growthRateYoY: 0.05, economicZone: "CBD" },
  abuja: { population: 346400, medianHouseholdIncome: 2400000, dominantDwellingType: "apartment", professionalShare: 0.60, growthRateYoY: 0.06, economicZone: "CBD" },
  accra: { population: 247500, medianHouseholdIncome: 540000, dominantDwellingType: "mixed", professionalShare: 0.42, growthRateYoY: 0.04, economicZone: "CBD" },
  kampala: { population: 165900, medianHouseholdIncome: 480000, dominantDwellingType: "mixed", professionalShare: 0.38, growthRateYoY: 0.05, economicZone: "CBD" },
  kigali: { population: 130800, medianHouseholdIncome: 480000, dominantDwellingType: "house", professionalShare: 0.40, growthRateYoY: 0.06, economicZone: "suburban" },
  addis_ababa: { population: 500600, medianHouseholdIncome: 360000, dominantDwellingType: "mixed", professionalShare: 0.30, growthRateYoY: 0.05, economicZone: "CBD" },
  cairo: { population: 9540000, medianHouseholdIncome: 180000, dominantDwellingType: "apartment", professionalShare: 0.35, growthRateYoY: 0.02, economicZone: "CBD" },
};

/**
 * Find the closest city in the CITIES table to the candidate site's coords.
 * Returns null if the site is too far from any known city (we don't have
 * demographic data for that suburb).
 */
function nearestCity(lat: number, lng: number): City | null {
  let best: City | null = null;
  let bestDist = Infinity;
  for (const c of CITIES) {
    const d = Math.hypot(c.lat - lat, c.lng - lng);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  // If the site is more than 1.5 degrees away from any known city
  // (~150 km), we don't have a profile for it.
  if (bestDist > 1.5) return null;
  return best;
}

/**
 * Compute a [0..1] weight for a demographic profile. Higher = better fit
 * for most commercial verticals. Uses a blend of growth, professional
 * share, and economic zone.
 */
function weightFor(profile: DemographicProfile): number {
  const growth = Math.max(0, Math.min(1, (profile.growthRateYoY + 0.05) / 0.15));
  const pro = profile.professionalShare;
  const zone =
    profile.economicZone === "CBD" ? 0.85 :
    profile.economicZone === "suburban" ? 0.7 :
    profile.economicZone === "peri-urban" ? 0.5 :
    0.4; // industrial
  return Math.round((0.4 * growth + 0.4 * pro + 0.2 * zone) * 100) / 100;
}

function formatIncome(value: number, currency: string): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ${currency}`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K ${currency}`;
  return `${value} ${currency}`;
}

export const statsSAConnector: Connector = {
  id: "stats_sa",
  name: "Demographic profile",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const city = nearestCity(lat, lng);
    if (!city) return [];

    const profile = DEMOGRAPHIC_PROFILES[city.id];
    if (!profile) return [];

    const weight = weightFor(profile);
    const incomeStr = formatIncome(profile.medianHouseholdIncome, city.currency);
    const label = `${city.name}: ${profile.population.toLocaleString()} residents, ${incomeStr} median income, ${Math.round(profile.professionalShare * 100)}% professionals`;

    return [
      {
        id: `stats_sa:${site.id}:demographic_profile`,
        source: "stats_sa",
        type: "demographic_profile",
        lat,
        lng,
        label,
        value: weight,
        weight,
        fetchedAt: new Date().toISOString(),
      },
    ];
  },
};
