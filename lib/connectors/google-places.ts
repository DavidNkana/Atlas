/**
 * LCP-64 — Google Places connector.
 *
 * Calls the Places API Nearby Search endpoint to find competitors and
 * existing businesses near a candidate site. Used to answer "what's
 * already here?" for any vertical — gas stations near a Sandton site,
 * wedding venues near a Constantia plot, restaurants near a CBD spot.
 *
 * API: /place/nearbysearch/json?location={lat},{lng}&radius={radius}&type={type}&key={KEY}
 * Key: GOOGLE_PLACES_API_KEY (separate from Maps key — server calls have
 * no HTTP referrer. Create one at console.cloud.google.com/apis/credentials
 * with no restriction or IP restriction). Falls back to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
 *
 * Business-type mapping: the vertical name (gas_station, restaurant, etc.)
 * is mapped to Google Places types. If no exact type match, we use a keyword
 * search which is less precise but covers the long tail (wedding_hall,
 * funeral_home, cattery, etc.).
 */

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const PLACES_BASE = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — competitors don't change hourly

/**
 * Map vertical IDs to Google Places types + keywords.
 * Exact types have their own Place type enum. Everything else
 * uses a keyword search, which is good enough for competitors.
 */
const VERTICAL_PLACES_MAP: Record<string, { type?: string; keyword: string }> = {
  gas_station: { type: "gas_station", keyword: "gas station" },
  restaurant: { type: "restaurant", keyword: "restaurant" },
  retail_shop: { type: "store", keyword: "retail shop" },
  retail: { type: "store", keyword: "retail store" },
  warehouse: { keyword: "warehouse" },
  hotel: { type: "lodging", keyword: "hotel" },
  office: { type: "office", keyword: "office space" },
  school: { type: "school", keyword: "school" },
  hospital: { type: "hospital", keyword: "hospital" },
  church: { type: "church", keyword: "church" },
  wedding_hall: { keyword: "wedding venue" },
  funeral_home: { keyword: "funeral home" },
  casino: { type: "casino", keyword: "casino" },
  gym: { type: "gym", keyword: "gym" },
  bank: { type: "bank", keyword: "bank" },
  pharmacy: { type: "pharmacy", keyword: "pharmacy" },
  car_wash: { type: "car_wash", keyword: "car wash" },
  shopping_mall: { type: "shopping_mall", keyword: "shopping mall" },
  cafe: { type: "cafe", keyword: "cafe" },
  bar: { type: "bar", keyword: "bar" },
  night_club: { type: "night_club", keyword: "night club" },
};

export interface NearbyPlace {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  types: string[];
  rating?: number;
  totalRatings?: number;
  /** Distance from the search point, in metres. */
  distanceM: number;
}

export interface NearbySearchResult {
  ok: boolean;
  places: NearbyPlace[];
  searchLat: number;
  searchLng: number;
  radiusM: number;
  searchedType?: string;
  searchedKeyword: string;
  error?: string;
}

const cache = new Map<
  string,
  { result: NearbySearchResult; expiresAt: number }
>();

let lastStatus: {
  status: "ok" | "no-key" | "error";
  errorSnippet?: string;
  lastFetchedAt?: string;
} = { status: "no-key" };

export function getGooglePlacesStatus() {
  return lastStatus;
}

/**
 * Resolve a vertical ID to a Google Places search type + keyword.
 * Falls back to keyword-only search for custom/unmapped verticals.
 */
export function verticalToPlacesSearch(vertical: string): {
  type?: string;
  keyword: string;
} {
  const base = vertical.replace(/^custom:/, "");
  const mapped = VERTICAL_PLACES_MAP[base];
  if (mapped) return mapped;
  // For unmapped verticals (e.g. "civic_land", "commercial_land"),
  // use the human-readable vertical name as a keyword.
  return { keyword: base.replace(/_/g, " ") };
}

