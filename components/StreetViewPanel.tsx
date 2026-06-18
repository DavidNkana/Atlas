"use client";

/**
 * Day 12 v9: StreetViewPanel — live Google Street View for a
 * ranked candidate site.
 *
 * Renders a 640x360 jpeg from the Google Street View Static API
 * for the given lat/lng, plus a click-through link to open the
 * full interactive Google Maps view in a new tab.
 *
 * Why Static API instead of the JS panorama viewer:
 *   - Single <img> tag — no JS library load, no extra 200KB.
 *   - Works inside our existing card expand pattern.
 *   - Free tier ($7 per 1000 requests) is enough for demo scale.
 *   - If David wants the interactive 360° viewer later, we can
 *     swap this component for a JS panorama widget without
 *     changing the call site.
 *
 * Graceful degrade:
 *   - If NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set, the panel
 *     shows a one-line "Street View not configured" message with
 *     a link to set the env var. No broken images, no console
 *     errors.
 *   - If Google returns no imagery (no Street View coverage at
 *     this lat/lng — common in rural or undeveloped areas), the
 *     <img> onError fires and we show a "no coverage" message
 *     with a fallback to open the site in Google Maps.
 *
 * The image URL is computed at render time from
 *   https://maps.googleapis.com/maps/api/streetview?size=640x360
 *     &location=lat,lng&heading=0&pitch=0&fov=90&key=...
 *
 * Heading: 0 = north-facing camera. For a site that has a main
 * road or frontage, you'd want heading= the road bearing, but
 * we don't have that signal cheaply. 0 is a fine default — the
 * user is checking whether the area looks like a reasonable
 * place to develop, not surveying precise frontage.
 *
 * Privacy / cost:
 *   - The key is a public client-side key (NEXT_PUBLIC_). It
 *     SHOULD be restricted by HTTP referrer in Google Cloud
 *     Console to atlas-q2eh.vercel.app + localhost.
 *   - Free tier = 28,000 requests/month. At 5 sites per result
 *     and ~100 results/day, that's 15,000/month — within the
 *     free tier.
 */

import { useState } from "react";

const STATIC_API = "https://maps.googleapis.com/maps/api/streetview";

export function StreetViewPanel({
  lat,
  lng,
  name,
  city,
}: {
  lat: number;
  lng: number;
  name: string;
  city?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // No key → show a setup hint. Don't render a broken <img>.
  if (!apiKey) {
    return (
      <div className="rounded-md border border-atlas-border bg-atlas-surface2/50 p-3 text-[11px] leading-relaxed text-atlas-muted">
        <strong className="text-atlas-text">Street View not configured.</strong>{" "}
        Set <code className="rounded bg-atlas-bg px-1 py-0.5 font-mono text-[10px] text-atlas-text">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        in your Vercel env vars to enable live street imagery.
      </div>
    );
  }

  // Key set but Google returned no imagery for this location.
  // Common in rural / underdeveloped areas without Street View
  // coverage. Give the user a fallback: open in Google Maps.
  if (imgError) {
    return (
      <div className="rounded-md border border-atlas-border bg-atlas-surface2/50 p-3 text-[11px] leading-relaxed text-atlas-muted">
        <strong className="text-atlas-text">No Street View coverage here.</strong>{" "}
        Google hasn&apos;t photographed this area.{" "}
        <a
          href={`https://www.google.com/maps/@${lat},${lng},18z`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-atlas-accent hover:underline"
        >
          Open in Google Maps ↗
        </a>
      </div>
    );
  }

  // location=lat,lng: Google snaps to the nearest available
  // panorama within ~50m, so a vacant lot gets the closest road
  // imagery. heading=0 (north), pitch=0 (level), fov=90 (typical).
  // source=outdoor: prefer outdoor panoramas (default behaviour,
  // but explicit is clearer).
  const imgSrc =
    `${STATIC_API}?size=640x360` +
    `&location=${lat},${lng}` +
    `&heading=0&pitch=0&fov=90` +
    `&source=outdoor` +
    `&key=${encodeURIComponent(apiKey)}`;

  const mapsHref = `https://www.google.com/maps/@${lat},${lng},18z`;
  const fullMapsHref = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}${name ? `&query_place_id=&query=${encodeURIComponent(name + (city ? `, ${city}` : ""))}` : ""}`;

  return (
    <div className="overflow-hidden rounded-md border border-atlas-border">
      <div className="relative">
        {/* The Street View image. We render a placeholder of the
            same size so the layout doesn't shift while the
            network request is in flight. */}
        <img
          src={imgSrc}
          alt={`Street View of ${name}${city ? `, ${city}` : ""}`}
          width={640}
          height={360}
          loading="lazy"
          onError={() => setImgError(true)}
          className="block h-auto w-full bg-atlas-surface2 object-cover"
        />
        <a
          href={fullMapsHref}
          target="_blank"
          rel="noreferrer"
          className="absolute right-2 top-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/85"
          title="Open the full interactive street view in Google Maps"
        >
          Open in Maps ↗
        </a>
      </div>
      <div className="flex items-center justify-between border-t border-atlas-border bg-atlas-bg/50 px-3 py-1.5 text-[10px] text-atlas-muted">
        <span>
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </span>
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="text-atlas-accent hover:underline"
        >
          View larger map
        </a>
      </div>
    </div>
  );
}
