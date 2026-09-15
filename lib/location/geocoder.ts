/** Server-only, bounded Nominatim lookup for places not in the fast alias table. */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2_500;
const MIN_REQUEST_INTERVAL_MS = 1_100;

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  type?: string;
  address?: Record<string, string | undefined>;
};

type CacheEntry = { expiresAt: number; result: NominatimResult | null };
const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;
let inFlight: Promise<void> = Promise.resolve();

function normalizeQuery(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function isSouthAfrican(result: NominatimResult): boolean {
  const address = result.address ?? {};
  return address.country_code?.toLowerCase() === "za";
}

function candidateScore(result: NominatimResult): number {
  const address = result.address ?? {};
  const typeScore = result.type === "suburb" || result.type === "city" || result.type === "town" ? 3 : 0;
  const parentScore = address.municipality || address.city || address.town ? 2 : 0;
  return typeScore + parentScore;
}

async function waitForRateLimit(): Promise<void> {
  const previous = inFlight;
  let release!: () => void;
  inFlight = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const wait = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  release();
}

/** Returns a verified South African Nominatim result, or null. */
export async function geocodeSouthAfricanPlace(query: string): Promise<NominatimResult | null> {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const lookup = async (): Promise<NominatimResult | null> => {
    await waitForRateLimit();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const params = new URLSearchParams({
        q: `${query}, South Africa`,
        countrycodes: "za",
        format: "jsonv2",
        addressdetails: "1",
        limit: "5",
      });
      const response = await fetch(`${NOMINATIM_URL}?${params}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Atlas/1.0 (location resolution; server-side)" },
      });
      if (!response.ok) return null;
      const results = await response.json() as NominatimResult[];
      return results.filter(isSouthAfrican).sort((a, b) => candidateScore(b) - candidateScore(a))[0] ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const result = await lookup();
  cache.set(normalized, { result, expiresAt: Date.now() + (result ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS) });
  return result;
}

export function parseGeocoderCoordinates(result: NominatimResult): { lat: number; lng: number } | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -35 && lat <= -22 && lng >= 16 && lng <= 33 ? { lat, lng } : null;
}
