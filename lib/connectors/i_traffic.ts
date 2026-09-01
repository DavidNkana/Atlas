/**
 * MVP rebuild Sep 2026 — i-Traffic SA connector.
 *
 * Free SA-local traffic API (https://www.i-traffic.co.za/developers).
 * Returns cameras, alerts, message signs and incidents with lat/lng
 * on the SA national road network. NOT raw AADT, but a credible
 * signal that this is a monitored, high-traffic road:
 *   - Many cameras within 5km = active monitoring corridor
 *   - Many active alerts = real-time incidents = high traffic flow
 *
 * Coverage: Gauteng, KZN, Western Cape, Eastern Cape (the four
 * provinces where the bulk of SA traffic lives).
 *
 * API key required: register at i-traffic.co.za, request a developer
 * key, set I_TRAFFIC_API_KEY in Vercel env.
 *
 * Rate limit: 10 calls / 60 seconds. We use a 5-minute in-memory cache
 * keyed by bbox-grid cell (1km) to stay well inside that.
 *
 * Graceful degrade: missing key, quota exceeded, or HTTP error →
 * empty signals. The sa_traffic connector (SANRAL AADT) stays as the
 * primary for highway segments; this one layers on metro roads and
 * recent incident density.
 */

import type { Connector, ConnectorContext, Signal } from "./types";
import { withTimeout } from "@/lib/util/timeout";

const BASE_URL = "https://www.i-traffic.co.za/api";
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const RADIUS_KM = 5;

/** In-memory cache. Keys are `${latBin}:${lngBin}:${resource}`. */
const cache = new Map<string, { fetchedAt: number; data: any[] }>();

function cacheKey(lat: number, lng: number, resource: string): string {
  return `${lat.toFixed(3)}:${lng.toFixed(3)}:${resource}`;
}

function isFresh(key: string): boolean {
  const e = cache.get(key);
  return !!e && Date.now() - e.fetchedAt < CACHE_TTL_MS;
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

interface ITrafficEvent {
  EventID?: string;
  Latitude?: number;
  Longitude?: number;
  EventType?: string;
  Roadway?: string;
  Direction?: string;
  Description?: string;
  StartDate?: string;
}

async function fetchResource(
  apiKey: string,
  resource: "GetCameras" | "GetAlerts" | "GetEvents",
  signal: AbortSignal,
): Promise<ITrafficEvent[]> {
  const url = `${BASE_URL}/${resource}?key=${encodeURIComponent(
    apiKey,
  )}&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`i-Traffic ${resource} HTTP ${res.status}`);
  const data = (await res.json()) as any;
  // The i-Traffic responses come back as arrays directly.
  return Array.isArray(data) ? (data as ITrafficEvent[]) : [];
}

function filterByRadius(
  events: ITrafficEvent[],
  lat: number,
  lng: number,
  radiusKm: number,
): ITrafficEvent[] {
  return events.filter((e) => {
    if (typeof e.Latitude !== "number" || typeof e.Longitude !== "number") {
      return false;
    }
    return haversineKm(lat, lng, e.Latitude, e.Longitude) <= radiusKm;
  });
}

export const iTrafficConnector: Connector = {
  id: "i_traffic",
  name: "i-Traffic SA (cameras + alerts)",
  vertical: "all",
  async fetch(ctx: ConnectorContext): Promise<Signal[]> {
    const { site } = ctx;
    const lat = site.lat;
    const lng = site.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    const apiKey = process.env.I_TRAFFIC_API_KEY;
    if (!apiKey) return [];

    const fetchedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      // We only need a coarse region: use a 50km bbox around the site
      // for the cached fetch, then filter precisely by haversine.
      // i-Traffic returns ALL cameras/alerts for SA — there's no
      // server-side geo filter. So one fetch covers the whole metro.
      const cacheK = cacheKey(lat, lng, "metro");
      let cameras: ITrafficEvent[];
      let alerts: ITrafficEvent[];

      if (isFresh(cacheK)) {
        const e = cache.get(cacheK)!;
        cameras = (e.data as any).cameras;
        alerts = (e.data as any).alerts;
      } else {
        const [cams, alts] = await withTimeout(
          Promise.all([
            fetchResource(apiKey, "GetCameras", controller.signal),
            fetchResource(apiKey, "GetAlerts", controller.signal),
          ]),
          FETCH_TIMEOUT_MS,
          "i_traffic",
        );
        cameras = cams;
        alerts = alts;
        cache.set(cacheK, {
          fetchedAt: Date.now(),
          data: { cameras, alerts } as any,
        });
      }

      const camsNearby = filterByRadius(cameras, lat, lng, RADIUS_KM);
      const alertsNearby = filterByRadius(alerts, lat, lng, RADIUS_KM);

      const signals: Signal[] = [];

      if (camsNearby.length > 0) {
        const topCamera = camsNearby[0];
        signals.push({
          id: `i_traffic:${site.id}:cameras`,
          source: "i_traffic",
          type: "traffic_cameras",
          lat,
          lng,
          label: `${camsNearby.length} traffic cameras within ${RADIUS_KM}km${
            topCamera?.Roadway
              ? ` · nearest: ${topCamera.Roadway}`
              : ""
          }`,
          value: camsNearby.length,
          weight: Math.min(1, camsNearby.length / 10),
          fetchedAt,
          payload: {
            nearestRoadway: topCamera?.Roadway ?? null,
            sampleRoads: [
              ...new Set(
                camsNearby
                  .map((c) => c.Roadway)
                  .filter((r): r is string => !!r),
              ),
            ].slice(0, 5),
          },
        });
      }

      if (alertsNearby.length > 0) {
        const topAlert = alertsNearby[0];
        signals.push({
          id: `i_traffic:${site.id}:alerts`,
          source: "i_traffic",
          type: "traffic_alerts",
          lat,
          lng,
          label: `${alertsNearby.length} active alerts within ${RADIUS_KM}km${
            topAlert?.Roadway
              ? ` · ${topAlert.Roadway}${topAlert.Direction ? " " + topAlert.Direction : ""}`
              : ""
          }`,
          value: alertsNearby.length,
          weight: Math.min(1, alertsNearby.length / 5),
          fetchedAt,
          payload: {
            topAlert: topAlert?.Description ?? null,
            roadway: topAlert?.Roadway ?? null,
          },
        });
      }

      return signals;
    } catch (e) {
      console.warn(
        `[i_traffic] fetch failed for ${lat},${lng}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return [];
    } finally {
      clearTimeout(timer);
    }
  },
};
