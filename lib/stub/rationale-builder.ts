/**
 * Day 12 v13: rationale builder.
 *
 * Given the user's parsed question, the detected city, and
 * a real site from the catalog, build a 2-3 sentence
 * explanation that:
 *   1. Matches the question's intent ("to buy" / "to open"
 *      / "to build" / etc.)
 *   2. Names the specific reason this site fits
 *   3. Includes the actual road / suburb / landmark
 *   4. Adds a city-specific data point (distance from
 *      city centre, population density, etc.)
 *
 * Still a template engine, not an AI. When the AI comes
 * back online, the AI gets the same parsed tokens + the
 * same site data and produces a richer explanation.
 */

import type { City } from "./cities";
import { distanceKm, type ParsedQuestion } from "./question-parser";
import { SUBURB_PROFILES } from "@/lib/demographics/suburbs";
import type { RealSite } from "./real-sites";

/**
 * Extract a road / highway reference from a site name
 * (e.g. "N1 Highway interchange (Bloemfontein-bound)"
 * → "N1") or from the rationale text.
 */
function extractRoadRef(site: RealSite): string | undefined {
  const text = `${site.name} ${site.rationale}`;
  // South African road prefixes: N1, N2, N3, R27, R300 etc.
  const m = text.match(/\b([NR]\d{1,3})\b/);
  if (m) return m[1];
  // Named highways
  if (/great\s+north\s+road/i.test(text)) return "Great North Road";
  if (/great\s+east\s+road/i.test(text)) return "Great East Road";
  if (/kafue\s+road/i.test(text)) return "Kafue Road";
  if (/mombasa\s+road/i.test(text)) return "Mombasa Road";
  if (/thika\s+road/i.test(text)) return "Thika Road";
  if (/ngong\s+road/i.test(text)) return "Ngong Road";
  if (/waiyaki\s+way/i.test(text)) return "Waiyaki Way";
  if (/uhuru\s+highway/i.test(text)) return "Uhuru Highway";
  return undefined;
}

/**
 * Find the closest suburb in the city's Stats SA data to a
 * given lat/lng. Returns undefined if no suburb data exists.
 */
