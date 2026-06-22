/**
 * LCP-51 S2 — YouTube titles connector.
 *
 * Pulls recent video titles + descriptions from YouTube Data API v3
 * for crypto content. We use this for "what creators are saying
 * about [coin]" — the title + description text is enough for
 * sentiment scoring and topic clustering, without paying the cost
 * (API quota + legal gray area) of fetching full transcripts.
 *
 * Free tier: 10,000 units/day. `search.list` costs 100 units per
 * call; `videos.list` costs 1 unit. We do ONE search per coin to
 * keep the daily budget comfortable (50 coins * 100 = 5,000 units,
 * 50% of the free tier — well under the limit, leaves room for
 * other connectors and ad-hoc manual fetches).
 *
 * MVP per LCP-50: titles only, no transcripts. Phase 2 (deferred):
 * trusted-channel filter (Coin Bureau, BitBoy, Altcoin Daily, etc.),
 * transcript fetch with legal review.
 *
 * Cache: 30 minutes. YouTube content moves slower than social, faster
 * than news.
 */

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_BASE = "https://www.googleapis.com/youtube/v3";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface YouTubeVideoTitle {
  id: string; // videoId
  title: string;
  description: string; // first 200 chars only — keeps bundle small and avoids re-sending full descriptions
  channelTitle: string;
  publishedAt: string; // ISO
  url: string; // https://youtube.com/watch?v=...
}

export interface YouTubeFetchStatus {
  status:
    | "ok"
    | "no-key"
    | "http-error"
    | "bad-shape"
    | "rate-limited"
    | "skipped-cache-hit";
  http?: number;
  errorSnippet?: string;
  lastFetchedAt?: string;
  videoCount?: number;
  cacheAgeMs?: number;
}

const cache = new Map<
  string,
  { videos: YouTubeVideoTitle[]; expiresAt: number; lastFetchedAt: number }
>();

let lastFetchStatus: YouTubeFetchStatus = { status: "no-key" };

export function getYouTubeFetchStatus(): YouTubeFetchStatus {
  return lastFetchStatus;
}

export function bustYouTubeCache(): void {
  cache.clear();
}

function cacheKey(query: string): string {
  return `youtube:${query}`;
}

function getCached(query: string): {
  videos: YouTubeVideoTitle[];
  lastFetchedAt: number;
} | null {
  const entry = cache.get(cacheKey(query));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(query));
    return null;
  }
  return { videos: entry.videos, lastFetchedAt: entry.lastFetchedAt };
}

function setCached(query: string, videos: YouTubeVideoTitle[]): void {
  if (videos.length === 0) {
    return; // Guardrail: never cache empty.
  }
  cache.set(cacheKey(query), {
    videos,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastFetchedAt: Date.now(),
  });
}

/**
 * Fetch recent video titles for a coin.
 * If YOUTUBE_API_KEY is not set, returns [] and sets status to "no-key"
 * (graceful degradation — the strategy page will show "YouTube
 * source unavailable" instead of crashing).
 */
export async function fetchYouTubeTitlesForCoin(
  coin: { id: string; name: string; symbol: string },
  options: { maxResults?: number; bypassCache?: boolean } = {},
): Promise<YouTubeVideoTitle[]> {
  if (!YOUTUBE_API_KEY) {
    lastFetchStatus = { status: "no-key" };
    return [];
  }

  const maxResults = Math.min(options.maxResults ?? 10, 50);
  const query = `${coin.name} OR ${coin.symbol} crypto`;

  if (!options.bypassCache) {
    const cached = getCached(query);
    if (cached) {
      lastFetchStatus = {
        status: "skipped-cache-hit",
        videoCount: cached.videos.length,
        cacheAgeMs: Date.now() - cached.lastFetchedAt,
        lastFetchedAt: new Date(cached.lastFetchedAt).toISOString(),
      };
      return cached.videos;
    }
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    order: "date",
    maxResults: String(maxResults),
    relevanceLanguage: "en",
    safeSearch: "none",
    key: YOUTUBE_API_KEY,
  });
  const url = `${YOUTUBE_BASE}/search?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Atlas-Strategy/1.0 (+https://atlas-q2eh.vercel.app)",
      },
      cache: "no-store",
    });

    if (res.status === 429 || res.status === 403) {
      lastFetchStatus = {
        status: "rate-limited",
        http: res.status,
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
    if (!data || !Array.isArray(data.items)) {
      lastFetchStatus = {
        status: "bad-shape",
        errorSnippet: `expected items array, got ${typeof data?.items}`,
        lastFetchedAt: new Date().toISOString(),
      };
      return [];
    }

    const videos: YouTubeVideoTitle[] = data.items
      .filter((it: any) => it && it.id?.videoId)
      .map((it: any) => {
        const id = String(it.id.videoId);
        const snippet = it.snippet ?? {};
        const title = String(snippet.title ?? "");
        const fullDescription = String(snippet.description ?? "");
        return {
          id,
          title,
          description: fullDescription.slice(0, 200),
          channelTitle: String(snippet.channelTitle ?? ""),
          publishedAt: String(snippet.publishedAt ?? new Date().toISOString()),
          url: `https://youtube.com/watch?v=${id}`,
        };
      });

    setCached(query, videos);
    lastFetchStatus = {
      status: "ok",
      videoCount: videos.length,
      lastFetchedAt: new Date().toISOString(),
    };
    return videos;
  } catch (err) {
    lastFetchStatus = {
      status: "http-error",
      errorSnippet: err instanceof Error ? err.message : String(err),
      lastFetchedAt: new Date().toISOString(),
    };
    return [];
  }
}
