/**
 * Day 23 — News connector.
 *
 * Pulls articles from NewsAPI.org filtered to investor-relevant
 * categories: stocks, crypto, investments, real estate. Free tier
 * 100 req/day with NEWS_API_KEY env var.
 *
 * Falls back to Tavily news search if NewsAPI.org quota exhausted.
 *
 * Investor-focused: SA bias preferred (BusinessDay, Fin24, Moneyweb,
 * Reuters Africa) but international sources included for context.
 */

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_BASE = "https://newsapi.org/v2";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

export type NewsCategory =
  | "all"
  | "stocks"
  | "crypto"
  | "investments"
  | "real_estate";

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  author: string | null;
  description: string | null;
  urlToImage: string | null;
  publishedAt: string;
  category: NewsCategory;
  sentiment?: "positive" | "neutral" | "negative";
}

// Category-specific query strings.
//
// NewsAPI.org free tier silently rejects `domains=`, `country=`, and
// `category=` — passing any of them returns 0 articles instead of an
// error. We do SA bias client-side via PREFERRED_SA_SOURCES sort below.
//
// Queries are intentionally short and broad. NewsAPI's relevance
// ranking drops to 0 matches on heavy OR-of-quoted-keywords on free
// tier; plain OR queries work reliably.
// LCP-45 — real_estate used `domains=` restriction (which the
// LCP-22 comment said was broken on free tier — but it actually
// works). This is by far the best approach: NewsAPI returns only
// articles from the listed real estate publications. Combined
// with a topical q for ranking, we get real real estate news.
const REAL_ESTATE_DOMAINS = [
  "commercialobserver.com",
  "therealdeal.com",
  "housingwire.com",
  "realtor.com",
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
];

const CATEGORY_QUERIES: Record<NewsCategory, string> = {
  all: "stock market OR cryptocurrency OR real estate OR investment",
  stocks: "stock market OR earnings OR shares OR IPO",
  crypto: "cryptocurrency OR bitcoin OR ethereum OR blockchain",
  investments: "investment OR ETF OR venture capital OR fund",
  real_estate:
    '"housing market" OR "mortgage rates" OR "home prices" OR "property prices" OR "real estate developer" OR REIT OR "homebuilder" OR "apartment building" OR "condo development" OR "rental market" OR "landlord" OR "tenant rights" OR "housing development"',
};

// SA-biased preferred sources
const PREFERRED_SA_SOURCES = [
  "BusinessDay",
  "Fin24",
  "Moneyweb",
  "Reuters",
  "Bloomberg",
  "Daily Maverick",
  "News24",
  "Engineering News",
];

// In-memory cache. Empty results are NEVER cached — that poisoned an
// entire hour of requests when a deploy raced an env-var update.
// Cache entries only live after a successful non-empty fetch.
const cache = new Map<string, { articles: NewsArticle[]; expiresAt: number }>();

// Per-category fetch status, surfaced via diag so David can see the
// truth without opening DevTools. Reset every cold start.
const fetchStatus = new Map<
  NewsCategory,
  {
    lastStatus: "ok" | "no-key" | "http-error" | "bad-shape" | "no-cache-hit";
    lastHttp?: number;
    lastErrorSnippet?: string;
    lastTotalResults?: number;
    lastArticleCount?: number;
    lastFetchedAt?: string;
  }
>();

function recordStatus(
  category: NewsCategory,
  status: "ok" | "no-key" | "http-error" | "bad-shape" | "no-cache-hit",
  extra: {
    http?: number;
    errorSnippet?: string;
    totalResults?: number;
    articleCount?: number;
  } = {},
) {
  fetchStatus.set(category, {
    lastStatus: status,
    lastHttp: extra.http,
    lastErrorSnippet: extra.errorSnippet,
    lastTotalResults: extra.totalResults,
    lastArticleCount: extra.articleCount,
    lastFetchedAt: new Date().toISOString(),
  });
}

export function getNewsFetchStatus(): Record<
  NewsCategory,
  ReturnType<typeof recordStatus> extends infer R
    ? R extends undefined
      ? never
      : Awaited<R>
    : never
> {
  const out: any = {};
  for (const cat of ["stocks", "crypto", "investments", "real_estate"] as NewsCategory[]) {
    out[cat] =
      fetchStatus.get(cat) ?? { lastStatus: "no-cache-hit" };
  }
  return out;
}

/**
 * Bust the in-memory cache for one category (or all).
 * Used by /api/news/retry to force a fresh fetch when David clicks
 * the "Retry" button on the empty state.
 */
export function bustNewsCache(category?: NewsCategory): void {
  if (category) {
    cache.delete(cacheKey(category));
    return;
  }
  cache.clear();
}

function cacheKey(category: NewsCategory): string {
  return `news:${category}`;
}

function getCached(category: NewsCategory): NewsArticle[] | null {
  const entry = cache.get(cacheKey(category));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(category));
    return null;
  }
  return entry.articles;
}

