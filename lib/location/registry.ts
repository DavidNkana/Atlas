import { CITIES, type City } from "@/lib/stub/cities";
import { geocodeSouthAfricanPlace, parseGeocoderCoordinates } from "@/lib/location/geocoder";

export type LocationAnchor = {
  rawName: string;
  label: string;
  parent: string;
  parentCityId: string;
  lat: number;
  lng: number;
  source: "registry" | "approximate_registry" | "nominatim";
  confidence: number;
  approximate: boolean;
  explicit: boolean;
  radiusKm: number;
};

export type LocationResolution =
  | { status: "resolved"; anchor: LocationAnchor }
  | { status: "none" }
  | { status: "needs_clarification"; rawName: string; reason: string };

export const LAUDIUM_LOCATION = {
  rawName: "Laudium",
  label: "Laudium",
  parent: "Pretoria / Tshwane",
  parentCityId: "pretoria",
  lat: -25.7780,
  lng: 28.1120,
  aliases: ["laudium", "laudium pretoria", "laudium tshwane"],
};

function explicitPlaceName(question: string): string | undefined {
  const radiusMatch = question.match(/\bwithin\s+\d+(?:\.\d+)?\s*(?:km|kilometers?)\s+of\s+([^,.!?;:]+)/i);
  if (radiusMatch?.[1]) {
    return radiusMatch[1].trim().replace(/\s+(?:for|to|with|and)\s+.*$/i, "").trim();
  }
  const match = question.match(/\b(?:in|near|around|by|at|within)\s+([^,.!?;:]+)/i);
  return match?.[1].trim().replace(/\s+(?:for|to|with|and)\s+.*$/i, "").trim();
}

function aliasMatch(question: string): { name: string; city?: City } | undefined {
  const q = question.toLowerCase();
  const aliases = [
    ...CITIES.flatMap((city) => city.aliases.map((alias) => ({ name: alias, city }))),
    ...LAUDIUM_LOCATION.aliases.map((alias) => ({ name: alias, city: undefined })),
  ].sort((a, b) => b.name.length - a.name.length);
  return aliases.find(({ name }) => new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "i").test(q));
}

function radiusKm(question: string, suburb: boolean): number {
  const match = question.match(/\bwithin\s+(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/i);
  return match ? Number(match[1]) : suburb ? 15 : 30;
}

/** Resolve a prompt location without ever using the default city as a guess. */
export function resolveLocationAnchor(question: string): LocationResolution {
  const q = (question ?? "").trim();
  const match = aliasMatch(q);
  if (match?.name && LAUDIUM_LOCATION.aliases.includes(match.name.toLowerCase())) {
    return {
      status: "resolved",
      anchor: {
        ...LAUDIUM_LOCATION,
        source: "approximate_registry",
        confidence: 0.76,
        approximate: true,
        explicit: true,
        radiusKm: radiusKm(q, true),
      },
    };
  }
  if (match?.city) {
    return {
      status: "resolved",
      anchor: {
        rawName: match.name,
        label: match.city.name,
        parent: match.city.name,
        parentCityId: match.city.id,
        lat: match.city.lat,
        lng: match.city.lng,
        source: "registry",
        confidence: 0.95,
        approximate: false,
        explicit: true,
        radiusKm: radiusKm(q, false),
      },
    };
  }
  const rawName = explicitPlaceName(q);
  if (rawName) {
    return { status: "needs_clarification", rawName, reason: `Atlas could not resolve “${rawName}” to a known location.` };
  }
  return { status: "none" };
}

function parentName(address: Record<string, string | undefined>, label: string): string {
  return address.municipality ?? address.city ?? address.town ?? address.county ?? address.state_district ?? label;
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Resolve curated aliases first, then a bounded server-side South Africa lookup. */
export async function resolveLocationAnchorAsync(question: string): Promise<LocationResolution> {
  const fast = resolveLocationAnchor(question);
  if (fast.status !== "needs_clarification") return fast;
  const result = await geocodeSouthAfricanPlace(fast.rawName);
  const coordinates = result ? parseGeocoderCoordinates(result) : null;
  if (!result || !coordinates) return fast;
  const address = result.address ?? {};
  const label = address.suburb ?? address.city_district ?? address.city ?? address.town ?? fast.rawName;
  const parent = parentName(address, result.display_name?.split(",")[1]?.trim() ?? label);
  return {
    status: "resolved",
    anchor: {
      rawName: fast.rawName,
      label,
      parent,
      parentCityId: slug(parent),
      ...coordinates,
      source: "nominatim",
      confidence: address.suburb || address.city || address.town ? 0.9 : 0.78,
      approximate: true,
      explicit: true,
      radiusKm: radiusKm(question, true),
    },
  };
}

export function cityForAnchor(anchor: LocationAnchor): City {
  return CITIES.find((city) => city.id === anchor.parentCityId) ?? {
    id: anchor.parentCityId,
    name: anchor.parent,
    aliases: [anchor.parent.toLowerCase()],
    country: "South Africa",
    lat: anchor.lat,
    lng: anchor.lng,
    countryCode: "ZA",
    currency: "ZAR",
  };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function validCoordinates(site: { lat?: unknown; lng?: unknown }): site is { lat: number; lng: number } {
  return typeof site.lat === "number" && Number.isFinite(site.lat) && site.lat >= -90 && site.lat <= 90 &&
    typeof site.lng === "number" && Number.isFinite(site.lng) && site.lng >= -180 && site.lng <= 180;
}

export function filterCandidatesToAnchor<T extends { lat?: number; lng?: number }>(sites: T[], anchor: LocationAnchor): T[] {
  return sites.filter((site) => validCoordinates(site) && haversineKm(anchor, site) <= anchor.radiusKm);
}
