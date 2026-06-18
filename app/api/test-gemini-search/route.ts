import { NextRequest, NextResponse } from "next/server";
import { getModel, ALL_MODELS } from "@/lib/models/registry";
import type { ModelRequest, Vertical } from "@/lib/models/types";

/**
 * Day 12 v18 — /api/test-gemini-search diagnostic.
 *
 * ACTUALLY calls the Gemini Search model and returns the raw
 * response or error. This is the only way to know whether the
 * grounding tool is working, what the actual error is, and
 * whether the citations come back.
 *
 * Bypasses the full /api/ask pipeline (auth, fallback chain,
 * partial_timeout, persist) so the user can see the real
 * model call in isolation.
 *
 * Usage: GET /api/test-gemini-search?vertical=civic_land&q=...
 *   - vertical (required): one of the 10 SUPPORTED_VERTICALS
 *   - q (required): the question text
 *
 * Returns: { ok, model, latencyMs, rawResponse, rawError, ...
 *           groundingChunks, sitesCount, answer, sources }
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPPORTED_VERTICALS = new Set([
  "gas_station",
  "restaurant",
  "warehouse",
  "retail_shop",
  "residential_land",
  "commercial_land",
  "agricultural_land",
  "industrial_land",
  "mixed_use_land",
  "civic_land",
]);

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const sp = req.nextUrl.searchParams;
  const vertical = sp.get("vertical") ?? "civic_land";
  const question =
    sp.get("q") ??
    "where to build a school in cape town south africa for high-income families";

  const result: any = {
    timestamp: new Date().toISOString(),
    vertical,
    question,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    geminiKeyLength: process.env.GEMINI_API_KEY?.length ?? 0,
    geminiKeyPrefix: process.env.GEMINI_API_KEY?.slice(0, 8) ?? null,
  };

  if (!SUPPORTED_VERTICALS.has(vertical)) {
    return NextResponse.json(
      { ...result, error: `Unsupported vertical: ${vertical}` },
      { status: 400 },
    );
  }

  let model;
  try {
    model = getModel("gemini-search");
  } catch (e) {
    return NextResponse.json(
      { ...result, error: "gemini-search model not in registry" },
      { status: 500 },
    );
  }

  result.modelConfigured = model.isAvailable();

  if (!result.modelConfigured) {
    return NextResponse.json({
      ...result,
      error: "gemini-search not configured (GEMINI_API_KEY not set)",
    });
  }

  // Make the actual call.
  const req_payload: ModelRequest = {
    vertical: vertical as Vertical,
    question,
  };
  let response: any;
  try {
    response = await model.call(req_payload);
  } catch (e) {
    return NextResponse.json({
      ...result,
      error: `Model call threw: ${e instanceof Error ? e.message : String(e)}`,
      errorStack: e instanceof Error ? e.stack : "",
      latencyMs: Date.now() - t0,
    });
  }

  result.latencyMs = Date.now() - t0;
  result.ok = response?.ok === true;
  result.responseType = typeof response;
  result.responseKeys = response ? Object.keys(response) : null;
  result.responseOkField = response?.ok;
  result.responseError = response?.error ?? null;
  result.sitesCount = Array.isArray(response?.ranked_sites)
    ? response.ranked_sites.length
    : 0;
  result.sites = response?.ranked_sites ?? null;
  result.answer = response?.answer ?? null;
  result.sources = response?.sources ?? null;
  result.raw = response?.raw ?? null;
  // For success: include a truncated raw so the user can see what
  // Gemini actually said (capped at 2KB to keep the response small).
  if (typeof result.raw === "string" && result.raw.length > 2000) {
    result.raw = result.raw.slice(0, 2000) + "...[truncated]";
  }

  return NextResponse.json(result);
}