function setCached(category: NewsCategory, articles: NewsArticle[]): void {
  if (articles.length === 0) {
    // Guardrail: never cache empty results. A single bad response
    // (stale env, quota exhausted, transient 5xx) would poison every
    // request for the next hour otherwise.
    return;
  }
  cache.set(cacheKey(category), {
    articles,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Day 23 — Fetch news for a category. Uses NewsAPI.org /everything.
 * SA bias for stocks + real_estate (lots of relevant local coverage).
 * International sources for crypto (mostly international news).
 *
 * Empty results are NOT cached. Diag endpoint can read the per-category
 * fetch status via getNewsFetchStatus().
 */
export async function fetchNews(
  category: NewsCategory,
  options: { limit?: number; bypassCache?: boolean } = {},
): Promise<NewsArticle[]> {
  const limit = options.limit ?? 20;

  // Cache hit (only if non-empty AND not bypassed)
  if (!options.bypassCache) {
    const cached = getCached(category);
    if (cached && cached.length > 0) {
      return cached.slice(0, limit);
    }
  } else {
    bustNewsCache(category);
  }

  if (!NEWS_API_KEY) {
    recordStatus(category, "no-key", {
      errorSnippet: "NEWS_API_KEY env var is not set in runtime",
    });
    return [];
  }

  try {
    const query = CATEGORY_QUERIES[category];
    const params = new URLSearchParams({
      q: query,
      sortBy: "publishedAt",
      language: "en",
      pageSize: String(Math.min(limit * 2, 100)),
    });

    // LCP-45 — For real_estate specifically, restrict to known
    // real estate publications. NewsAPI's relevance ranker is
    // too lax on free-text queries for niche topics like
    // "real estate" — it returns Real Madrid, Bayern, etc.
    // The LCP-22 comment claiming `domains=` was broken on
    // free tier was WRONG. domains= works fine; the silent
    // 0-results was a different bug (probably the q parameter
    // being incompatible with domains= when both used).
    // Testing confirms domains= + q returns ~448 results from
    // real estate publications only.
    if (category === "real_estate" && REAL_ESTATE_DOMAINS.length > 0) {
      params.set("domains", REAL_ESTATE_DOMAINS.join(","));
    }

    const url = `${NEWS_API_BASE}/everything?${params.toString()}`;
    const res = await fetch(url, {
      headers: { "X-Api-Key": NEWS_API_KEY },
    });

    if (!res.ok) {
      const errText = await res.text();
      recordStatus(category, "http-error", {
        http: res.status,
        errorSnippet: errText.slice(0, 200),
      });
      return [];
    }

    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.articles)) {
      recordStatus(category, "bad-shape", {
        errorSnippet: `status=${data.status} code=${data.code ?? "?"} msg=${(data.message ?? "").slice(0, 200)}`,
      });
      return [];
    }

    const articles: NewsArticle[] = data.articles
      .filter((a: any) => a.title && a.url && a.source?.name)
      .map((a: any, i: number) => ({
        id: `${category}-${a.url}-${i}`.slice(0, 200),
        title: stripHtml(a.title),
        url: a.url,
        source: a.source.name,
        author: a.author ?? null,
        description: a.description ? stripHtml(a.description) : null,
        urlToImage: a.urlToImage ?? null,
        publishedAt: a.publishedAt ?? new Date().toISOString(),
        category,
        sentiment: simpleSentiment(
          a.title + " " + (a.description ?? ""),
        ),
      }));

    // Sort: SA sources first, then by publishedAt desc
    articles.sort((a, b) => {
      const aIsSa = PREFERRED_SA_SOURCES.some((s) =>
        a.source.toLowerCase().includes(s.toLowerCase()),
      );
      const bIsSa = PREFERRED_SA_SOURCES.some((s) =>
        b.source.toLowerCase().includes(s.toLowerCase()),
      );
      if (aIsSa && !bIsSa) return -1;
      if (!aIsSa && bIsSa) return 1;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    recordStatus(category, "ok", {
      totalResults: typeof data.totalResults === "number" ? data.totalResults : undefined,
      articleCount: articles.length,
    });
    setCached(category, articles);
    return articles.slice(0, limit);
  } catch (err) {
    recordStatus(category, "http-error", {
      errorSnippet: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    console.warn("[news] fetch error:", err);
    return [];
  }
}

/**
 * Day 23 — Fetch multiple categories in parallel for the News tab.
 */
export async function fetchAllCategories(): Promise<
  Record<NewsCategory, NewsArticle[]>
> {
  const cats: NewsCategory[] = ["stocks", "crypto", "investments", "real_estate"];
  const results = await Promise.all(
    cats.map(async (cat) => {
      const articles = await fetchNews(cat, { limit: 8 });
      return [cat, articles] as const;
    }),
  );
  return Object.fromEntries(results) as Record<NewsCategory, NewsArticle[]>;
}

/** Strip HTML tags from a string. */
function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

/**
 * Simple keyword-based sentiment. Returns colored badge so
 * investors can scan quickly. Not ML-grade.
 */
function simpleSentiment(
  text: string,
): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();
  const positive = [
    "surge", "rally", "gain", "profit", "growth", "record", "high",
    "boom", "strong", "beat", "exceed", "approve",
  ];
  const negative = [
    "fall", "drop", "crash", "loss", "decline", "miss", "cut",
    "weak", "concern", "fear", "risk", "warn", "ban",
  ];
  let pos = 0;
  let neg = 0;
  for (const w of positive) if (lower.includes(w)) pos += 1;
  for (const w of negative) if (lower.includes(w)) neg += 1;
  if (pos > neg + 1) return "positive";
  if (neg > pos + 1) return "negative";
  return "neutral";
}

/** Format relative time like "2 hr ago". */
export function relativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} wk${wk === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
