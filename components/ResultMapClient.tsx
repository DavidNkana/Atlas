"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * Day 4 commit 3 + Day 5 commit 4: render one marker per ranked site with a
 * popup, auto-fit the map bounds to all markers, show a sidebar list that
 * flies the map to a clicked site, AND show the per-site Signals + AI→signals
 * score breakdown next to each site so the user sees the score is now
 * evidence-based.
 */

type Signal = {
  id: string;
  source: string;
  type: string;
  lat?: number;
  lng?: number;
  label: string;
  value: number;
  weight: number;
  fetchedAt: string;
};

type ScoreFactor = {
  name: string;
  weight: number;
  contribution: number;
  evidence: string;
};

type ScoreBreakdown = {
  siteId: string;
  baseScore: number;
  signalScore: number;
  confidence: number;
  factors: ScoreFactor[];
};

type RankedSite = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;
  lng?: number;
  signals?: Signal[];
  scoreBreakdown?: ScoreBreakdown;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.6) return "text-amber-400";
  return "text-zinc-400";
}

function statusColor(status: string): string {
  if (status === "ok") return "bg-emerald-500/10 text-emerald-400 border-emerald-900";
  if (status === "timeout") return "bg-amber-500/10 text-amber-400 border-amber-900";
  return "bg-rose-500/10 text-rose-400 border-rose-900";
}