function nearestSuburb(cityId: string, lat: number, lng: number): {
  name: string;
  distanceKm: number;
  population: number;
  medianIncome: number;
  zone: string;
} | undefined {
  const suburbs = SUBURB_PROFILES[cityId];
  if (!suburbs || suburbs.length === 0) return undefined;
  let best: typeof suburbs[number] | undefined;
  let bestDist = Infinity;
  for (const s of suburbs) {
    const d = distanceKm(lat, lng, s.lat, s.lng);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  if (!best) return undefined;
  return {
    name: best.name,
    distanceKm: Math.round(bestDist * 10) / 10,
    population: best.population,
    medianIncome: best.medianHouseholdIncome,
    zone: best.economicZone,
  };
}

const INTENT_VERB: Record<ParsedQuestion["intent"], string> = {
  buy: "buy",
  rent: "rent",
  find: "find",
  open: "open",
  build: "build",
  develop: "develop",
  invest: "invest in",
  explore: "explore",
};

/**
 * Build a context-aware rationale for a site based on the
 * parsed question + the site data + the city's suburb data.
 *
 * Returns 2-3 sentences that:
 *   - Lead with what the user is trying to do (matches the
 *     question's intent)
 *   - Name the SPECIFIC reason this site fits
 *   - Include the actual road / suburb / landmark
 *   - Add a data point (distance, population, road traffic)
 */
export function buildRationale(
  question: ParsedQuestion,
  city: City,
  site: RealSite,
): string {
  const verb = INTENT_VERB[question.intent];
  const roadRef = extractRoadRef(site);
  const suburb = nearestSuburb(city.id, site.lat, site.lng);
  const distFromCentre = distanceKm(city.lat, city.lng, site.lat, site.lng);

  // Helper to build the road sentence
  const roadSentence = roadRef
    ? `Direct ${roadRef} frontage gives you the freight and commuter reach you need.`
    : "";

  // Helper to build the suburb sentence
  const suburbSentence = suburb
    ? `The nearest Stats SA suburb is ${suburb.name} (~${suburb.distanceKm} km from the site, ${suburb.population.toLocaleString()} residents, R ${suburb.medianIncome.toLocaleString()} median income).`
    : "";

  // Helper for the size hint
  const sizeSentence = question.sizeHint
    ? question.sizeHint === "smallholding"
      ? `Sized for smallholder buyers — typically 1-5 ha parcels.`
      : question.sizeHint === "estate"
      ? `Estate-scale — typically 5-20 ha parcels suitable for a lifestyle estate.`
      : question.sizeHint === "small"
      ? `Smaller-scale, low-overhead operation.`
      : question.sizeHint === "large"
      ? `Commercial-scale operation — significant upfront capital.`
      : `Mid-size operation.`
    : "";

  // Helper for budget hint
  const budgetSentence = question.budgetHint
    ? question.budgetHint === "low"
      ? `Lower land cost than premium corridors.`
      : question.budgetHint === "premium"
      ? `Premium positioning — expect top-decile land values.`
      : question.budgetHint === "high"
      ? `Above-average positioning.`
      : `Mid-market positioning.`
    : "";

  // Helper for distance hint
  const distanceSentence = question.distanceHint
    ? question.distanceHint === "near-city"
      ? `Within the city edge — short commute into the CBD.`
      : question.distanceHint === "outskirts"
      ? `On the urban-rural fringe — the right balance for most buyers.`
      : `Far enough from the city to feel rural, close enough to reach the market.`
    : "";

  // Helper for farm type
  const farmTypeSentence = question.farmType
    ? question.farmType === "cattle"
      ? `Mixed-pasture land with established grazing capacity, suitable for cattle.`
      : question.farmType === "grain"
      ? `Established grain / arable land, suitable for wheat / maize / canola.`
      : question.farmType === "vineyard"
      ? `Wine-route corridor with established viticulture zoning.`
      : question.farmType === "smallholder"
      ? `Smallholder-scale — well-suited to a 1-5 ha family operation.`
      : question.farmType === "poultry"
      ? `Suitable for poultry operations with established rural zoning.`
      : question.farmType === "flower"
      ? `Horticultural / floricultural land, close to the export market.`
      : question.farmType === "dairy"
      ? `Pasture land with established dairy zoning.`
      : `Mixed-farming land.`
    : "";

  // Site-specific sentence: extract the headline fact from
  // the catalog rationale. We pull just the first sentence
  // of the rationale and rewrite it as a one-liner
  // contextualised to the city.
  const headlineFact = site.rationale.split(".")[0] + ".";
  const kmFromCentre = Math.round(distFromCentre);
  const siteLocation = kmFromCentre < 1
    ? `in the heart of ${city.name}`
    : kmFromCentre < 10
    ? `${kmFromCentre} km from ${city.name} city centre`
    : `${kmFromCentre} km from ${city.name} city centre`;

  // Build the final 2-3 sentence rationale. Each sentence
  // is conditional — we don't include a sentence if the
  // matching token wasn't parsed.
  const sentences: string[] = [];

  // Sentence 1: lead with the user's intent + what the site is
  sentences.push(
    `To ${verb} ${intentTarget(question, city)} in ${siteLocation}: ${headlineFact}`,
  );

  // Sentence 2: the most contextually-relevant fact for the
  // parsed question. Order priority: farmType > access > size >
  // budget > distance > road. Each of these is conditional so
  // the rationale reads naturally even if the user gave a
  // short prompt.
  const contextSentence =
    farmTypeSentence ||
    roadSentence ||
    (question.accessHint ? `Direct ${question.accessHint.replace("near-", "")} access.` : "") ||
    sizeSentence ||
    budgetSentence ||
    distanceSentence ||
    "";
  if (contextSentence) sentences.push(contextSentence);

  // Sentence 3: the suburb / data point, if available
  if (suburbSentence) sentences.push(suburbSentence);

  return sentences.join(" ");
}

function intentTarget(q: ParsedQuestion, city: City): string {
  // Map (intent, vertical) to a human target phrase
  const v = (q.raw || "").toLowerCase();
  if (/\b(gas\s*station|petrol|fuel|filling\s*station)\b/.test(v)) return "a gas station";
  if (/\b(restaurant|cafe|food|dining|eatery)\b/.test(v)) return "a restaurant";
  if (/\b(warehouse|storage|logistics|fulfilment|fulfillment)\b/.test(v)) return "a warehouse";
  if (/\b(retail|shop|store|boutique|supermarket)\b/.test(v)) return "a retail site";
  if (/\b(farm|agricultural|farming|cattle|ranch|grain|vineyard|crop)\b/.test(v)) return "farmland";
  if (/\b(residential|house|home|housing|estate|smallholding)\b/.test(v)) return "residential land";
  if (/\b(commercial|office|business|shop)\b/.test(v)) return "commercial land";
  if (/\b(industrial|factory|manufacturing|plant)\b/.test(v)) return "industrial land";
  if (/\b(school|hospital|clinic|church|university)\b/.test(v)) return "a civic site";
  return "a site";
}
