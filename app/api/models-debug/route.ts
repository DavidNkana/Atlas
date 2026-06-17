import { NextResponse } from "next/server";
import { fetchOpenRouterFreeModels, _getOpenRouterCacheMeta } from "@/lib/models/openrouter-discovery";
import { ALL_MODELS } from "@/lib/models/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/models-debug
 *
 * Diagnostic endpoint. Surfaces what Atlas actually sees right now so Chris
 * (or any operator) can verify which OpenRouter free models are available
 * without guessing or reading source.
 *
 * Returns:
 *   - openrouterFreeModels: string[]  — currently free model IDs from OpenRouter
 *   - geminiConfigured:    boolean    — GEMINI_API_KEY present?
 *   - openrouterConfigured:boolean    — OPENROUTER_API_KEY present?
 *   - atlasSelected:       Array<{id, displayName, provider, free}>
 *                                  — every model Atlas knows about, with config status
 *   - cache:               {fetchedAt, ageMs, size} — discovery cache state
 */
export async function GET() {
  const free = await fetchOpenRouterFreeModels();
  const cache = _getOpenRouterCacheMeta();

  const atlasSelected = ALL_MODELS.map((m) => ({
    id: m.info.id,
    displayName: m.info.displayName,
    provider: m.info.provider,
    free: m.info.free,
    available: m.isAvailable(),
  }));

  return NextResponse.json({
    openrouterFreeModels: free.map((f) => f.id),
    openrouterFreeModelsDetailed: free,
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    openrouterConfigured: !!process.env.OPENROUTER_API_KEY,
    atlasSelected,
    cache,
    timestamp: new Date().toISOString(),
  });
}