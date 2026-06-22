/**
 * LCP-51 S1 — CryptoPanic connector.
 *
 * Pulls community-curated crypto news from CryptoPanic.com.
 * CryptoPanic aggregates ~50 crypto news sources and adds a community
 * voting layer (positive/negative/important/saved/lol/toxic) that
 * is genuinely useful as a sentiment proxy.
 *
 * Free tier: 200 calls/day, no auth required for public posts.
 * Auth token (CRYPTOPANIC_API_KEY) raises the limit and unlocks
 * /posts/?filter=public (paid tier has access to /posts/?filter=hot
 * with higher rate limits).
 *
 * MVP per LCP-50: free tier, top coins only (default 20), no auth.
 * Phase 2 (deferred): add auth token when we hit the 200/day limit.
 *
 * Cache: 5 minutes. News is slow-moving; we don't need fresh-on-second
 * cadence. Empty-result guard: never cache [] (lesson learned from
 * the news connector).
 */

const CRYPTOPANIC_API_KEY = process.env.CRYPTOPANIC_API_KEY;
const CRYPTOPANIC_BASE = "https://cryptopanic.com/api/v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type CryptoPanicFilter =
  | "rising"
  | "hot"
  | "bullish"
  | "bearish"
  | "important"
  | "saved"
  | "lol";

export interface CryptoPanicVotes {
  positive: number;
  negative: number;
  important: number;
  liked: number;
  disliked: number;
  lol: number;
  toxic: number;
  saved: number;
}

export interface CryptoPanicPost {
  id: number;
  title: string;
  url: string;
  source: string;
  domain: string;
  publishedAt: string; // ISO 8601
  currencies: { code: string; title: string; slug: string }[];
  votes: CryptoPanicVotes;
  kind: "news" | "media";
  sentiment: "bullish" | "bearish" | "neutral" | null;
}

export interface CryptoPanicFetchStatus {
  status: "ok" | "http-error" | "bad-shape" | "no-key" | "rate-limited" | "skipped-cache-hit";
  http?: number;
  errorSnippet?: string;
  lastFetchedAt?: string;
  postCount?: number;
  cacheAgeMs?: number;
}

const cache = new Map<
  string,
  { posts: CryptoPanicPost[]; expiresAt: number; lastFetchedAt: number }
>();

let lastFetchStatus: CryptoPanicFetchStatus = { status: "skipped-cache-hit" };

export function getCryptoPanicFetchStatus(): CryptoPanicFetchStatus {
  return lastFetchStatus;
}

export function bustCryptoPanicCache(): void {
  cache.clear();
}

function cacheKey(filter: string, coinsKey: string): string {
  return `cryptopanic:${filter}:${coinsKey}`;
}

function getCached(filter: string, coinsKey: string): {
  posts: CryptoPanicPost[];
  lastFetchedAt: number;
} | null {
  const entry = cache.get(cacheKey(filter, coinsKey));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(filter, coinsKey));
    return null;
  }
  return { posts: entry.posts, lastFetchedAt: entry.lastFetchedAt };
}

function setCached(
  filter: string,
  coinsKey: string,
  posts: CryptoPanicPost[],
): void {
  if (posts.length === 0) {
    // Guardrail: never cache empty results. Single bad response
    // (stale env, quota exhausted, transient 5xx) would poison
    // every subsequent read for the TTL.
    return;
  }
  cache.set(cacheKey(filter, coinsKey), {
    posts,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastFetchedAt: Date.now(),
  });
}

/**
 * Fetch top posts from CryptoPanic.
 *
 * Default coins list covers the LCP-46 /crypto top 50 by market cap.
 * We send the top 20 (the rest would dilute the result and we hit
 * the 200/day limit faster). Sacha extends this list in Phase 2.
 */