/** Parse a vertical name from any format. */
function parseVertical(raw: string | undefined): string {
  if (!raw) return "";
  // "custom:wedding_hall" → "wedding_hall"
  // "gas_station" → "gas_station"
  return raw.replace(/^custom:/, "").toLowerCase().trim();
}

export async function geocodePlaceName(
  name: string,
  cityHint: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!PLACES_KEY || !name) return null;
  const query = encodeURIComponent(`${name}, ${cityHint}`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${PLACES_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const top = data?.results?.[0];
    if (top?.geometry?.location) {
      return { lat: top.geometry.location.lat, lng: top.geometry.location.lng };
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchNearbyCompetitors(opts: {
  lat: number;
  lng: number;
  vertical: string;
  radiusM?: number; // default 3000 (3km)
}): Promise<NearbySearchResult> {
  if (!PLACES_KEY) {
    lastStatus = { status: "no-key" };
    return {
      ok: false, places: [], searchLat: opts.lat, searchLng: opts.lng,
      radiusM: opts.radiusM ?? 3000, searchedKeyword: "",
      error: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set or not enabled for Places API",
    };
  }

  const radius = opts.radiusM ?? 3000;
  const vertical = parseVertical(opts.vertical);
  const { type, keyword } = verticalToPlacesSearch(vertical);

  const cacheKey = `${opts.lat.toFixed(4)},${opts.lng.toFixed(4)}:${vertical}:${radius}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  try {
    const params = new URLSearchParams({
      location: `${opts.lat},${opts.lng}`,
      radius: String(radius),
      key: PLACES_KEY,
    });
    if (type) params.set("type", type);
    if (keyword) params.set("keyword", keyword);

    const res = await fetch(`${PLACES_BASE}?${params.toString()}`);
    if (!res.ok) {
      const errText = await res.text();
      lastStatus = { status: "error", errorSnippet: errText.slice(0, 200), lastFetchedAt: new Date().toISOString() };
      return { ok: false, places: [], searchLat: opts.lat, searchLng: opts.lng, radiusM: radius, searchedType: type, searchedKeyword: keyword, error: `Places API ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json() as { status: string; results?: any[]; error_message?: string };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      lastStatus = { status: "error", errorSnippet: data.error_message ?? data.status, lastFetchedAt: new Date().toISOString() };
      return { ok: false, places: [], searchLat: opts.lat, searchLng: opts.lng, radiusM: radius, searchedType: type, searchedKeyword: keyword, error: `Places API: ${data.status} — ${data.error_message ?? "unknown error"}` };
    }

    const places: NearbyPlace[] = (data.results ?? []).map((p: any) => ({
      name: p.name ?? "Unknown",
      placeId: p.place_id ?? "",
      lat: p.geometry?.location?.lat ?? 0,
      lng: p.geometry?.location?.lng ?? 0,
      types: p.types ?? [],
      rating: p.rating,
      totalRatings: p.user_ratings_total,
      distanceM: 0, // approximate below from location
    }));

    // Compute approximate distance from search point
    for (const p of places) {
      p.distanceM = Math.round(
        haversineDistance(opts.lat, opts.lng, p.lat, p.lng) * 1000,
      );
    }
    places.sort((a, b) => a.distanceM - b.distanceM);

    const result: NearbySearchResult = {
      ok: true, places, searchLat: opts.lat, searchLng: opts.lng,
      radiusM: radius, searchedType: type, searchedKeyword: keyword,
    };

    cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    lastStatus = { status: "ok", lastFetchedAt: new Date().toISOString() };
    return result;
  } catch (err) {
    lastStatus = { status: "error", errorSnippet: err instanceof Error ? err.message : String(err), lastFetchedAt: new Date().toISOString() };
    return { ok: false, places: [], searchLat: opts.lat, searchLng: opts.lng, radiusM: radius, searchedType: type, searchedKeyword: keyword, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Haversine distance between two lat/lng points, in km. */
function haversineDistance(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
