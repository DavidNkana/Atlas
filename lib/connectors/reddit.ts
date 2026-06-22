/**
 * LCP-51 S3 — Reddit connector.
 *
 * Pulls top posts from crypto-related subreddits. Two modes:
 *   - Anonymous (no env vars): hit /r/{sub}/top.json directly with
 *     a descriptive User-Agent. Works but rate-limited to a few
 *     requests per minute per IP. Good enough for MVP dev/CI.
 *   - OAuth2 (REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET): client
 *     credentials grant, 100 req/min. Recommended for production.
 *
 * MVP per LCP-50: anonymous mode. Sacha upgrades to OAuth in
 * Phase 1b when the strategy page is live and we see the actual
 * request volume.
 *
 * Subreddit list defaults to the global crypto-reddit core plus
 * African country subs. The latter is a deliberate bias for
 * African-context posts (the rest of Atlas is Africa-first).
 *
 * Cache: 10 minutes. Reddit moves faster than news, slower than
 * the X timeline would.
 */

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const REDDIT_BASE = "https://www.reddit.com";
const OAUTH_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const DEFAULT_SUBREDDITS = [
  "cryptocurrency",
  "bitcoin",
  "ethtrader",
  "ethfinance",
  "solana",
  "cardano",
  "CryptoMarkets",
  "altcoin",
  "defi",
  "SouthAfrica",
  "nigeria",
  "kenya",
  "Africa",
];

export type RedditSort = "hot" | "top" | "new" | "rising";
export type RedditTime = "hour" | "day" | "week" | "month" | "year" | "all";

export interface RedditPost {
  id: string;
  subreddit: string; // e.g. "r/cryptocurrency"
  subredditName: string; // e.g. "cryptocurrency"
  title: string;
  selftext: string; // first 500 chars of body
  url: string; // permalink (https://reddit.com/r/...)
  score: number; // upvotes
  numComments: number;
  author: string;
  createdUtc: string; // ISO
  flair: string | null;
}

export interface RedditFetchStatus {
  status:
    | "ok"
    | "http-error"
    | "bad-shape"
    | "rate-limited"
    | "no-key"
    | "skipped-cache-hit"
    | "oauth-failed";
  http?: number;
  errorSnippet?: string;
  lastFetchedAt?: string;
  postCount?: number;
  cacheAgeMs?: number;
}

const cache = new Map<
  string,
  { posts: RedditPost[]; expiresAt: number; lastFetchedAt: number }
>();

let lastFetchStatus: RedditFetchStatus = { status: "skipped-cache-hit" };
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export function getRedditFetchStatus(): RedditFetchStatus {
  return lastFetchStatus;
}

export function bustRedditCache(): void {
  cache.clear();
}

function cacheKey(subKey: string): string {
  return `reddit:${subKey}`;
}

function getCached(subKey: string): {
  posts: RedditPost[];
  lastFetchedAt: number;
} | null {
  const entry = cache.get(cacheKey(subKey));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(subKey));
    return null;
  }
  return { posts: entry.posts, lastFetchedAt: entry.lastFetchedAt };
}

function setCached(subKey: string, posts: RedditPost[]): void {
  if (posts.length === 0) {
    return; // Guardrail.
  }
  cache.set(cacheKey(subKey), {
    posts,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastFetchedAt: Date.now(),
  });
}

/**
 * Acquire an OAuth2 access token via the client credentials grant.
 * Reddit returns a token valid for ~1 hour; we cache it.
 */
