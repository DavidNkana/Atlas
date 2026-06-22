/**
 * LCP-51 S2 + LCP-56 — YouTube titles + duration connector.
 *
 * Pulls recent video titles + descriptions + durations from YouTube
 * Data API v3 for crypto content. Used for "what creators are saying
 * about [coin]" — the title + description text is enough for
 * sentiment scoring and topic clustering, and the duration powers
 * the Atlas Algorithm (LCP-55) odd-digit filter.
 *
 * Two-call flow:
 *   1. search.list  (100 units) — find recent videos matching the coin
 *   2. videos.list  (1 unit per video) — fetch contentDetails.duration
 *      for the search results. 10,000 units/day free tier, so
 *      ~5,000 videos/day is the cap. We stay well under it.
 *
 * Why two calls instead of one: search.list does not return
 * contentDetails.duration. videos.list requires the video IDs from
 * a prior search. Combining is standard YouTube API practice.
 *
 * Graceful degradation: if the second call (videos.list) fails, we
 * return videos with no duration and status remains "ok" so the
 * rest of the pipeline keeps working — the algorithm just won't
 * qualify those videos.
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
  /** ISO 8601 duration string, e.g. "PT6M47S" or "PT1H2M30S". May be missing if videos.list failed. */
  duration?: string;
}

export interface YouTubeFetchStatus {
  status:
    | "ok"
    | "no-key"
    | "http-error"
    | "bad-shape"
    | "rate-limited"
    | "skipped-cache-hit"
    | "ok-no-duration";
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
 * Fetch durations for a list of video IDs in batches of 50 (the
 * YouTube videos.list API limit per call). Returns a Map of id →
 * duration ISO string. Failures degrade to empty map.
 */
async function fetchDurations(
  videoIds: string[],
): Promise<Map<string, string>> {
  if (!YOUTUBE_API_KEY || videoIds.length === 0) return new Map();
  const out = new Map<string, string>();
  // YouTube videos.list accepts up to 50 IDs per call. Chunk if more.
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "contentDetails",
      id: batch.join(","),
      key: YOUTUBE_API_KEY,
    });
    const url = `${YOUTUBE_BASE}/videos?${params.toString()}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Atlas-Strategy/1.0 (+https://atlas-q2eh.vercel.app)",
        },
        cache: "no-store",
      });
      if (!res.ok) continue; // Graceful degrade — return whatever we have
      const data = await res.json();
      if (!data || !Array.isArray(data.items)) continue;
      for (const item of data.items) {
        if (item?.id && item?.contentDetails?.duration) {
          out.set(String(item.id), String(item.contentDetails.duration));
        }
      }
    } catch {
      continue; // Graceful degrade
    }
  }
  return out;
}

/**
 * Fetch recent video titles for a coin, with duration enrichment.
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

    const baseVideos: YouTubeVideoTitle[] = data.items
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

    // LCP-56 — enrich with duration via videos.list. Graceful
    // degrade: if this fails, we still return the videos, just
    // without duration. The algorithm filter will then skip
    // them and surface a "no-duration" reason per item.
    const ids = baseVideos.map((v) => v.id);
    const durations = await fetchDurations(ids);
    const videos: YouTubeVideoTitle[] = baseVideos.map((v) => {
      const d = durations.get(v.id);
      return d ? { ...v, duration: d } : v;
    });

    const videosWithDuration = videos.filter((v) => typeof v.duration === "string").length;

    setCached(query, videos);
    lastFetchStatus = {
      status: videosWithDuration > 0 ? "ok" : "ok-no-duration",
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
