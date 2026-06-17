/**
 * Day 7: Land verticals for the focused /land front door.
 *
 * This is the SUB-VERTICAL for the land/property wedge. We focus on
 * "land for development" — vacant plots, zoning, size, price.
 * NOT commercial property (warehouses/offices), NOT residential investment
 * (buy-to-rent, sectional title). Those are different products.
 *
 * The buyer persona is:
 *   - Land developer (raw land, building lots)
 *   - Property investor (buy to develop and sell)
 *   - Residential builder (small to mid-size developers)
 *
 * NOT: tenant, NOT renter, NOT commercial lessee.
 */
export const LAND_VERTICALS = [
  {
    value: "residential_land",
    label: "Residential land",
    description: "Vacant plots zoned for housing",
  },
  {
    value: "commercial_land",
    label: "Commercial land",
    description: "Plots zoned for retail, office, mixed-use",
  },
  {
    value: "agricultural_land",
    label: "Agricultural land",
    description: "Farms, smallholdings, grazing",
  },
  {
    value: "industrial_land",
    label: "Industrial land",
    description: "Warehouses, light industrial, logistics",
  },
  {
    value: "mixed_use_land",
    label: "Mixed-use land",
    description: "Plots that allow residential + commercial",
  },
] as const;

export type LandVertical = (typeof LAND_VERTICALS)[number]["value"];

/**
 * Pre-filled sample questions for the /land page. These are the questions
 * we want demo users to try first — they map to the buyer persona.
 */
export const LAND_SAMPLE_QUESTIONS = [
  "Where in Sandton for vacant land for development?",
  "Where in Cape Town for residential land to build on?",
  "Where in Lusaka for industrial land to develop?",
] as const;
