import { NextResponse } from "next/server";
import { ALL_MODELS, MODEL_INFO } from "@/lib/models/registry";

/**
 * Day 5 hotfix v3 — /api/model-health diagnostic endpoint.
 *
 * Returns a quick read of:
 *   - which models are registered
 *   - which have their env var set (isAvailable() === true)
 *   - which provider each maps to
 *
 * Does NOT make real AI calls — that would be slow + expensive on every
 * page load. Just reports configuration state so Chris can see at a
 * glance whether GEMINI_API_KEY / OPENROUTER_API_KEY are present in
 * Vercel env vars.
 *
 * 200 OK with a JSON body. No auth required (read-only diagnostic).
 */
export async function GET() {
  const models = ALL_MODELS.map((m) => ({
    id: m.info.id,
    displayName: m.info.displayName,
    provider: m.info.provider,
    free: m.info.free,
    configured: m.isAvailable(),
  }));

  const summary = {
    totalModels: models.length,
    configuredModels: models.filter((m) => m.configured).length,
    availableProviders: Array.from(
      new Set(
        models.filter((m) => m.configured).map((m) => m.provider),
      ),
    ),
    missingProviders: Array.from(
      new Set(
        models.filter((m) => !m.configured && m.provider !== "stub").map(
          (m) => m.provider,
        ),
      ),
    ),
  };

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    summary,
    models,
    note: "This endpoint does not make real AI calls. It only checks env var presence. To actually test a model, use the dropdown on the home page.",
  });
}
