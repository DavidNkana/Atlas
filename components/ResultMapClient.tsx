"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * Day 4 commit 1: empty Mapbox map.
 *
 * Initializes a dark-v11 map centered on Lusaka, Zambia. Markers, popups,
 * fitBounds, and the sidebar list arrive in commit 3.
 */

type RankedSite = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;
  lng?: number;
};

export default function ResultMapClient({
  rankedSites,
}: {
  rankedSites: RankedSite[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.warn(
        "[ResultMapClient] NEXT_PUBLIC_MAPBOX_TOKEN is not set; map will not initialize."
      );
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
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="rounded-lg border border-atlas-border bg-atlas-surface p-3">
      <div
        ref={containerRef}
        className="h-[480px] w-full rounded-md"
        data-testid="atlas-result-map"
        data-sites={rankedSites.length}
      />
      <p className="mt-2 text-xs text-atlas-muted">
        {rankedSites.length} ranked site{rankedSites.length === 1 ? "" : "s"}{" "}
        loaded. Markers render in commit 3.
      </p>
    </div>
  );
}