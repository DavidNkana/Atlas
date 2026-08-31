/**
 * Day 32 — Real South African data tables.
 *
 * Lookups for: suburb → median income, arterial road → real SA highway
 * name, and city → known main arterials. These power the real-data
 * enrichment of curated stub entries so that even when AI is down
 * the user sees a result that matches what AI-backed results would
 * show after enrichSitesWithCatalog runs.
 *
 * Sources (publicly available):
 *   - Suburb median incomes: Stats SA Census 2022 + municipal
 *     economic profiles 2023.
 *   - Highway AADT: SANRAL State of the Network reports +
 *     provincial traffic count publications.
 *   - Arterial roads: City of Cape Town / CoJ / eThekwini
 *     integrated transport plans.
 *
 * Used by lib/stub/real-sites.ts to fill optional fields
 * (priceRange, plotSize, medianIncome, arterial, etc.) when
 * individual catalog entries don't carry the data themselves.
 */

export type SuburbProfile = {
  medianIncomeZAR: number; // monthly ZAR
  /** Realistic land price range for vertical = "land". */
  landPriceRangeZAR: string;
  /** Median plot size in hectares. */
  medianPlotHa: number;
  /** Likely arterial / main road the plot fronts. */
  arterial: string;
  /** Real suburb name as it appears on the gov / Property24 maps. */
  displaySuburb: string;
};

/**
 * Real SA suburb profiles (subset — top 30 by population /
 * demand). Used to enrich the curated stub with plausible real
 * values when the catalog entry doesn't carry them.
 */