async function getAccessToken(): Promise<string | null> {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return null;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const credentials = Buffer.from(
    `${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`,
  ).toString("base64");

  try {
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Atlas-Strategy/1.0 (+https://atlas-q2eh.vercel.app)",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.access_token) return null;
    cachedAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

interface RedditChild {
  kind: string;
  data: {
    id: string;
    subreddit_name_prefixed: string;
    subreddit: string;
    title: string;
    selftext?: string;
    permalink: string;
    score: number;
    num_comments: number;
    author: string;
    created_utc: number;
    link_flair_text?: string | null;
  };
}

function normalisePost(child: RedditChild): RedditPost | null {
  if (!child?.data?.id || !child.data.title) return null;
  const d = child.data;
  return {
    id: d.id,
    subreddit: d.subreddit_name_prefixed ?? `r/${d.subreddit}`,
    subredditName: d.subreddit,
    title: String(d.title),
    selftext: String(d.selftext ?? "").slice(0, 500),
    url: `https://reddit.com${d.permalink}`,
    score: typeof d.score === "number" ? d.score : 0,
    numComments: typeof d.num_comments === "number" ? d.num_comments : 0,
    author: String(d.author ?? "[deleted]"),
    createdUtc: new Date((d.created_utc ?? Date.now() / 1000) * 1000).toISOString(),
    flair: d.link_flair_text ?? null,
  };
}

async function fetchSubredditJson(
  path: string,
  accessToken: string | null,
): Promise<RedditChild[] | null> {
  const url = `${REDDIT_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "Atlas-Strategy/1.0 (+https://atlas-q2eh.vercel.app)",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 429) {
    lastFetchStatus = { status: "rate-limited", http: 429 };
    return null;
  }
  if (!res.ok) {
    lastFetchStatus = {
      status: "http-error",
      http: res.status,
      errorSnippet: (await res.text()).slice(0, 200),
    };
    return null;
  }
  const data = await res.json();
  if (!data?.data?.children || !Array.isArray(data.data.children)) {
    lastFetchStatus = {
      status: "bad-shape",
      errorSnippet: `expected children array, got ${typeof data?.data?.children}`,
    };
    return null;
  }
  return data.data.children as RedditChild[];
}

/**
 * Fetch top posts across the default subreddit set.
 * Returns a flat list of normalised RedditPost.
 */
export async function fetchTopRedditPosts(
  options: {
    subreddits?: string[];
    sort?: RedditSort;
    time?: RedditTime;
    limit?: number;
    bypassCache?: boolean;
  } = {},
): Promise<RedditPost[]> {
  const subs = options.subreddits ?? DEFAULT_SUBREDDITS;
  const sort = options.sort ?? "top";
  const time = options.time ?? "day";
  const perSub = Math.max(1, Math.min(Math.floor((options.limit ?? 25) / subs.length), 25));
  const subKey = `${sort}:${time}:${subs.join(",")}:${perSub}`;

  if (!options.bypassCache) {
    const cached = getCached(subKey);
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

  const accessToken = await getAccessToken();

  // Fetch each sub in parallel. Failures on one sub don't kill the
  // whole result — we just skip that sub.
  const settled = await Promise.allSettled(
    subs.map((sub) => {
      const tParam = sort === "top" || sort === "hot" ? `&t=${time}` : "";
      const path = `/r/${encodeURIComponent(sub)}/${sort}.json?limit=${perSub}${tParam}`;
      return fetchSubredditJson(path, accessToken);
    }),
  );

  const posts: RedditPost[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled" || !r.value) continue;
    for (const child of r.value) {
      const p = normalisePost(child);
      if (p) posts.push(p);
    }
  }

  // Sort merged list by score desc, take top N.
  posts.sort((a, b) => b.score - a.score);
  const limited = posts.slice(0, options.limit ?? 25);

  setCached(subKey, limited);
  if (lastFetchStatus.status !== "rate-limited") {
    lastFetchStatus = {
      status: "ok",
      postCount: limited.length,
      lastFetchedAt: new Date().toISOString(),
    };
  }
  return limited;
}

/**
 * Fetch top posts for a specific coin by searching the default
 * subreddit set with the coin's symbol and name.
 */
export async function fetchPostsForCoin(
  coin: { id: string; name: string; symbol: string },
  options: { limit?: number; bypassCache?: boolean } = {},
): Promise<RedditPost[]> {
  const limit = options.limit ?? 15;
  const all = await fetchTopRedditPosts({
    sort: "top",
    time: "day",
    limit: 100, // over-fetch so the keyword filter has room to work
    bypassCache: options.bypassCache,
  });

  const needle = new Set([coin.symbol.toLowerCase(), coin.name.toLowerCase()]);
  const matched = all.filter((p) => {
    const text = `${p.title} ${p.selftext}`.toLowerCase();
    for (const n of needle) {
      if (text.includes(n)) return true;
    }
    return false;
  });

  // Always return at least a few generic crypto posts so the UI is
  // never empty for a coin that doesn't have its own active subreddit.
  return matched.length > 0 ? matched.slice(0, limit) : all.slice(0, Math.min(5, limit));
}
