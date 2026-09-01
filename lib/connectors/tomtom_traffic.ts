/**
 * MVP rebuild Sep 2026 — TomTom Traffic Incidents connector.
 *
 * Live traffic incidents (accidents, jams, roadworks, closures) within
 * 5km of a candidate site. Frees up 20,000 calls/month from the TomTom
 * free tier (separate budget from Places Search).
 *
 * Why this complements i-Traffic:
 *   - i-Traffic shows SANRAL-monitored cameras and alerts on national
 *     roads — good for high-traffic highway retail.
 *   - TomTom Incidents covers the broader road network including
 *     municipal arterials and reports from real drivers. A site near
 *     an active jam or accident is materially different from one with
 *     free flow.
 *
 * API: TomTom Incident Details v5.
 *   GET https://api.tomtom.com/traffic/services/5/incidentDetails
 *       ?key=KEY
 *       &bbox=minLon,minLat,maxLon,maxLat
 *       &fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},roadNumbers,delay}}}
 *       &language=en-GB
 *       &timeValidityFilter=present
 *
 * Max bbox area: 10,000 km². A 5km radius (~78 km²) is well inside.
 *
 * Graceful degrade: missing key, quota exceeded, or HTTP error → empty
 * signals. The i-Traffic connector stays as primary; this layers on
 * incident density from the broader TomTom network.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { withTimeout } from "@/lib/util/timeout";

const BASE_URL = "https://api.tomtom.com/traffic/services/5/incidentDetails";
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const RADIUS_KM = 5;

interface IncidentProperties {
  id?: string;
  iconCategory?: number;
  magnitudeOfDelay?: number;
  delay?: number;
  roadNumbers?: string[];
  events?: Array<{ description?: string; code?: number }>;
}

interface IncidentFeature {
  type?: string;
  geometry?: {
    type?: "Point" | "LineString";
    coordinates?: number[] | number[][];
  };
  properties?: IncidentProperties;
}

interface IncidentResponse {
  incidents?: IncidentFeature[];
}

/** TomTom iconCategory → human label. */
const ICON_CATEGORY_LABEL: Record<number, string> = {
  0: "Unknown",
  1: "Accident",
  2: "Fog",
  3: "Dangerous conditions",
  4: "Rain",
  5: "Ice",
  6: "Jam",
  7: "Lane closed",
  8: "Road closed",
  9: "Road works",
  10: "Wind",
  11: "Flooding",
  14: "Broken-down vehicle",
};

/** Magnitude → label and weight multiplier. */
function magnitudeLabel(m: number | undefined): string {
  switch (m) {
    case 1: return "minor";
    case 2: return "moderate";
    case 3: return "major";
    case 4: return "closure";
    default: return "unknown";
  }
}

