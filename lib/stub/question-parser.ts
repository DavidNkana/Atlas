/**
 * Day 12 v13: question parser + rationale builder.
 *
 * The previous rationale was hardcoded per catalog entry:
 * every user question got the same explanation for the same
 * site. The user said: "Why Atlas picked should be a valid
 * reason at why what we asked for goes great in that area."
 *
 * Fix: parse the question for intent tokens, then build a
 * rationale that:
 *   (1) leads with what the user asked for (matches the
 *       question)
 *   (2) explains the SPECIFIC reason this site fits
 *   (3) names the actual road, suburb, or landmark the
 *       site is known for
 *   (4) includes a city-specific data point when relevant
 *       (median income, population, distance to city centre)
 *
 * This is still a template engine, not an AI. It runs in
 * the stub path. When the AI comes back online, the AI
 * will produce a richer explanation using these same
 * parsed tokens + the same site data.
 */

export type ParsedQuestion = {
  /** What the user actually wants to do */
  intent:
    | "buy"
    | "rent"
    | "find"
    | "open"
    | "build"
    | "develop"
    | "invest"
    | "explore";
  /** Optional sub-intent for agricultural queries */
  farmType?: "cattle" | "grain" | "vineyard" | "smallholder" | "poultry" | "mixed" | "flower" | "dairy";
  /** Optional size hint */
  sizeHint?: "small" | "medium" | "large" | "smallholding" | "estate";
  /** Optional distance hint */
  distanceHint?: "near-city" | "outskirts" | "far";
  /** Optional budget hint */
  budgetHint?: "low" | "mid" | "high" | "premium";
  /** Optional access hint */
  accessHint?: "near-highway" | "near-port" | "near-airport" | "near-rail" | "near-water";
  /** Suburb or street name mentioned */
  anchorName?: string;
  /** Raw question (kept for fallback) */
  raw: string;
};

const INTENT_KEYWORDS: Array<[ParsedQuestion["intent"], RegExp]> = [
  ["buy", /\b(buy|buying|purchase|purchasing|acquire|acquiring)\b/i],
  ["rent", /\b(rent|renting|lease|leasing)\b/i],
  ["find", /\b(find|finding|looking\s+for|need|searching\s+for)\b/i],
  ["open", /\b(open|opening|start|starting|launch|launching)\b/i],
  ["build", /\b(build|building|construct|constructing|develop|developing)\b/i],
  ["invest", /\b(invest|investing|investor|investment)\b/i],
  ["explore", /\b(explore|exploring|research|researching|survey|surveying)\b/i],
];

const FARM_TYPE_KEYWORDS: Array<[ParsedQuestion["farmType"], RegExp]> = [
  ["cattle", /\b(cattle|cow|cows|beef|herd|ranch|ranching|livestock)\b/i],
  ["grain", /\b(grain|wheat|maize|corn|soya|soy|canola|barley|crop|crops|cropping)\b/i],
  ["vineyard", /\b(vineyard|vineyards|wine|grape|grapes|winery|viticulture)\b/i],
  ["smallholder", /\b(smallholder|smallholding|smallholding|smallholdings|subsistence)\b/i],
  ["poultry", /\b(poultry|chicken|chickens|broiler|layers|eggs)\b/i],
  ["flower", /\b(flower|flowers|floriculture|horticulture|nursery|nurseries)\b/i],
  ["dairy", /\b(dairy|milk|creamery)\b/i],
];

const SIZE_KEYWORDS: Array<[ParsedQuestion["sizeHint"], RegExp]> = [
  ["smallholding", /\b(smallholding|smallholdings|small\s*holding|1\s*-?\s*5\s*ha|2\s*ha|5\s*ha)\b/i],
  ["small", /\b(small|tiny|small-scale|modest|compact|boutique)\b/i],
  ["medium", /\b(medium|mid-sized|moderate|family-size)\b/i],
  ["large", /\b(large|big|commercial-scale|industrial-scale|100\s*ha|500\s*ha|large-scale)\b/i],
  ["estate", /\b(estate|estates|lifestyle\s*estate|small\s*estate|gated)\b/i],
];

