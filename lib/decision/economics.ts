/**
 * Atlas — Per-vertical SA plot economics.
 *
 * Feeds the "Plot economics" row of the per-site Decision Block. The
 * brief from a real SA property developer was: "we need to know if we
 * can legally, commercially, and financially build there". This file
 * is the *financially* half — it turns a vertical id into the money
 * shape of the deal: what the land costs, what the build costs, what
 * working capital you need to open the doors, and roughly how long
 * before the thing pays for itself.
 *
 * UNITS
 *   Every *ZAR field is South African Rand, nominal, 2024/25 money.
 *   dailyMargin* is GROSS margin per trading day (revenue less direct
 *   cost of sales) — NOT net profit. Rent, staff, utilities, debt
 *   service and tax all still come out of it. Payback computed off
 *   gross margin is therefore optimistic by roughly 2x, which is why
 *   every vertical also carries an industry-observed paybackLow/High
 *   band. The UI renders both so the developer sees the spread.
 *
 * SOURCING
 *   These are order-of-magnitude planning numbers, not a valuation.
 *   Each block cites where the figure came from. Where two sources
 *   disagreed we took the conservative (worse-for-the-developer) end:
 *   higher cost, lower margin, longer payback. Atlas would rather a
 *   developer be pleasantly surprised than talked into a bad erf.
 *
 * This module is server-safe — no React, no browser APIs.
 */

export type VerticalEconomics = {
  landLowZAR: number;       // typical land price low (ZAR)
  landHighZAR: number;
  buildLowZAR: number;      // typical build cost low (ZAR)
  buildHighZAR: number;
  workingCapitalZAR: number; // typical working capital requirement
  dailyMarginLowZAR: number; // typical daily gross margin
  dailyMarginHighZAR: number;
  expectedDailyVolumeLow: number;  // vertical-specific volume unit
  expectedDailyVolumeHigh: number;
  paybackLowYears: number;
  paybackHighYears: number;
  notes: string;            // 1-sentence SA-specific note for the developer
};

/**
 * Keyed by Atlas vertical id (same ids used by lib/connectors/competitors.ts
 * and lib/land/verticals.ts).
 */
