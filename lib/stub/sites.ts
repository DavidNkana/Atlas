import { City } from "./cities";

/**
 * Day 6 — generate 5 plausible site candidates for a (city, vertical)
 * pair, deterministically.
 *
 * The same (city, vertical) pair ALWAYS produces the same 5 sites.
 * That is critical for:
 *   - Tests (we can assert on the output)
 *   - User experience (asking the same question twice gives the same
 *     answer — important for the demo)
 *   - Caching (the planner can dedupe on city+vertical if needed)
 *
 * We use a tiny FNV-1a string hash + Mulberry32 LCG so the output is
 * deterministic across Node versions. The seed is `${city.id}::${vertical}`
 * which means the same city produces a different layout for different
 * verticals (so a gas_station query in Sandton doesn't show the same
 * 5 points as a restaurant query in Sandton).
 */

export type StubSite = {
  rank: number;
  name: string;
  lat: number;
  lng: number;
  score: number;
  confidence: number;
  rationale: string;
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mulberry32 — small, deterministic, good enough for stub randomness.
function makeRng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTICAL_LANDMARKS: Record<string, string[]> = {
  gas_station: [
    "Highway Interchange",
    "Commercial Node",
    "Residential Catchment",
    "Industrial Node",
    "CBD Fringe",
  ],
  restaurant: [
    "Tourist District",
    "Shopping Mall",
    "Business District",
    "Suburban Hub",
    "University Area",
  ],
  warehouse: [
    "Industrial Zone",
    "Highway Junction",
    "Rail Corridor",
    "Logistics Park",
    "Port Adjacency",
  ],
  retail_shop: [
    "Mall Precinct",
    "Tourist Strip",
    "CBD Corner",
    "Suburban Centre",
    "Transport Hub",
  ],
};

const VERTICAL_REASONS: Record<string, string[]> = {
  gas_station: [
    "High traffic volume on the {city} arterial road makes this a natural refuel stop for through-traffic and last-mile delivery.",
    "Commercial demand cluster in {city}: offices, retail, and services drive consistent weekday fuel demand.",
    "Residential catchment in {city} with limited nearby competition means loyal repeat customers.",
    "Industrial and logistics activity near {city} generates fleet refuel demand from trucks and vans.",
    "Tourist and commuter mixed demand around {city} centre keeps footfall high across dayparts.",
  ],
  restaurant: [
    "Tourist foot traffic in {city} creates a steady stream of one-off diners willing to pay premium.",
    "Captive audience at the {city} shopping destination — diners already in a spending mood.",
    "Office workers in {city} business district produce predictable weekday lunch and after-work demand.",
    "Family residential catchment in {city} suburb supports weekend casual dining.",
    "Student and young-professional density in {city} drives a high-frequency casual-dining market.",
  ],
  warehouse: [
    "Industrial zoning in {city} permits 24/7 heavy-vehicle operations and lower land costs.",
    "Highway interchange near {city} gives same-day reach to the regional distribution footprint.",
    "Rail freight corridor adjacent to {city} enables intermodal cost advantage.",
    "Designated logistics park near {city} offers shared security, customs, and bonded-warehouse support.",
    "Port-adjacent {city} location is ideal for import/export handling and cross-docking.",
  ],
  retail_shop: [
    "Mall precinct in {city} produces concentrated foot traffic and dwell time.",
    "Tourist strip in {city} delivers high-spend one-off visitors plus repeat local footfall.",
    "CBD corner location in {city} captures commuter flow at peak times.",
    "Suburban centre in {city} serves a stable middle-income residential catchment.",
    "Transport hub in {city} (taxi rank / BRT station) generates very high daily pass-through volume.",
  ],
};

const DEFAULT_LANDMARKS = [
  "Town Centre",
  "Main Road Junction",
  "Suburban Hub",
  "Industrial Node",
  "Residential Catchment",
];
const DEFAULT_REASONS = [
  "Catchment in {city} supports consistent demand for this vertical across dayparts.",
  "Mixed-use density in {city} makes this a flexible site for the vertical.",
  "Traffic flow through {city} centre generates a steady customer base.",
  "Under-served micro-market in {city} gives first-mover advantage.",
  "Anchor tenants and complementary businesses in {city} drive spill-over demand.",
];

/**
 * Generate 5 plausible site candidates for (city, vertical).
 *
 * Lat/lng offset: ±0.03 degrees in each axis (≈ ±3.3 km at the equator),
 * pseudo-randomly distributed. This keeps every site within reasonable
 * commuting distance of the city centre while still producing distinct
 * coordinates that the Mapbox auto-fit will spread across the viewport.
 */
export function generateStubSites(
  city: City,
  vertical: string,
): StubSite[] {
  const landmarks = VERTICAL_LANDMARKS[vertical] ?? DEFAULT_LANDMARKS;
  const reasons = VERTICAL_REASONS[vertical] ?? DEFAULT_REASONS;
  const seed = hashString(`${city.id}::${vertical}`);
  const rng = makeRng(seed);

  const sites: StubSite[] = [];
  for (let i = 0; i < 5; i++) {
    const dLat = (rng() - 0.5) * 0.06;
    const dLng = (rng() - 0.5) * 0.06;
    const lat = +(city.lat + dLat).toFixed(6);
    const lng = +(city.lng + dLng).toFixed(6);

    const landmark = landmarks[i % landmarks.length];
    const reason = (reasons[i % reasons.length] ?? "").replace(
      /\{city\}/g,
      city.name,
    );

    sites.push({
      rank: i + 1,
      name: `${landmark}, ${city.name}`,
      lat,
      lng,
      score: +(0.7 + rng() * 0.25).toFixed(2),
      confidence: +(0.5 + rng() * 0.25).toFixed(2),
      rationale: reason,
    });
  }
  return sites;
}