const DISTANCE_KEYWORDS: Array<[ParsedQuestion["distanceHint"], RegExp]> = [
  ["near-city", /\b(near|close|inside|inner|central|urban|city\s*centre|cbd|inner\s*city|township|townships)\b/i],
  ["outskirts", /\b(outskirts|suburb|suburban|periphery|peri-urban|edge|just\s*outside|20\s*km|30\s*km|within\s*30)\b/i],
  ["far", /\b(far|distant|remote|rural|countryside|isolated|far\s*away|outskirts\s*of\s*town)\b/i],
];

const BUDGET_KEYWORDS: Array<[ParsedQuestion["budgetHint"], RegExp]> = [
  ["low", /\b(cheap|affordable|low\s*cost|low-cost|budget|inexpensive|bargain)\b/i],
  ["mid", /\b(mid-range|mid\s*range|moderate|mid-tier|affordable\s*luxury|mid-market)\b/i],
  ["high", /\b(high-end|upscale|premium-but-not-luxury|quality)\b/i],
  ["premium", /\b(premium|ultra-premium|exclusive|top-tier|mansion|ultra-luxury|best-in-class)\b/i],
];

const ACCESS_KEYWORDS: Array<[ParsedQuestion["accessHint"], RegExp]> = [
  ["near-highway", /\b(near\s*highway|near\s*the\s*(N1|N2|N3|N4|N7|N12|R27|R300|R55|R21)|highway\s*access|off-ramp|on-ramp|motorway|expressway)\b/i],
  ["near-port", /\b(near\s*port|port\s*access|near\s*harbour|near\s*harbor)\b/i],
  ["near-airport", /\b(near\s*airport|near\s*OR\s*Tambo|near\s*CPT|airport\s*access|air-freight|air\s*freight)\b/i],
  ["near-rail", /\b(near\s*rail|rail\s*access|railway|near\s*station)\b/i],
];

/**
 * Parse a free-form question into structured intent tokens.
 * Always returns a ParsedQuestion (with raw text preserved)
 * even if no tokens matched — the rationale builder falls
 * back to a generic explanation in that case.
 */
export function parseQuestion(question: string): ParsedQuestion {
  const q = (question ?? "").trim();
  const out: ParsedQuestion = {
    intent: "find",
    raw: question ?? "",
  };
  for (const [intent, re] of INTENT_KEYWORDS) {
    if (re.test(q)) {
      out.intent = intent;
      break;
    }
  }
  for (const [farmType, re] of FARM_TYPE_KEYWORDS) {
    if (re.test(q)) {
      out.farmType = farmType;
      break;
    }
  }
  for (const [size, re] of SIZE_KEYWORDS) {
    if (re.test(q)) {
      out.sizeHint = size;
      break;
    }
  }
  for (const [distance, re] of DISTANCE_KEYWORDS) {
    if (re.test(q)) {
      out.distanceHint = distance;
      break;
    }
  }
  for (const [budget, re] of BUDGET_KEYWORDS) {
    if (re.test(q)) {
      out.budgetHint = budget;
      break;
    }
  }
  for (const [access, re] of ACCESS_KEYWORDS) {
    if (re.test(q)) {
      out.accessHint = access;
      break;
    }
  }
  // Pull any quoted text, "in {X}" or road reference
  out.anchorName = extractAnchorName(q);
  return out;
}

/**
 * Haversine distance in km between two lat/lng points.
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Extract the suburb / neighbourhood / road name mentioned in
 * the question, if any. Looks for quoted text, "in {X}" or
 * "near {X}", and known road prefixes (N1, N2, R27 etc.).
 */
export function extractAnchorName(question: string): string | undefined {
  const q = (question ?? "").trim();
  // Quoted text
  const quoted = q.match(/[""]([^""]+)[""]/);
  if (quoted) return quoted[1];
  // "in {Suburb}" or "near {Suburb}"
  const inMatch = q.match(/\b(?:in|near|around|by|at|on)\s+([A-Z][a-zA-Z\s-]{2,30})\b/);
  if (inMatch) return inMatch[1].trim();
  // Known South African road prefixes
  const roadMatch = q.match(/\b([N|R]\d{1,3})\b/);
  if (roadMatch) return roadMatch[1];
  return undefined;
}