export default function ResultMapClient({
  rankedSites,
  status,
  city,
  country,
  stubReason,
}: {
  rankedSites: RankedSite[];
  status?: string;
  city?: string;
  country?: string;
  stubReason?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [missingCoords, setMissingCoords] = useState<number>(0);
  const [tokenMissing, setTokenMissing] = useState<boolean>(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.warn(
        "[ResultMapClient] NEXT_PUBLIC_MAPBOX_TOKEN is not set; map will not initialize."
      );
      setTokenMissing(true);
      return;
    }
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [28.3, -15.4],
      zoom: 11,
    });
    mapRef.current = map;

    map.on("load", () => {
      // Clear any prior markers (HMR / re-render safety).
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const bounds = new mapboxgl.LngLatBounds();
      let placed = 0;
      let skipped = 0;

      for (const site of rankedSites) {
        if (
          typeof site.lat !== "number" ||
          typeof site.lng !== "number" ||
          Number.isNaN(site.lat) ||
          Number.isNaN(site.lng)
        ) {
          skipped += 1;
          continue;
        }
        const lngLat: [number, number] = [site.lng, site.lat];
        const popupHtml =
          `<h3 style=\"margin:0 0 4px;font-size:14px;font-weight:600;color:#fafafa;\">${escapeHtml(
            site.name
          )}</h3>` +
          `<p style=\"margin:0 0 4px;font-size:12px;line-height:1.4;color:#e4e4e7;\">${escapeHtml(
            site.rationale
          )}</p>` +
          `<small style=\"font-size:11px;opacity:0.8;color:#a1a1aa;\">Score ${site.score.toFixed(
            2
          )} &middot; Confidence ${site.confidence.toFixed(2)}</small>`;
        const marker = new mapboxgl.Marker({ color: "#6366f1" })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(popupHtml))
          .addTo(map);
        markersRef.current.push(marker);
        bounds.extend(lngLat);
        placed += 1;
      }

      setMissingCoords(skipped);

      if (placed > 0 && !bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 80,
          maxZoom: 14,
          duration: 1500,
        });
      }
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [rankedSites]);

  function flyToSite(site: RankedSite) {
    const map = mapRef.current;
    if (
      !map ||
      typeof site.lat !== "number" ||
      typeof site.lng !== "number"
    ) {
      return;
    }
    map.flyTo({
      center: [site.lng, site.lat],
      zoom: 14,
      duration: 1200,
    });
    const marker = markersRef.current[site.rank - 1];
    if (marker) {
      const popup = marker.getPopup();
      if (popup && !popup.isOpen()) {
        marker.togglePopup();
      }
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-zinc-100">
      {status === "stub_demo" && (
        <div
          role="alert"
          data-testid="atlas-stub-demo-banner"
          className="mb-3 rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-200"
        >
          <strong className="font-semibold text-amber-100">
            Demo placeholder
            {city ? ` — ${city}${country ? `, ${country}` : ""}` : ""}:
          </strong>{" "}
          <span className="text-amber-200">
            {stubReason ??
              "AI models are currently overloaded. This is a city-specific demo placeholder. Try a real model in a few minutes."}
          </span>
        </div>
      )}
      {tokenMissing && (
        <div
          role="alert"
          data-testid="atlas-map-token-missing"
          className="mb-3 rounded-md border border-amber-900 bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
        >
          <strong className="font-semibold text-amber-300">Mapbox token missing.</strong>{" "}
          Add <code className="rounded bg-amber-500/20 px-1 py-0.5 text-[11px] text-amber-300">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
          in Vercel → Project → Settings → Environment Variables, then redeploy.
          The map and sidebar fly-to need this token to work; the ranked_sites
          JSON above is still valid.
        </div>
      )}
      <div
        ref={containerRef}
        className="h-[480px] w-full rounded-md"
        data-testid="atlas-result-map"
        data-sites={rankedSites.length}
      />
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium text-zinc-100">
            Ranked sites
          </h3>
          <ol className="space-y-1 text-sm">
            {rankedSites.map((site) => {
              const hasCoords =
                typeof site.lat === "number" && typeof site.lng === "number";
              const breakdown = site.scoreBreakdown;
              const signalDelta =
                breakdown ? breakdown.signalScore : 0;
              const baseScore = breakdown ? breakdown.baseScore : site.score;
              const signalText =
                signalDelta > 0
                  ? `+${signalDelta.toFixed(2)}`
                  : signalDelta < 0
                    ? signalDelta.toFixed(2)
                    : "±0.00";
              return (
                <li key={site.rank}>
                  <button
                    type="button"
                    onClick={() => flyToSite(site)}
                    disabled={!hasCoords}
                    className="flex w-full items-start gap-2 rounded-md border border-zinc-800 bg-zinc-800 px-3 py-2 text-left text-xs text-zinc-100 transition-colors hover:bg-zinc-700 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-semibold text-white">
                      {site.rank}
                    </span>
                    <span className="flex-1">
                      <span className="block font-medium text-zinc-100">
                        {site.name}
                      </span>
                      <span className="block text-[11px] text-zinc-400">
                        <span
                          className={`font-medium ${scoreColor(site.score)}`}
                          data-testid="atlas-site-score"
                        >
                          score {site.score.toFixed(2)}
                        </span>{" "}
                        · AI {baseScore.toFixed(2)} → signals{" "}
                        <span className={signalDelta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {signalText}
                        </span>
                        {" "}· Confidence{" "}
                        <span className="text-zinc-300">
                          {site.confidence.toFixed(2)}
                        </span>
                        {hasCoords
                          ? ` · ${site.lat!.toFixed(4)}, ${site.lng!.toFixed(4)}`
                          : " · no coords"}
                      </span>
                      {site.signals && site.signals.length > 0 && (
                        <span
                          className="mt-1 flex flex-wrap gap-1"
                          data-testid="atlas-site-signals"
                        >
                          {site.signals.map((sig) => (
                            <span
                              key={sig.id}
                              className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300"
                            >
                              {sig.label}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {missingCoords > 0 && (
            <p className="mt-2 text-[11px] text-zinc-400">
              {missingCoords} site{missingCoords === 1 ? "" : "s"} missing lat/lng
              — markers not placed.
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium text-zinc-100">About</h3>
          <p className="text-xs text-zinc-300">
            Click any site in the list to fly the map to it. Click a marker to
            open its rationale popup. The map auto-fits to include every
            marker.
          </p>
        </div>
      </div>
    </div>
  );
}