export async function fetchCryptoPanicPosts(
  options: {
    coins?: string[]; // currency codes: ["BTC", "ETH", "SOL", ...]
    filter?: CryptoPanicFilter;
    bypassCache?: boolean;
  } = {},
): Promise<CryptoPanicPost[]> {
  const DEFAULT_COINS = [
    "BTC",
    "ETH",
    "SOL",
    "ADA",
    "XRP",
    "DOGE",
    "MATIC",
    "DOT",
    "AVAX",
    "LINK",
    "LTC",
    "BCH",
    "NEAR",
    "ATOM",
    "UNI",
    "XLM",
    "ALGO",
    "FIL",
    "APT",
    "ARB",
  ];
  const coins = options.coins ?? DEFAULT_COINS;
  const filter = options.filter ?? "hot";
  const coinsKey = coins.join(",");

  if (!options.bypassCache) {
    const cached = getCached(filter, coinsKey);
    if (cached) {
      lastFetchStatus = {
        status: "skipped-cache-hit",
        postCount: cached.posts.length,
        cacheAgeMs: Date.now() - cached.lastFetchedAt,
        lastFetchedAt: new Date(cached.lastFetchedAt).toISOString(),
      };
      return cached.posts;
    }
  }

  const params = new URLSearchParams();
  if (CRYPTOPANIC_API_KEY) params.set("auth_token", CRYPTOPANIC_API_KEY);
  params.set("currencies", coins.join(","));
  params.set("filter", filter);
  params.set("public", "true");

  const url = `${CRYPTOPANIC_BASE}/posts/?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Atlas-Strategy/1.0 (+https://atlas-q2eh.vercel.app)",
      },
      cache: "no-store",
    });

    if (res.status === 429) {
      lastFetchStatus = {
        status: "rate-limited",
        http: 429,
        lastFetchedAt: new Date().toISOString(),
      };
      return [];
    }

    if (!res.ok) {
      const errText = await res.text();
      lastFetchStatus = {
        status: "http-error",
        http: res.status,
        errorSnippet: errText.slice(0, 200),
        lastFetchedAt: new Date().toISOString(),
      };
      return [];
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.results)) {
      lastFetchStatus = {
        status: "bad-shape",
        errorSnippet: `expected results array, got ${typeof data?.results}`,
        lastFetchedAt: new Date().toISOString(),
      };
      return [];
    }

    const posts: CryptoPanicPost[] = data.results
      .filter((p: any) => p && p.id && p.title && p.url)
      .map((p: any) => ({
        id: p.id,
        title: String(p.title),
        url: String(p.url),
        source: String(p.source_domain ?? p.source?.domain ?? "unknown"),
        domain: String(p.domain ?? p.source?.domain ?? "unknown"),
        publishedAt: String(p.published_at ?? p.created_at ?? new Date().toISOString()),
        currencies: Array.isArray(p.currencies)
          ? p.currencies
              .filter((c: any) => c && c.code)
              .map((c: any) => ({
                code: String(c.code).toUpperCase(),
                title: String(c.title ?? c.code),
                slug: String(c.slug ?? c.code?.toLowerCase() ?? ""),
              }))
          : [],
        votes: {
          positive: Number(p.votes?.positive ?? 0),
          negative: Number(p.votes?.negative ?? 0),
          important: Number(p.votes?.important ?? 0),
          liked: Number(p.votes?.liked ?? 0),
          disliked: Number(p.votes?.disliked ?? 0),
          lol: Number(p.votes?.lol ?? 0),
          toxic: Number(p.votes?.toxic ?? 0),
          saved: Number(p.votes?.saved ?? 0),
        },
        kind: p.kind === "media" ? "media" : "news",
        sentiment: (() => {
          if (p.votes?.positive > p.votes?.negative * 2) return "bullish";
          if (p.votes?.negative > p.votes?.positive * 2) return "bearish";
          return "neutral";
        })(),
      }));

    setCached(filter, coinsKey, posts);
    lastFetchStatus = {
      status: "ok",
      postCount: posts.length,
      lastFetchedAt: new Date().toISOString(),
    };
    return posts;
  } catch (err) {
    lastFetchStatus = {
      status: "http-error",
      errorSnippet: err instanceof Error ? err.message : String(err),
      lastFetchedAt: new Date().toISOString(),
    };
    return [];
  }
}
