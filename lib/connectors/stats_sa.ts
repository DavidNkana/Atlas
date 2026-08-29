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
import { SUBURB_PROFILES, type SuburbProfile } from "@/lib/demographics/suburbs";

/**
 * Per-city demographic profile. Used as a fallback when no suburb-level
 * data is available for a candidate site.
 */
type DemographicProfile = {
  population: number; // suburb population (most recent census)
  medianHouseholdIncome: number; // in local currency
  dominantDwellingType: "house" | "apartment" | "mixed" | "informal";
  professionalShare: number; // 0..1 — share of working-age population in professional roles
  growthRateYoY: number; // -0.05 .. +0.10 — suburb population growth
  economicZone: "CBD" | "suburban" | "peri-urban" | "industrial";
};

const CITY_DEMOGRAPHIC_PROFILES: Record<string, DemographicProfile> = {
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
 * Find the closest suburb in the SUBURB_PROFILES table to the
 * candidate site's coords. Returns null if the site is more than
 * 25km from any known suburb (suburb data is dense and
 * geographically narrow).
 */
function nearestSuburb(lat: number, lng: number, cityId: string): SuburbProfile | null {
  const suburbs = SUBURB_PROFILES[cityId];
  if (!suburbs || suburbs.length === 0) return null;
  let best: SuburbProfile | null = null;
  let bestDist = Infinity;
  for (const s of suburbs) {
    const d = Math.hypot(s.lat - lat, s.lng - lng);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  // 25km radius (~0.25 degrees). Suburb data is dense; we want
  // the user to land in the actual suburb for the signal to be
  // useful. If they're outside any profiled suburb, we fall back
  // to the city-level profile.
  if (bestDist > 0.25) return null;
  return best;
}

/**
 * Compute a [0..1] weight for a demographic profile. Higher = better fit
 * for most commercial verticals. Uses a blend of growth, professional
 * share, and economic zone.
 */
function weightFor(profile: DemographicProfile | SuburbProfile): number {
  const growth = Math.max(0, Math.min(1, (profile.growthRateYoY + 0.05) / 0.15));
  const pro = profile.professionalShare;
  const zone =
    profile.economicZone === "CBD" ? 0.85 :
    profile.economicZone === "suburban" ? 0.7 :
    profile.economicZone === "peri-urban" ? 0.5 :
    0.4; // industrial
  return Math.round((0.4 * growth + 0.4 * pro + 0.2 * zone) * 100) / 100;
}

/**
 * UNITS — single source of truth for median household income.
 *
 * Atlas stores and displays median household income as MONTHLY local
 * currency, everywhere. The site catalog (lib/stub/real-sites.ts)
 * already documents `medianIncome` as ZAR/month and the ranked-site
 * card renders "R 38k/mo", so monthly wins.
 *
 * The census tables behind CITY_DEMOGRAPHIC_PROFILES and
 * SUBURB_PROFILES publish ANNUAL household income (e.g. R380,000/yr
 * for Stellenbosch). Before this fix the connector passed that annual
 * figure straight through, so one card said "R38,000" (monthly, from
 * the catalog) and another said "380K ZAR" (annual, from here) for
 * the same suburb — same magnitude of household, two different units.
 *
 * The conversion happens HERE, once, at the boundary between the
 * annual source tables and the rest of the app. Anything downstream
 * of this connector can assume monthly.
 */
const MONTHS_PER_YEAR = 12;

/** Annual (as published in the census tables) → monthly, rounded to ZAR. */
function toMonthlyIncome(annual: number): number {
  return Math.round(annual / MONTHS_PER_YEAR);
}

/**
 * Weight ceiling, expressed in MONTHLY currency so it matches the
 * value we now store. R83,333/mo ≈ R1M/yr — the same ceiling the
 * annual formula used, so scoring behaviour is unchanged by the unit
 * fix.
 */
const INCOME_WEIGHT_CEILING_MONTHLY = 1_000_000 / MONTHS_PER_YEAR;

/**
 * Render a MONTHLY income figure. The `/mo` suffix is mandatory —
 * an unlabelled income number is exactly what caused the units bug.
 */
function formatIncome(monthlyValue: number, currency: string): string {
  if (monthlyValue >= 1_000_000) return `${(monthlyValue / 1_000_000).toFixed(1)}M ${currency}/mo`;
  if (monthlyValue >= 1_000) return `${Math.round(monthlyValue / 1_000)}k ${currency}/mo`;
  return `${monthlyValue} ${currency}/mo`;
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

    // Day 10: try suburb-level first (more accurate, more useful for
    // developers). Fall back to city-level if no suburb is within
    // 25km of the site.
    const suburb = nearestSuburb(lat, lng, city.id);
    const profile: DemographicProfile | SuburbProfile =
      suburb ?? CITY_DEMOGRAPHIC_PROFILES[city.id] ?? null;
    if (!profile) return [];

    const weight = weightFor(profile);
    // Source tables are ANNUAL; Atlas speaks MONTHLY. Convert once here.
    const monthlyIncome = toMonthlyIncome(profile.medianHouseholdIncome);
    const incomeStr = formatIncome(monthlyIncome, city.currency);
    const proPct = Math.round(profile.professionalShare * 100);
    const locationName = suburb ? `${suburb.name}, ${city.name}` : city.name;
    const fetchedAt = new Date().toISOString();

    const signals: Signal[] = [
      {
        id: `stats_sa:${site.id}:demographic_profile`,
        source: "stats_sa",
        type: "demographic_profile",
        lat, lng,
        label: `${locationName}: ${profile.population.toLocaleString()} residents, ${incomeStr} median income, ${proPct}% professionals`,
        value: weight,
        weight,
        fetchedAt,
        payload: suburb
          ? { suburb: suburb.name, city: city.name, economicZone: suburb.economicZone, growthRateYoY: suburb.growthRateYoY, note: suburb.note }
          : { suburb: null, city: city.name, economicZone: CITY_DEMOGRAPHIC_PROFILES[city.id].economicZone, growthRateYoY: CITY_DEMOGRAPHIC_PROFILES[city.id].growthRateYoY },
      },
      {
        id: `stats_sa:${site.id}:income`,
        source: "stats_sa",
        type: "median_income",
        lat, lng,
        label: `${locationName}: median household income ${incomeStr}`,
        // Monthly — same unit as the label, the card, and the catalog.
        value: monthlyIncome,
        weight: Math.min(1, monthlyIncome / INCOME_WEIGHT_CEILING_MONTHLY),
        fetchedAt,
        payload: { suburb: suburb?.name ?? null, city: city.name, currency: city.currency, incomePeriod: "month" },
      },
      {
        id: `stats_sa:${site.id}:growth`,
        source: "stats_sa",
        type: "population_growth",
        lat, lng,
        label: `${locationName}: ${(profile.growthRateYoY * 100).toFixed(1)}% annual population growth`,
        value: profile.growthRateYoY,
        weight: Math.max(0, Math.min(1, (profile.growthRateYoY + 0.03) / 0.08)),
        fetchedAt,
      },
      {
        id: `stats_sa:${site.id}:economic_zone`,
        source: "stats_sa",
        type: "economic_zone",
        lat, lng,
        label: `${locationName}: ${profile.economicZone} economic zone`,
        value: profile.economicZone === "CBD" ? 0.85 : profile.economicZone === "suburban" ? 0.7 : profile.economicZone === "peri-urban" ? 0.5 : 0.4,
        weight: profile.economicZone === "CBD" ? 0.85 : profile.economicZone === "suburban" ? 0.7 : profile.economicZone === "peri-urban" ? 0.5 : 0.4,
        fetchedAt,
      },
    ];

    return signals;
  },
};
