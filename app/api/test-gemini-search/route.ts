import { NextRequest, NextResponse } from "next/server";
import { getModel, ALL_MODELS } from "@/lib/models/registry";
import { withTimeout } from "@/lib/util/timeout";
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
 *
 * Day 12 v31: added POST handler that tests the Tavily model
 * (which is now the first in the route cascade after David's
 * Gemini key started hitting 429s).
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

async function testModel(modelId: string, vertical: string, question: string) {
  const t0 = Date.now();
  const result: any = {
    timestamp: new Date().toISOString(),
    modelId,
    vertical,
    question,
    hasTavilyKey: !!process.env.TAVILY_API_KEY,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
  };
  let model;
  try {
    model = getModel(modelId);
  } catch (e) {
    return NextResponse.json({ ...result, error: `${modelId} not in registry` }, { status: 500 });
  }
  result.modelConfigured = model.isAvailable();
  if (!result.modelConfigured) {
    return NextResponse.json({ ...result, error: `${modelId} not configured` });
  }
  let response: any;
  try {
    response = await withTimeout(
      model.call({ vertical: vertical as Vertical, question }),
      modelId === "gemini-search" ? 60_000 : 45_000,
      `model:${modelId}`,
    );
  } catch (e) {
    return NextResponse.json({
      ...result,
      error: `Model call threw/timed out: ${e instanceof Error ? e.message : String(e)}`,
      latencyMs: Date.now() - t0,
    });
  }
  result.latencyMs = Date.now() - t0;
  result.ok = response?.ok === true;
  result.responseOkField = response?.ok;
  result.responseError = response?.error ?? null;
  result.sitesCount = Array.isArray(response?.ranked_sites) ? response.ranked_sites.length : 0;
  result.sites = response?.ranked_sites ?? null;
  result.answer = response?.answer ?? null;
  result.sources = response?.sources ?? null;
  if (typeof response?.raw === "string" && response.raw.length > 2000) {
    result.raw = response.raw.slice(0, 2000) + "...[truncated]";
  } else {
    result.raw = response?.raw ?? null;
  }
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const vertical = sp.get("vertical") ?? "civic_land";
  const question =
    sp.get("q") ??
    "where to build a school in cape town south africa for high-income families";
  if (!SUPPORTED_VERTICALS.has(vertical)) {
    return NextResponse.json(
      { error: `Unsupported vertical: ${vertical}` },
      { status: 400 },
    );
  }
  return testModel("gemini-search", vertical, question);
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const modelId = (body.model as string) ?? "tavily";
  const vertical = (body.vertical as string) ?? "civic_land";
  const question =
    (body.q as string) ??
    "where to build a school in cape town south africa for high-income families";
  if (!SUPPORTED_VERTICALS.has(vertical)) {
    return NextResponse.json(
      { error: `Unsupported vertical: ${vertical}` },
      { status: 400 },
    );
  }
  return testModel(modelId, vertical, question);
}
