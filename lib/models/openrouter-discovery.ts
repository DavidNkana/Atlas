/**
 * OpenRouter free-model discovery
 *
 * OpenRouter's free tier rotates constantly. Hardcoded slugs go stale in days.
 * Instead of maintaining a chain of "currently free" model IDs, we ask OpenRouter
 * directly: GET /models, filter for pricing.prompt === "0" AND pricing.completion === "0".
 * Cached in-process for 1 hour so we don't hammer the API on every Atlas request.
 */

export interface OpenRouterFreeModel {
  id: string;          // upstream slug, e.g. "qwen/qwen-2.5-72b-instruct:free"
  displayName: string; // auto-derived, e.g. "Qwen 2.5 72B (free)"
  pricing: { prompt: string; completion: string };
}

interface OpenRouterModel {
  id: string;
  name?: string;
  pricing?: { prompt?: string; completion?: string };
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

let cache: { fetchedAt: number; models: OpenRouterFreeModel[] } | null = null;

/**
 * Derive a friendly display name from a model slug like "google/gemini-2.0-flash-exp:free".
 * Strategy:
 *   - strip ":free" suffix
 *   - strip vendor prefix before first "/"
 *   - replace dashes/dots/underscores with spaces
 *   - title-case-ish (preserve known casing where possible)
 *   - append " (free)"
 */
export function deriveDisplayName(id: string): string {
  const cleaned = id.replace(/:free$/, '').replace(/^[^/]+\//, '');
  // Split on common separators, drop empty, title-case each token.
  const tokens = cleaned
    .split(/[\s\-._]+/)
    .filter(Boolean)
    .map((t) => {
      // Preserve all-caps acronyms of length <= 5 (e.g. "llm", "ai")
      if (/^[a-z]+$/.test(t) && t.length <= 4) return t.toUpperCase();
      // Preserve known proper nouns
      if (/^(llama|gemma|qwen|mistral|gemini|claude|gpt|phi|deepseek)$/i.test(t)) {
        return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
      }
      // Otherwise title-case each word
      return t
        .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    });
  return tokens.join(' ') + ' (free)';
}

/**
 * Fetch the current list of free models from OpenRouter's /models endpoint.
 * Returns an empty array on any failure (network, auth, parse) — callers should
 * fall back to a curated stub in that case rather than crashing.
 */
export async function fetchOpenRouterFreeModels(
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<OpenRouterFreeModel[]> {
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }
  try {
    const res = await fetchImpl(OPENROUTER_MODELS_URL, {
      headers: { 'Accept': 'application/json' },
      // Server-side cache hint; OpenRouter responds with Cache-Control anyway.
      cache: 'no-store',
    });
    if (!res.ok) {
      // Don't cache failures; next call will retry.
      return [];
    }
    const body = await res.json();
    const data: OpenRouterModel[] = Array.isArray(body?.data) ? body.data : [];
    const free = data
      .filter((m) => {
        const p = m.pricing ?? {};
        return String(p.prompt ?? '') === '0' && String(p.completion ?? '') === '0';
      })
      .map((m) => ({
        id: m.id,
        displayName: deriveDisplayName(m.id),
        pricing: { prompt: '0', completion: '0' },
      }));
    cache = { fetchedAt: now, models: free };
    return free;
  } catch {
    return [];
  }
}

/** Test-only: clear the in-memory cache so the next call re-fetches. */
export function _resetOpenRouterCache(): void {
  cache = null;
}

/** Snapshot for the /api/models-debug endpoint. */
export function _getOpenRouterCacheMeta(): { fetchedAt: number | null; ageMs: number | null; size: number | null } {
  if (!cache) return { fetchedAt: null, ageMs: null, size: null };
  return { fetchedAt: cache.fetchedAt, ageMs: Date.now() - cache.fetchedAt, size: cache.models.length };
}