export const VERTICAL_ECONOMICS: Record<string, VerticalEconomics> = {
  /**
   * Fuel station (new-to-industry forecourt).
   *
   * Margin: the retail petrol margin is GAZETTED, not negotiated —
   * DMRE Regulated Fuel Price gazette, 2024 basic fuel price
   * structure, retail margin ~R2.10/litre on 93/95 unleaded. That is
   * the single most defensible number in this whole file.
   * Volume: 8-15 kl/day is the SA industry band for a viable
   * non-highway site (Sasol / Engen dealer prospectus guidance,
   * 2023); sub-8 kl/day sites are widely treated as unbankable.
   * Capex: an NTI forecourt (tanks, canopy, pumps, shop, civils)
   * runs R12-28M ex-land — SAPIA member build-cost commentary 2023/24.
   * Land: R4-12M for a corner/arterial site of 2,000-4,000 m².
   */
  gas_station: {
    landLowZAR: 4_000_000,
    landHighZAR: 12_000_000,
    buildLowZAR: 12_000_000,
    buildHighZAR: 28_000_000,
    workingCapitalZAR: 2_500_000, // ~R1.5M fuel stock + shop stock + float
    // 8 kl/day x R2.10 = R16.8k ; 15 kl/day x R2.10 = R31.5k
    dailyMarginLowZAR: 16_800,
    dailyMarginHighZAR: 31_500,
    expectedDailyVolumeLow: 8,   // kl/day
    expectedDailyVolumeHigh: 15, // kl/day
    paybackLowYears: 6,
    paybackHighYears: 10,
    notes:
      "Fuel margin is regulated at ~R2.10/l, so volume is the only lever — below 8 kl/day an SA forecourt does not service its debt, and the convenience shop typically carries 30-40% of site profit.",
  },

  /**
   * Sit-down restaurant.
   *
   * Margin: R150-300 gross margin per seat per trading day at 40-80
   * seats — derived from SA casual-dining benchmarks (Restaurant
   * Association of South Africa operator surveys 2023; ~65-70% food
   * gross margin on an average R220-450 spend with 1.2-1.8 turns).
   * Fit-out: R12-20k/m² for 150-300 m² front + back of house
   * (AECOM Africa Property & Construction Cost Guide 2024).
   * Most SA restaurants LEASE — land figures are for the owner-
   * occupier case (small commercial erf).
   */
  restaurant: {
    landLowZAR: 1_500_000,
    landHighZAR: 6_000_000,
    buildLowZAR: 1_200_000,
    buildHighZAR: 4_000_000,
    workingCapitalZAR: 600_000, // ~3 months opex + stock + deposits
    // 40 seats x R150 = R6k ; 80 seats x R300 = R24k
    dailyMarginLowZAR: 6_000,
    dailyMarginHighZAR: 24_000,
    expectedDailyVolumeLow: 40, // seats
    expectedDailyVolumeHigh: 80,
    paybackLowYears: 3,
    paybackHighYears: 6,
    notes:
      "Most SA restaurants lease rather than buy — if the landlord wants more than ~8-10% of turnover in rent the site is uneconomic no matter how good the footfall.",
  },

  /**
   * Warehouse / light industrial (build-to-rent or owner-occupied).
   *
   * Rental: R25-50/m²/month gross on modern A-grade SA industrial
   * space (SAPOA Industrial Vacancy Report 2024; Gauteng and Western
   * Cape logistics nodes sit at the top of that band, secondary
   * nodes at the bottom).
   * Build: R7,000-R9,000/m² for a warehouse shell with offices
   * (AECOM Africa Cost Guide 2024) — 2,000-5,000 m² typical unit.
   * Yield: SA REIT Association 2024 sector data puts industrial
   * capitalisation rates around 9.5-11%, i.e. ~9-11 year payback.
   */
  warehouse: {
    landLowZAR: 3_000_000,
    landHighZAR: 15_000_000,
    buildLowZAR: 14_000_000,  // ~2,000 m² @ R7k
    buildHighZAR: 45_000_000, // ~5,000 m² @ R9k
    workingCapitalZAR: 1_500_000,
    // 2,000 m² x R25/mo / 30 = ~R1,667/day ; 5,000 m² x R50/mo / 30 = ~R8,333/day
    dailyMarginLowZAR: 1_667,
    dailyMarginHighZAR: 8_333,
    expectedDailyVolumeLow: 2_000,  // m² lettable
    expectedDailyVolumeHigh: 5_000,
    paybackLowYears: 8,
    paybackHighYears: 12,
    notes:
      "Industrial is a yield play, not a trading business — Eskom-independent power and a 24m yard depth now move SA rentals more than the address does.",
  },

  /**
   * Retail shop (line shop / convenience retail).
   *
   * Margin: R300-800 gross margin per m² per month on 150-400 m²
   * of trading area — SA convenience and speciality retail turnover
   * densities (SACSC Research retail trading density reports 2023/24)
   * discounted to gross margin at ~20-25%.
   * Fit-out: R10-15k/m² shopfit (AECOM Africa Cost Guide 2024).
   */
  retail_shop: {
    landLowZAR: 2_000_000,
    landHighZAR: 8_000_000,
    buildLowZAR: 1_500_000,
    buildHighZAR: 6_000_000,
    workingCapitalZAR: 800_000, // stock + deposits + 3 months opex
    // 150 m² x R300/mo / 30 = R1,500/day ; 400 m² x R800/mo / 30 = ~R10,667/day
    dailyMarginLowZAR: 1_500,
    dailyMarginHighZAR: 10_667,
    expectedDailyVolumeLow: 150, // m² trading area
    expectedDailyVolumeHigh: 400,
    paybackLowYears: 4,
    paybackHighYears: 7,
    notes:
      "Trading density beats floor area in SA retail — a 200 m² shop on a taxi-rank desire line outperforms a 400 m² shop 300 m off it.",
  },

  /**
   * Residential land development (erven + top structure).
   *
   * Returns: 12-18% IRR is the standard SA residential developer
   * hurdle (SA Property Owners Association / SAPOA developer return
   * commentary 2023-24; bank development-finance credit teams
   * typically want 15%+ before gearing).
   * Land + bulk services: R3-10M for a developable parcel; internal
   * civils and bulk contributions to the municipality frequently add
   * 20-30% on top of the raw land price in CoCT and CoJ.
   */
  residential_land: {
    landLowZAR: 3_000_000,
    landHighZAR: 10_000_000,
    buildLowZAR: 8_000_000,   // civils, services, top structures
    buildHighZAR: 30_000_000,
    workingCapitalZAR: 2_000_000, // holding costs, rates, professional team
    // annualised developer margin expressed per day:
    // 12% x R15M / 365 = ~R4,930 ; 18% x R30M / 365 = ~R14,800
    dailyMarginLowZAR: 4_930,
    dailyMarginHighZAR: 14_800,
    expectedDailyVolumeLow: 20, // erven / units per phase
    expectedDailyVolumeHigh: 80,
    paybackLowYears: 5,
    paybackHighYears: 8,
    notes:
      "In SA the township-establishment and bulk-services approval clock (often 18-36 months) costs more than the land does — price the holding cost, not just the purchase.",
  },

  /**
   * Commercial land (retail / office / mixed-use development).
   *
   * Yield: 8-12% — SA REIT Association 2024 sector yields put prime
   * office and retail at the lower end and secondary nodes at the
   * higher end. Post-COVID office vacancy (SAPOA Office Vacancy
   * Report 2024, still ~14%) is why we default to the wide band.
   */
  commercial_land: {
    landLowZAR: 2_000_000,
    landHighZAR: 8_000_000,
    buildLowZAR: 6_000_000,
    buildHighZAR: 25_000_000,
    workingCapitalZAR: 1_500_000,
    // 8% x R12M / 365 = ~R2,630 ; 12% x R25M / 365 = ~R8,220
    dailyMarginLowZAR: 2_630,
    dailyMarginHighZAR: 8_220,
    expectedDailyVolumeLow: 800,   // m² lettable
    expectedDailyVolumeHigh: 3_000,
    paybackLowYears: 8,
    paybackHighYears: 12,
    notes:
      "SA office vacancy is still around 14%, so a commercial build without a signed anchor tenant is speculative — secure the pre-let before transfer.",
  },
};

