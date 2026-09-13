import type { Signal } from "./types";
import type { NearbySearchResult } from "./google-places";

/**
 * Replace the OSM competitor-count signal only when Places completed a
 * lookup. A successful ZERO_RESULTS response is authoritative too: it is a
 * measured zero, while a failed/unconfigured lookup must leave OSM evidence
 * available as the clearly labelled fallback.
 */
export function applyCompetitorAuthority(
  signals: Signal[],
  places: NearbySearchResult,
  vertical: string,
): Signal[] {
  if (!places.ok) return signals;

  const withoutCompetitorCount = signals.filter(
    (signal) => signal.type !== "competitor_count",
  );
  const count = places.places.length;
  const maxExpected = 20;
  const saturation = Math.min(1, count / maxExpected);
  return [
    ...withoutCompetitorCount,
    {
      id: `google_places:competitor_count:${places.searchLat}:${places.searchLng}`,
      source: "google_places",
      type: "competitor_count",
      lat: places.searchLat,
      lng: places.searchLng,
      label: `${count} ${vertical} competitors within ${places.radiusM}m (Google Places)`,
      value: count,
      weight: Math.max(0, 1 - saturation),
      fetchedAt: new Date().toISOString(),
      payload: {
        count,
        radiusM: places.radiusM,
        vertical,
        source: "google_places",
        searchedType: places.searchedType,
        searchedKeyword: places.searchedKeyword,
      },
    },
  ];
}
