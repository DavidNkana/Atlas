/**
 * OpenRouter free-model discovery — SIMPLIFIED.
 *
 * OpenRouter's free tier rotates. Instead of hardcoding slugs, we ask OpenRouter
 * directly: GET /models, filter for free pricing. Returns just the IDs (string[]).
 *
 * No caching for now — Vercel serverless demo, and stale slugs would be worse
 * than a missed cache. We can add caching later once Atlas has real traffic.
 *
 * On any failure (network, auth, parse) returns [] — callers fall back to a
 * curated slug list rather than crashing.
 */

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

interface OpenRouterModel {
  id: string;
  pricing?: { prompt?: string; completion?: string };
}

/**
 * Fetch currently-free model IDs from OpenRouter. Returns [] on failure.
 */
export async function fetchOpenRouterFreeModelIds(): Promise<string[]> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const body = await res.json();
    const data: OpenRouterModel[] = Array.isArray(body?.data) ? body.data : [];
    return data
      .filter((m) => {
        const p = m.pricing ?? {};
        return String(p.prompt ?? '') === '0' && String(p.completion ?? '') === '0';
      })
      .map((m) => m.id);
  } catch {
    return [];
  }
}
