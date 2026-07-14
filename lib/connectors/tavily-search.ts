/**
 * Day 28 — Tavily web search connector.
 *
 * Distinct from lib/connectors/tavily-listings.ts (which fetches
 * structured per-listing data from Property24 + Private Property).
 * This connector calls Tavily's general /search endpoint for the
 * result-page chat panel — when the user asks "why this?" or
 * "what about in Gauteng for 2000 sqm", we need web facts and
 * current news, not property listings.
 *
 * Returns: { answer: string, sources: Array<{title, url}> }
 *
 * Tavily's /search endpoint is different from /extract:
 *   - /search returns a generated answer + list of source URLs
 *   - /extract returns raw page content for given URLs
 *
 * We use /search with includeAnswer=true to get the synthesized
 * answer, then surface the sources array for inline citation.
 */

const TAVILY_BASE = "https://api.tavily.com";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min for chat answers

// LCP-31 — read TAVILY_API_KEY fresh on every call. The previous
// module-level const captured process.env at first import, which
// could be empty if the function instance warmed up before Vercel
// injected the env (or if the build ran with no env and runtime
// was expected to provide it). Reading fresh makes the failure
// mode loud and recovers without a redeploy.

export interface TavilyWebSource {
  title: string;
  url: string;
  content?: string;
  score?: number;
}

export interface TavilyWebResult {
  answer: string;
  sources: TavilyWebSource[];
  query: string;
}

interface TavilyApiResponse {
  answer?: string;
  results?: Array<{
    title: string;
    url: string;
    content?: string;
    score?: number;
  }>;
  // Tavily also returns a "follow_up_questions" array sometimes
  // but we ignore it — Atlas decides the follow-up, not Tavily.
}

const cache = new Map<string, { result: TavilyWebResult; expiresAt: number }>();

function cacheKey(query: string): string {
  return `tavily-web:${query.toLowerCase().trim()}`;
}

export function bustTavilyWebCache(query?: string): void {
  if (query) {
    cache.delete(cacheKey(query));
  } else {
    cache.clear();
  }
}

export class TavilyQuotaError extends Error {
  readonly status: number;
  readonly hint: string;
  constructor(status: number, hint: string) {
    super(`Tavily quota exceeded (HTTP ${status}). ${hint}`);
    this.name = "TavilyQuotaError";
    this.status = status;
    this.hint = hint;
  }
}

export async function fetchTavilyWebAnswer(
  question: string,
  options: {
    /** Optional context to bias the search toward this topic. */
    context?: string;
    /** Max results to surface (1-10). */
    maxResults?: number;
    /** Bypass cache (for refreshes). */
    bypassCache?: boolean;
    /**
     * Hard domain restriction passed to Tavily as `include_domains`.
     * Without this, Tavily treats `site:` in the query as a soft hint
     * and returns general web results — which broke the agents scrape
     * because the regex needs /estate-agents/agency/name/NUMERIC_ID
     * URLs that only Property24/PrivateProperty serve.
     */
    includeDomains?: string[];
  } = {},
): Promise<TavilyWebResult | null> {
  // LCP-31 — Read TAVILY_API_KEY fresh on every call. The previous
  // module-level const captured process.env at first import which
  // could be empty if the function instance warmed up before Vercel
  // injected the runtime env. Per-call read recovers without a
  // redeploy and makes the failure mode loud.
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";
  if (!TAVILY_API_KEY) {
    console.warn("[tavily-web] TAVILY_API_KEY not set in runtime env");
    return null;
  }

  const query = options.context
    ? `${question}\n\nContext: ${options.context}`
    : question;

  if (!options.bypassCache) {
    const cached = cache.get(cacheKey(query));
    if (cached && cached.expiresAt > Date.now()) return cached.result;
  }

  try {
    const res = await fetch(`${TAVILY_BASE}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        include_answer: "advanced",
        include_raw_content: false,
        max_results: Math.min(options.maxResults ?? 5, 10),
        // Bias toward recent facts for finance/real estate queries
        topic: "general",
        include_domains: options.includeDomains ?? [],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      // LCP-90 quota guard: Tavily returns HTTP 432 on free-tier rate
      // limits / monthly credit exhaustion. Surface this as a typed
      // exception so the route can bail with a clear error instead
      // of silently treating it as "no results found".
      if (res.status === 432 || res.status === 429) {
        const body = await res.text().catch(() => "");
        console.warn(`[tavily-web] HTTP ${res.status} quota/rate-limit: ${body.slice(0, 200)}`);
        throw new TavilyQuotaError(
          res.status,
          "Free-tier quota or rate limit hit. Either wait, reduce scrape scope, or upgrade Tavily plan.",
        );
      }
      console.warn(`[tavily-web] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as TavilyApiResponse;

    const result: TavilyWebResult = {
      answer: data.answer ?? "",
      sources: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
      query: question,
    };

    if (result.sources.length === 0 && !result.answer) {
      return null; // Truly empty result — don't cache.
    }

    cache.set(cacheKey(query), {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  } catch (err) {
    console.warn("[tavily-web] fetch error:", err);
    return null;
  }
}

/**
 * Day 28+ — Tavily /extract endpoint.
 *
 * Different from fetchTavilyWebAnswer:
 *   - /search returns a generated answer + source URLs
 *   - /extract returns raw page content for given URLs
 *
 * We use /extract when we need the full HTML of a known page
 * (e.g. an agent directory) so we can pass it to an LLM for
 * structured extraction.
 */

export interface TavilyExtractResult {
  results: Array<{ url: string; rawContent: string }>;
  failedResults: Array<{ url: string; error: string }>;
}

export async function extractTavilyUrls(
  urls: string[],
  options: { tavilyApiKey?: string; extractDepth?: "basic" | "advanced" } = {},
): Promise<TavilyExtractResult | null> {
  if (urls.length === 0) return { results: [], failedResults: [] };
  const key = options.tavilyApiKey ?? process.env.TAVILY_API_KEY ?? "";
  if (!key) return null;
  try {
    const res = await fetch(`${TAVILY_BASE}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        urls,
        extract_depth: options.extractDepth ?? "basic",
      }),
    });
    // LCP-90 quota guard: surface 429/432 as typed exception so caller
    // can bail instead of silently returning null.
    if (res.status === 432 || res.status === 429) {
      const body = await res.text().catch(() => "");
      console.warn(`[tavily-extract] HTTP ${res.status} quota/rate-limit: ${body.slice(0, 200)}`);
      throw new TavilyQuotaError(
        res.status,
        "Free-tier quota or rate limit hit during page extract. Either wait or reduce scrape scope.",
      );
    }
    if (!res.ok) return null;
    const data: any = await res.json();
    return {
      results: (data.results ?? []).map((r: any) => ({ url: r.url, rawContent: r.raw_content ?? "" })),
      failedResults: (data.failed_results ?? []).map((r: any) => ({ url: r.url, error: r.error ?? "unknown" })),
    };
  } catch (err) {
    if (err instanceof TavilyQuotaError) throw err;
    return null;
  }
}