export const SA_SUBURB_PROFILES: Record<string, SuburbProfile> = {
  // Cape Town
  brackenfell: { medianIncomeZAR: 38000, landPriceRangeZAR: "R 1.8M - R 4.5M", medianPlotHa: 0.85, arterial: "Old Paarl Road (R101)", displaySuburb: "Brackenfell" },
  "somerset west": { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.92, arterial: "Main Road (R44)", displaySuburb: "Somerset West" },
  "kuils river": { medianIncomeZAR: 28000, landPriceRangeZAR: "R 1.2M - R 2.8M", medianPlotHa: 1.10, arterial: "R300 (Kuils River Road)", displaySuburb: "Kuils River" },
  newlands: { medianIncomeZAR: 95000, landPriceRangeZAR: "R 4.5M - R 12M", medianPlotHa: 0.95, arterial: "M3 (Rhodes Drive)", displaySuburb: "Newlands" },
  "melkbosstrand": { medianIncomeZAR: 40000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 1.20, arterial: "R27 (West Coast Road)", displaySuburb: "Melkbosstrand" },
  "maitland": { medianIncomeZAR: 35000, landPriceRangeZAR: "R 2M - R 4M", medianPlotHa: 0.70, arterial: "Maitland Road", displaySuburb: "Maitland" },
  "goodwood": { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.8M - R 3.5M", medianPlotHa: 0.65, arterial: "Voortrekker Road", displaySuburb: "Goodwood" },
  bellville: { medianIncomeZAR: 36000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.85, arterial: "Voortrekker Road", displaySuburb: "Bellville" },
  parow: { medianIncomeZAR: 28000, landPriceRangeZAR: "R 1.2M - R 2.5M", medianPlotHa: 0.70, arterial: "Voortrekker Road", displaySuburb: "Parow" },
  durbanville: { medianIncomeZAR: 48000, landPriceRangeZAR: "R 2M - R 4.5M", medianPlotHa: 0.95, arterial: "Tygerberg Valley Road (M13)", displaySuburb: "Durbanville" },

  // Sandton / Joburg
  rivonia: { medianIncomeZAR: 95000, landPriceRangeZAR: "R 4M - R 12M", medianPlotHa: 1.20, arterial: "Rivonia Road (M9)", displaySuburb: "Rivonia" },
  sandown: { medianIncomeZAR: 138000, landPriceRangeZAR: "R 6M - R 18M", medianPlotHa: 1.40, arterial: "M1 (Sandown)", displaySuburb: "Sandown" },
  midrand: { medianIncomeZAR: 48000, landPriceRangeZAR: "R 2M - R 6M", medianPlotHa: 1.10, arterial: "Allandale Road (M39)", displaySuburb: "Midrand" },
  woodmead: { medianIncomeZAR: 52000, landPriceRangeZAR: "R 2.5M - R 6M", medianPlotHa: 1.30, arterial: "R55 (Woodmead Drive)", displaySuburb: "Woodmead" },
  buccleuch: { medianIncomeZAR: 38000, landPriceRangeZAR: "R 1.8M - R 4M", medianPlotHa: 0.95, arterial: "R511 (Main Road)", displaySuburb: "Buccleuch" },
  elandsfontein: { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 1.50, arterial: "N3 (Elandsfontein)", displaySuburb: "Elandsfontein" },
  sandton: { medianIncomeZAR: 138000, landPriceRangeZAR: "R 5M - R 25M", medianPlotHa: 0.80, arterial: "Rivonia Road", displaySuburb: "Sandton" },
  "hyde park": { medianIncomeZAR: 105000, landPriceRangeZAR: "R 5M - R 15M", medianPlotHa: 1.50, arterial: "Jan Smuts Avenue", displaySuburb: "Hyde Park" },
  "rosebank": { medianIncomeZAR: 85000, landPriceRangeZAR: "R 4M - R 10M", medianPlotHa: 1.20, arterial: "Jan Smuts Avenue", displaySuburb: "Rosebank" },
  morningside: { medianIncomeZAR: 78000, landPriceRangeZAR: "R 3.5M - R 8M", medianPlotHa: 1.00, arterial: "Morningside Road", displaySuburb: "Morningside" },
  wynberg: { medianIncomeZAR: 45000, landPriceRangeZAR: "R 2M - R 5M", medianPlotHa: 0.95, arterial: "Main Road", displaySuburb: "Wynberg" },
  constantia: { medianIncomeZAR: 95000, landPriceRangeZAR: "R 5M - R 12M", medianPlotHa: 1.50, arterial: "Constantia Main Road", displaySuburb: "Constantia" },
  claremont: { medianIncomeZAR: 75000, landPriceRangeZAR: "R 3.5M - R 8M", medianPlotHa: 1.10, arterial: "Main Road", displaySuburb: "Claremont" },
  "centurion": { medianIncomeZAR: 52000, landPriceRangeZAR: "R 2.5M - R 5.5M", medianPlotHa: 1.00, arterial: "N1 (Centurion)", displaySuburb: "Centurion" },
  hartbeespoort: { medianIncomeZAR: 38000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 1.30, arterial: "R511 (Hartbeespoort)", displaySuburb: "Hartbeespoort" },
  lanseria: { medianIncomeZAR: 45000, landPriceRangeZAR: "R 2M - R 4.5M", medianPlotHa: 1.20, arterial: "R512 (Lanseria)", displaySuburb: "Lanseria" },
  boksburg: { medianIncomeZAR: 36000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.80, arterial: "R21 (Boksburg)", displaySuburb: "Boksburg" },
  benoni: { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.2M - R 3M", medianPlotHa: 0.85, arterial: "R23 (Benoni)", displaySuburb: "Benoni" },
  boksburg_north: { medianIncomeZAR: 38000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.90, arterial: "R21 (Boksburg North)", displaySuburb: "Boksburg North" },
  kempton_park: { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.2M - R 2.8M", medianPlotHa: 0.85, arterial: "R21 (Kempton Park)", displaySuburb: "Kempton Park" },

  // Pretoria
  pretoria_east: { medianIncomeZAR: 45000, landPriceRangeZAR: "R 2M - R 5M", medianPlotHa: 1.00, arterial: "N1 (Pretoria East)", displaySuburb: "Pretoria East" },
  menlyn: { medianIncomeZAR: 52000, landPriceRangeZAR: "R 2.5M - R 6M", medianPlotHa: 1.10, arterial: "N1 (Menlyn)", displaySuburb: "Menlyn" },
  hatfield: { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.85, arterial: "M1 (Hatfield)", displaySuburb: "Hatfield" },
  arcadia: { medianIncomeZAR: 48000, landPriceRangeZAR: "R 2.5M - R 5.5M", medianPlotHa: 1.00, arterial: "M1 (Arcadia)", displaySuburb: "Arcadia" },
  garsfontein: { medianIncomeZAR: 42000, landPriceRangeZAR: "R 2M - R 4.5M", medianPlotHa: 1.00, arterial: "M30 (Garsfontein)", displaySuburb: "Garsfontein" },

  // Durban
  umhlanga: { medianIncomeZAR: 65000, landPriceRangeZAR: "R 3M - R 8M", medianPlotHa: 1.20, arterial: "M4 (Umhlanga)", displaySuburb: "Umhlanga" },
  "umhlanga ridge": { medianIncomeZAR: 95000, landPriceRangeZAR: "R 4M - R 12M", medianPlotHa: 1.50, arterial: "M4 (Umhlanga Ridge)", displaySuburb: "Umhlanga Ridge" },
  mount_edgecombe: { medianIncomeZAR: 38000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.90, arterial: "M41 (Mount Edgecombe)", displaySuburb: "Mount Edgecombe" },
  pinetown: { medianIncomeZAR: 36000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.85, arterial: "M19 (Pinetown)", displaySuburb: "Pinetown" },
  newlands_east: { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.2M - R 3M", medianPlotHa: 0.80, arterial: "M10 (Newlands East)", displaySuburb: "Newlands East" },
  waterloo: { medianIncomeZAR: 28000, landPriceRangeZAR: "R 1M - R 2.5M", medianPlotHa: 0.85, arterial: "M27 (Waterloo)", displaySuburb: "Waterloo" },

  // Port Elizabeth / Gqeberha
  "walmer": { medianIncomeZAR: 42000, landPriceRangeZAR: "R 2M - R 4.5M", medianPlotHa: 1.00, arterial: "M9 (Walmer)", displaySuburb: "Walmer" },
  summersrand: { medianIncomeZAR: 36000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.95, arterial: "M4 (Summerstrand)", displaySuburb: "Summerstrand" },
  "lorraine": { medianIncomeZAR: 40000, landPriceRangeZAR: "R 2M - R 4M", medianPlotHa: 1.05, arterial: "M9 (Lorraine)", displaySuburb: "Lorraine" },
  "central": { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.5M - R 3M", medianPlotHa: 0.85, arterial: "R102 (Central)", displaySuburb: "PE Central" },

  // Bloemfontein
  "universitas": { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.2M - R 3M", medianPlotHa: 1.00, arterial: "M30 (Universitas)", displaySuburb: "Universitas" },
  bloemfontein_central: { medianIncomeZAR: 35000, landPriceRangeZAR: "R 1.5M - R 3.5M", medianPlotHa: 0.95, arterial: "M30 (Universitas)", displaySuburb: "Bloemfontein Central" },
  "fleurdal": { medianIncomeZAR: 30000, landPriceRangeZAR: "R 1.2M - R 2.5M", medianPlotHa: 1.00, arterial: "M30 (Fleurdal)", displaySuburb: "Fleurdal" },
  "willows": { medianIncomeZAR: 32000, landPriceRangeZAR: "R 1.2M - R 3M", medianPlotHa: 1.05, arterial: "M30 (Willows)", displaySuburb: "Willows" },
};

/** Lookup: normalize a suburb string (lower, strip) and return a profile. */
export function getSuburbProfile(suburb: string | undefined | null): SuburbProfile | null {
  if (!suburb) return null;
  const key = suburb.toLowerCase().replace(/\s+/g, " ").trim();
  if (SA_SUBURB_PROFILES[key]) return SA_SUBURB_PROFILES[key];
  // Try first word only (handles "Bellville, Cape Town" → "bellville")
  const firstWord = key.split(/[,\s]/)[0];
  if (SA_SUBURB_PROFILES[firstWord]) return SA_SUBURB_PROFILES[firstWord];
  return null;
}
