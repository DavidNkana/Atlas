/**
 * Day 17 v6 — Intent classifier.
 *
 * Atlas runs TWO engines per query. This classifier decides which
 * engine is the PRIMARY view the user sees:
 *
 *   spatial        — "Where should I build X in Y?"
 *                    Best with map + ranked sites + 10 signal connectors.
 *                    Engine A = Gemini Search.
 *
 *   conversational — "Which province/city is best for X?"
 *                    "Why is X good for Y?"
 *                    "Tell me about X."
 *                    Best with prose answer + cited sources.
 *                    Engine B = Tavily + Gemini.
 *
 * Both engines ALWAYS run in parallel. The classifier just picks
 * the primary view. The user can switch tabs to see the other.
 *
 * Routing signals (case-insensitive, word-boundary where possible):
 *
 *   SPATIAL:
 *     - "where (in|should|can|to)" + city/place
 *     - "best site/location/area/place"
 *     - "build/open/locate/find me"
 *     - "in <City>" pattern (Cape Town, Sandton, Lusaka, etc.)
 *     - vertical keywords (school, restaurant, warehouse, hospital,
 *       gas station, plot, etc.)
 *
 *   CONVERSATIONAL:
 *     - "which province / country / city is best"
 *     - "why is X good / fit / suitable"
 *     - "what is X / what's the market for X"
 *     - "tell me about X"
 *     - "is X a good fit"
 *     - "Atlas" / "about Atlas" (meta questions about the product)
 *
 * If both signals are present, spatial wins (more specific).
 * Default is conversational (more general).
 */

const SPATIAL_PATTERNS: RegExp[] = [
  // "where in X should I build/open/locate Y"
  /\bwhere\s+(in|should|can|to|do|would)\b/i,
  // "best site/location/area/place for X"
  /\bbest\s+(site|location|area|place|spot|land)\b/i,
  // action verbs that imply a site is needed
  /\b(build|open|locate|find me|set up|start|establish)\b/i,
  // "for a school in Y" / "for a restaurant near Z"
  /\bfor\s+(a|an|the)?\s*(school|restaurant|warehouse|hospital|gas station|cafe|shop|hotel|office|home|house|apartment|clinic|bank|gym|store|factory|plant)\b/i,
  // "in Cape Town" / "near Sandton" — explicit place anchor
  /\b(in|near|around|at)\s+(cape town|sandton|johannesburg|pretoria|durban|bloemfontein|port elizabeth|lusaka|kitwe|ndola|nairobi|mombasa|lagos|abuja|maputo|kigali|kampala|dar es salaam|harare|windhoek|gaborone)\b/i,
];

const CONVERSATIONAL_PATTERNS: RegExp[] = [
  // "which province / country / city is best for X"
  /\bwhich\s+(province|country|city|african|region|market|sector|industry|vertical)\s+(is|has|are|do|does|would)\b/i,
  // "why is X good / fit / suitable for Y"
  /\bwhy\s+(is|are|does|would|should)\b/i,
  // "what is X / what's the market for X / tell me about X"
  /\b(what('?s)?|tell me about|explain|describe|how does|how do)\b/i,
  // "is X a good fit"
  /\bis\s+\w+\s+(a\s+)?(good|great|suitable|ideal|right)\s+fit\b/i,
  // "for expanding my fintech" — strategic question framing
  /\bfor\s+(expanding|launching|scaling|growing|entering|investing|funding)\s+(my|our|a)\b/i,
  // "market opportunity" / "potential for X"
  /\b(market opportunity|investment opportunity|growth potential|potential for|opportunity for)\b/i,
  // "stand for" / "stands for" / "what is Atlas"
  /\b(stand(s)? for|about atlas|what is atlas)\b/i,
];

export type Intent = "spatial" | "conversational";

export interface IntentResult {
  primary: Intent;
  spatialScore: number;
  conversationalScore: number;
  matchedSpatialPatterns: string[];
  matchedConversationalPatterns: string[];
}

/**
 * Classify a user query into spatial vs conversational intent.
 * Returns scores + matched patterns so the UI can show the user
 * why we picked this view.
 */
export function classifyIntent(question: string): IntentResult {
  const q = (question ?? "").trim();
  if (!q) {
    return {
      primary: "conversational",
      spatialScore: 0,
      conversationalScore: 0,
      matchedSpatialPatterns: [],
      matchedConversationalPatterns: [],
    };
  }

  let spatialScore = 0;
  let conversationalScore = 0;
  const matchedSpatialPatterns: string[] = [];
  const matchedConversationalPatterns: string[] = [];

  for (const re of SPATIAL_PATTERNS) {
    const m = q.match(re);
    if (m) {
      spatialScore += 1;
      matchedSpatialPatterns.push(m[0]);
    }
  }

  for (const re of CONVERSATIONAL_PATTERNS) {
    const m = q.match(re);
    if (m) {
      conversationalScore += 1;
      matchedConversationalPatterns.push(m[0]);
    }
  }

  // Spatial wins ties. Spatial is the more specific intent and the
  // spatial engine has more visualisation surface area.
  const primary: Intent =
    spatialScore >= conversationalScore ? "spatial" : "conversational";

  return {
    primary,
    spatialScore,
    conversationalScore,
    matchedSpatialPatterns,
    matchedConversationalPatterns,
  };
}
