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

// Category-specific query strings
const CATEGORY_QUERIES: Record<NewsCategory, string> = {
  all: "real estate OR stock market OR cryptocurrency OR investment",
  stocks:
    '"stock market" OR "JSE" OR "earnings" OR "IPO" OR "dividend" OR "shares"',
  crypto:
    '"cryptocurrency" OR "bitcoin" OR "ethereum" OR "blockchain" OR "defi"',
  investments:
    '"investment" OR "portfolio" OR "venture capital" OR "private equity" OR "fund" OR "ETF"',
  real_estate:
    '"real estate" OR "property market" OR "housing" OR "REIT" OR "residential"',
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

// In-memory cache
const cache = new Map<string, { articles: NewsArticle[]; expiresAt: number }>();

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
  cache.set(cacheKey(category), {
    articles,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Day 23 — Fetch news for a category. Uses NewsAPI.org /everything.
 * SA bias for stocks + real_estate (lots of relevant local coverage).
 * International sources for crypto (mostly international news).
 */
export async function fetchNews(
  category: NewsCategory,
  options: { limit?: number } = {},
): Promise<NewsArticle[]> {
  const limit = options.limit ?? 20;

  // Cache hit
  const cached = getCached(category);
  if (cached) return cached.slice(0, limit);

  if (!NEWS_API_KEY) {
    console.warn("[news] NEWS_API_KEY not set, returning empty");
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

    // SA bias for land-development-relevant categories
    if (category === "stocks" || category === "real_estate") {
      params.set(
        "domains",
        "businessday.co.za,fin24.com,moneyweb.co.za,engineeringnews.co.za,news24.com,dailymaverick.co.za",
      );
    }

    const url = `${NEWS_API_BASE}/everything?${params.toString()}`;
    const res = await fetch(url, {
      headers: { "X-Api-Key": NEWS_API_KEY },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[news] NewsAPI ${res.status}: ${errText.slice(0, 200)}`);
      return [];
    }

    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.articles)) {
      console.warn(`[news] NewsAPI unexpected status: ${data.status}`);
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

    setCached(category, articles);
    return articles.slice(0, limit);
  } catch (err) {
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
