/**
 * Day 22 v3 — Live listings diagnostic endpoint.
 *
 * GET /api/listings/diag?question=...&vertical=...
 *
 * Returns the full Tavily flow WITHOUT going through the full
 * /api/ask route. Purpose: show David exactly where it's
 * failing — Tavily search, Tavily extract, parsing, or matcher.
 *
 * Costs Tavily credits per call (same as production).
 */

import { NextRequest, NextResponse } from "next/server";
import { detectCity } from "@/lib/stub/detect";
import {
  buildListingsQuery,
  fetchLiveListings,
  rankListingsByMatch,
} from "@/lib/connectors/tavily-listings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const url = new URL(req.url);
  const question = url.searchParams.get("question") ?? "Where in Sandton should I open a gas station?";
  const vertical = url.searchParams.get("vertical") ?? "gas_station";

  const city = detectCity(question);
  const diag: {
    ok: boolean;
    question: string;
    vertical: string;
    detectedCity: { id: string; name: string } | null;
    hasTavilyKey: boolean;
    stages: Array<Record<string, unknown>>;
    elapsedMs?: number;
    error?: string;
    finalCount?: number;
  } = {
    ok: true,
    question,
    vertical,
    detectedCity: city ? { id: city.id, name: city.name } : null,
    hasTavilyKey: !!process.env.TAVILY_API_KEY,
    stages: [],
  };

  if (!city) {
    return NextResponse.json({
      ok: false,
      question: diag.question,
      vertical: diag.vertical,
      detectedCity: null,
      hasTavilyKey: diag.hasTavilyKey,
      stages: diag.stages,
      error: "Could not detect city from question",
      elapsedMs: Date.now() - t0,
    });
  }

  // Stage 1: build queries
  const queries = buildListingsQuery({
    city,
    suburb: null,
    vertical,
  });
  diag.stages = [
    {
      stage: "build_queries",
      ok: true,
      property24Query: queries.property24Query,
      privatePropertyQuery: queries.privatePropertyQuery,
    },
  ];

  // Stage 2: fetch live listings (this calls Tavily search + extract)
  try {
    const listings = await fetchLiveListings({
      city,
      suburb: null,
      vertical,
      creditBudget: 4,
      maxListings: 3,
    });
    diag.stages.push({
      stage: "fetch_live_listings",
      ok: true,
      rawCount: listings.length,
      sample: listings.slice(0, 3).map((l) => ({
        id: l.id,
        portal: l.portal,
        suburb: l.suburb,
        title: l.title?.slice(0, 80),
        price: l.price,
        erfSize: l.erfSize,
        url: l.url?.slice(0, 100),
      })),
    });
    diag.finalCount = listings.length;
  } catch (err) {
    diag.stages.push({
      stage: "fetch_live_listings",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    diag.finalCount = 0;
  }

  diag.elapsedMs = Date.now() - t0;
  return NextResponse.json(diag);
}