/**
 * Conservative fallback for verticals with no researched profile
 * (industrial_land, agricultural_land, civic_land, custom:* verticals).
 * Deliberately pessimistic: small margin, long payback. If Atlas does
 * not know the vertical it should not flatter the deal.
 */
export const DEFAULT_ECONOMICS: VerticalEconomics = {
  landLowZAR: 1_500_000,
  landHighZAR: 6_000_000,
  buildLowZAR: 3_000_000,
  buildHighZAR: 12_000_000,
  workingCapitalZAR: 1_000_000,
  dailyMarginLowZAR: 1_500,
  dailyMarginHighZAR: 5_000,
  expectedDailyVolumeLow: 1,
  expectedDailyVolumeHigh: 1,
  paybackLowYears: 7,
  paybackHighYears: 12,
  notes:
    "Atlas has no researched cost model for this vertical — these are conservative generic SA development figures, so treat them as a sanity check only.",
};

/**
 * Look up the economics for a vertical. Unknown verticals — including
 * the `custom:` prefixed ones the intent classifier emits — fall back
 * to the conservative default.
 */
export function getEconomics(vertical: string): VerticalEconomics {
  const key = (vertical ?? "").trim().toLowerCase().replace(/^custom:/, "");
  return VERTICAL_ECONOMICS[key] ?? DEFAULT_ECONOMICS;
}

/**
 * Format a Rand amount at a human scale: R 1.2B / R 2.5M / R 250k / R 840.
 * Trailing ".0" is dropped so we render "R 5M", not "R 5.0M".
 */
export function formatZAR(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const neg = n < 0;
  const abs = Math.abs(n);

  const trim = (v: number, dp: number) =>
    v.toFixed(dp).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");

  let body: string;
  if (abs >= 1_000_000_000) body = `${trim(abs / 1_000_000_000, 1)}B`;
  else if (abs >= 1_000_000) body = `${trim(abs / 1_000_000, 1)}M`;
  // Below R10k a whole-number "k" loses too much — R1,667/day of
  // warehouse margin should not read as "R 2k".
  else if (abs >= 10_000) body = `${trim(abs / 1_000, 0)}k`;
  else if (abs >= 1_000) body = `${trim(abs / 1_000, 1)}k`;
  else body = `${Math.round(abs)}`;

  return `${neg ? "-" : ""}R ${body}`;
}

/**
 * Project a payback period from a known land price plus the vertical's
 * build cost, working capital and gross daily margin.
 *
 * `years` is measured on GROSS margin, so it is a best case — the
 * vertical's paybackLowYears/paybackHighYears band is the realistic
 * net figure to show alongside it.
 *
 * Returns nulls when there is not enough to say anything honest
 * (no land price, or a vertical with no margin model).
 */
export function projectPayback(
  landPriceMid: number,
  vertical: string,
): { years: number | null; grossAnnualZAR: number | null } {
  const econ = getEconomics(vertical);

  const dailyMarginMid = (econ.dailyMarginLowZAR + econ.dailyMarginHighZAR) / 2;
  const grossAnnualZAR =
    dailyMarginMid > 0 ? Math.round(dailyMarginMid * 365) : null;

  if (
    !Number.isFinite(landPriceMid) ||
    landPriceMid <= 0 ||
    grossAnnualZAR == null
  ) {
    return { years: null, grossAnnualZAR };
  }

  const buildMid = (econ.buildLowZAR + econ.buildHighZAR) / 2;
  const totalDeploy = landPriceMid + buildMid + econ.workingCapitalZAR;
  const years = totalDeploy / grossAnnualZAR;

  return { years: Number(years.toFixed(1)), grossAnnualZAR };
}