/** Haversine in km. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** In-memory cache keyed by 1km grid + resource. */
const cache = new Map<string, { fetchedAt: number; incidents: IncidentFeature[] }>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)}:${lng.toFixed(3)}`;
}

/** Build a bbox covering RADIUS_KM around a point. */
function bbox(lat: number, lng: number, radiusKm: number): string {
  // ~1° lat ≈ 111km. 1° lng varies with latitude but at SA latitudes
  // (~26°S) it's about 100km. Round up generously.
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return [
    (lng - dLng).toFixed(6),
    (lat - dLat).toFixed(6),
    (lng + dLng).toFixed(6),
    (lat + dLat).toFixed(6),
  ].join(",");
}

/** Get the centroid of an incident geometry (Point or LineString). */
function centroidOfIncident(inc: IncidentFeature): { lat: number; lng: number } | null {
  const geom = inc.geometry;
  if (!geom) return null;
  if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
    const c = geom.coordinates as number[];
    return { lng: c[0], lat: c[1] };
  }
  if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
    const coords = geom.coordinates as number[][];
    if (coords.length === 0) return null;
    const sum = coords.reduce(
      (acc, c) => ({ lng: acc.lng + c[0], lat: acc.lat + c[1] }),
      { lng: 0, lat: 0 },
    );
    return { lng: sum.lng / coords.length, lat: sum.lat / coords.length };
  }
  return null;
}

export const tomtomIncidentsConnector: Connector = {
  id: "tomtom_traffic",
  name: "Live traffic incidents (TomTom)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const apiKey = process.env.TOMTOM_API_KEY;
    if (!apiKey) return [];

    const fetchedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const key = cacheKey(lat, lng);
      let incidents: IncidentFeature[];
      const cached = cache.get(key);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        incidents = cached.incidents;
      } else {
        const fields = encodeURIComponent(
          "{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},roadNumbers,delay}}}",
        );
        const url =
          `${BASE_URL}?key=${apiKey}` +
          `&bbox=${bbox(lat, lng, RADIUS_KM)}` +
          `&fields=${fields}` +
          `&language=en-GB` +
          `&timeValidityFilter=present`;

        const res = await withTimeout(
          fetch(url, { signal: controller.signal }),
          FETCH_TIMEOUT_MS,
          "tomtom_traffic",
        );
        if (!res.ok) {
          console.warn(`[tomtom_traffic] HTTP ${res.status}`);
          return [];
        }
        const data = (await res.json()) as IncidentResponse;
        incidents = Array.isArray(data.incidents) ? data.incidents : [];
        cache.set(key, { fetchedAt: Date.now(), incidents });
      }

      // Filter by precise radius (TomTom bbox can return edge cases)
      // and compute per-incident distance to site.
      const inRange = incidents
        .map((inc) => {
          const c = centroidOfIncident(inc);
          if (!c) return null;
          const dist = haversineKm(lat, lng, c.lat, c.lng);
          if (dist > RADIUS_KM) return null;
          return { inc, distKm: dist };
        })
        .filter((x): x is { inc: IncidentFeature; distKm: number } => x !== null);

      if (inRange.length === 0) return [];

      // Aggregate by category for the signal label.
      const byCategory: Record<number, number> = {};
      let totalDelaySeconds = 0;
      const topIncidents: string[] = [];
      for (const { inc, distKm } of inRange) {
        const cat = inc.properties?.iconCategory ?? 0;
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;
        if (inc.properties?.delay) totalDelaySeconds += inc.properties.delay;
        if (topIncidents.length < 3) {
          const label = ICON_CATEGORY_LABEL[cat] ?? "incident";
          const desc = inc.properties?.events?.[0]?.description;
          const road = inc.properties?.roadNumbers?.[0];
          topIncidents.push(
            `${label}${road ? ` on ${road}` : ""}${desc ? ` (${desc.slice(0, 60)})` : ""} · ${distKm.toFixed(1)}km`,
          );
        }
      }

      // Summary signal — incident count + worst type near site
      const worstCategory = Object.entries(byCategory).sort(
        (a, b) => b[1] - a[1],
      )[0];
      const worstLabel = worstCategory
        ? ICON_CATEGORY_LABEL[Number(worstCategory[0])] ?? "incident"
        : "incident";

      const signals: Signal[] = [];

      signals.push({
        id: `tomtom_traffic:${site.id}:incidents`,
        source: "tomtom_traffic",
        type: "traffic_incidents",
        lat,
        lng,
        label:
          `${inRange.length} traffic incidents within ${RADIUS_KM}km` +
          (worstLabel !== "Unknown" ? ` · worst: ${worstLabel}` : "") +
          (topIncidents.length > 0
            ? ` · top: ${topIncidents[0]}`
            : ""),
        value: inRange.length,
        weight: Math.min(1, inRange.length / 10),
        fetchedAt,
        payload: {
          radiusKm: RADIUS_KM,
          byCategory,
          totalDelaySeconds,
          top: topIncidents,
        },
      });

      // If there's any delay-causing incident, surface it separately
      // for the Decision Block.
      const jamsOrClosures =
        (byCategory[6] ?? 0) + (byCategory[8] ?? 0) + (byCategory[9] ?? 0);
      if (jamsOrClosures > 0) {
        signals.push({
          id: `tomtom_traffic:${site.id}:congestion`,
          source: "tomtom_traffic",
          type: "congestion_density",
          lat,
          lng,
          label: `${jamsOrClosures} jams/closures/roadworks within ${RADIUS_KM}km` +
            (totalDelaySeconds > 0
              ? ` · est. ${Math.round(totalDelaySeconds / 60)}min total delay`
              : ""),
          value: jamsOrClosures,
          weight: Math.min(1, jamsOrClosures / 5),
          fetchedAt,
        });
      }

      return signals;
    } catch (e) {
      console.warn(
        `[tomtom_traffic] fetch failed for ${lat},${lng}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return [];
    } finally {
      clearTimeout(timer);
    }
  },
};
