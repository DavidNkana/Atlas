"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * Day 4 commit 3 + Day 5 commit 4 + Day 10+ Path 4:
 *   - Render one marker per ranked site with a popup (indigo)
 *   - Auto-fit the map bounds to all markers
 *   - Show a sidebar list that flies the map to a clicked site
 *   - Per-site Signals + AI→signals score breakdown next to each site
 *   - Day 10+: ALSO render user-added plots as green markers with
 *     price + size + agent in the popup. Plots without lat/lng are
 *     shown in the sidebar but not on the map.
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

function formatMoney(value: number, currency: string): string {
  if (currency === "ZAR") {
    if (value >= 1_000_000) return `R ${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `R ${Math.round(value / 1_000)}K`;
    return `R ${value.toLocaleString()}`;
  }
  if (currency === "ZMW") {
    if (value >= 1_000_000) return `K ${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `K ${Math.round(value / 1_000)}K`;
    return `K ${value.toLocaleString()}`;
  }
  if (currency === "NGN") {
    if (value >= 1_000_000) return `₦ ${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `₦ ${Math.round(value / 1_000)}K`;
    return `₦ ${value.toLocaleString()}`;
  }
  if (currency === "KES") {
    if (value >= 1_000_000) return `KSh ${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `KSh ${Math.round(value / 1_000)}K`;
    return `KSh ${value.toLocaleString()}`;
  }
  // Generic fallback for USD/EUR/GBP
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${value.toLocaleString()}`;
}

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

export interface PlotMarker {
  id: string;
  suburb: string;
  city: string;
  sizeM2: number | null;
  priceAmount: number | null;
  currency: string;
  listingType: string;
  agentName: string | null;
  sourceUrl: string | null;
  lat: number | null;
  lng: number | null;
}

export default function ResultMapClient({
  rankedSites,
  plots = [],
  status,
  city,
  country,
  stubReason,
}: {
  rankedSites: RankedSite[];
  plots?: PlotMarker[];
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
      let plotsPlaced = 0;

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

      // Day 10+ Path 4: user-added listings. These show as GREEN
      // markers (vs. indigo for AI recommendations) so the
      // developer can visually distinguish "Atlas's recommendation"
      // from "actual plot I can buy". We also auto-fit bounds to
      // include plot markers.
      for (const plot of plots) {
        if (
          typeof plot.lat !== "number" ||
          typeof plot.lng !== "number" ||
          Number.isNaN(plot.lat) ||
          Number.isNaN(plot.lng)
        ) {
          continue;
        }
        const lngLat: [number, number] = [plot.lng, plot.lat];
        const priceStr = plot.priceAmount != null
          ? formatMoney(plot.priceAmount, plot.currency)
          : "Price on request";
        const sizeStr = plot.sizeM2 != null
          ? `${plot.sizeM2.toLocaleString()} m²`
          : "Size on request";
        const agentStr = plot.agentName
          ? escapeHtml(plot.agentName)
          : "Agent not listed";
        const linkStr = plot.sourceUrl
          ? `<a href="${escapeHtml(plot.sourceUrl)}" target="_blank" rel="noopener" style="color:#10b981;text-decoration:underline;display:inline-block;margin-top:4px;">View listing →</a>`
          : "";
        const popupHtml =
          `<h3 style=\"margin:0 0 4px;font-size:14px;font-weight:600;color:#10b981;\">${escapeHtml(
            plot.suburb
          )}</h3>` +
          `<p style=\"margin:0 0 4px;font-size:13px;font-weight:600;color:#fafafa;\">${priceStr} &middot; ${sizeStr}</p>` +
          `<p style=\"margin:0 0 4px;font-size:12px;color:#e4e4e7;\">${agentStr}</p>` +
          linkStr;
        const marker = new mapboxgl.Marker({ color: "#10b981" })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(popupHtml))
          .addTo(map);
        markersRef.current.push(marker);
        bounds.extend(lngLat);
        plotsPlaced += 1;
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
  }, [rankedSites, plots]);

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
      {/* The stub_demo banner is shown ONCE on the result page (top of
          the content area). Showing it again inside the map would
          duplicate the same message. The map just renders the sites. */}
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
        data-plots={plots.length}
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
        {/* Analysis summary — quick stats about the question/answer */}
        <div>
          <h3 className="mb-2 text-xs font-medium text-zinc-100">Analysis</h3>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md border border-zinc-800 bg-zinc-800 px-2.5 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Sites ranked
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">
                {rankedSites.length}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-800 px-2.5 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                On the map
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">
                {rankedSites.length - missingCoords}
                <span className="ml-1 text-[10px] font-normal text-zinc-500">
                  / {rankedSites.length}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-800 px-2.5 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Signals used
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">
                {rankedSites.reduce(
                  (acc, s) => acc + (s.signals?.length ?? 0),
                  0
                )}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-800 px-2.5 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Avg confidence
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">
                {rankedSites.length > 0
                  ? (
                      rankedSites.reduce((acc, s) => acc + s.confidence, 0) /
                      rankedSites.length
                    ).toFixed(2)
                  : "—"}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">
            Click any site to fly the map to it. Click a marker to see the
            AI&apos;s rationale. The map auto-fits to include every
            marker.
          </p>
        </div>
      </div>
    </div>
  );
}
