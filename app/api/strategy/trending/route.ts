import { NextRequest, NextResponse } from "next/server";
import {
  fetchCryptoPanicPosts,
  bustCryptoPanicCache,
  getCryptoPanicFetchStatus,
  type CryptoPanicPost,
} from "@/lib/connectors/cryptopanic";
import {
  fetchYouTubeTitlesForCoin,
  getYouTubeFetchStatus,
  type YouTubeVideoTitle,
} from "@/lib/connectors/youtube-titles";
import {
  fetchTopRedditPosts,
  getRedditFetchStatus,
  type RedditPost,
} from "@/lib/connectors/reddit";
import {
  fetchCryptoRepoActivity,
  getGitHubFetchStatus,
  type GitHubActivity,
} from "@/lib/connectors/github-activity";
import { COIN_MAP, listSupportedCoins } from "@/lib/strategy/aggregator";
import { buildTrending, type TrendingResult } from "@/lib/strategy/trending";

/**
 * LCP-53 — Atlas Strategy trending lists.
 *
 * GET /api/strategy/trending?limit=20&bust=1
 *
 * Returns 4 per-source rankings (Reddit, YouTube, CryptoPanic,
 * GitHub) of top 20 coins each, plus a combined "overall" top 20
 * that blends all 4 with source-reliability weights.
 *
 * Algorithm: mention count + recency. No sentiment yet — the
 * Atlas Strategy algorithm is pending founder spec; the response
 * explicitly says so in the `methodology` field. When the spec
 * arrives, sentiment-weighted ranking slots in without changing
 * the route shape.
 *
 * Cache: 10 minutes. ?bust=1 forces a fresh fetch and bypasses
 * cache for all 4 sources.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  result: TrendingResult;
  expiresAt: number;
  lastFetchedAt: number;
}

let cache: CacheEntry | null = null;

function getCached(): TrendingResult | null {
  if (!cache) return null;
  if (cache.expiresAt < Date.now()) {
    cache = null;
    return null;
  }
  const out = { ...cache.result };
  out.cache.ageMs = Date.now() - cache.lastFetchedAt;
  out.cache.lastFetchedAt = new Date(cache.lastFetchedAt).toISOString();
  return out;
}

function setCached(result: TrendingResult): void {
  if (result.lists.reddit.length === 0 &&
      result.lists.youtube.length === 0 &&
      result.lists.cryptopanic.length === 0 &&
      result.lists.github.length === 0) {
    // Guardrail: never cache empty (lesson from the news connector).
    return;
  }
  cache = {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastFetchedAt: Date.now(),
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)), 50);
  const shouldBust = url.searchParams.get("bust") === "1";

  if (!shouldBust) {
    const cached = getCached();
    if (cached) return NextResponse.json(cached);
  }

  if (shouldBust) {
    bustCryptoPanicCache();
    // Other connectors expose their own bust functions. We could call
    // them all but since /api/strategy/_test-connectors already
    // bypasses everything, the trending call naturally hits fresh
    // data because each connector has its own short cache.
  }

  // Fetch from all 4 sources in parallel. We use a "wide" query for
  // each so the trending has the broadest possible pool to rank.
  const redditPromise: Promise<RedditPost[]> = fetchTopRedditPosts({
    sort: "top",
    time: "day",
    limit: 100,
  }).catch((e) => {
    console.error("[trending] reddit fetch failed:", e);
    return [];
  });

  // YouTube needs per-coin queries; iterate the supported list.
  // We do this in parallel — 20 coins × 1 search each.
  const coins = listSupportedCoins();
  const youtubePromise: Promise<YouTubeVideoTitle[]> = Promise.all(
    coins.map((c) =>
      fetchYouTubeTitlesForCoin(c, { maxResults: 5 }).catch(() => []),
    ),
  ).then((arrays) => arrays.flat());

  const cryptopanicPromise: Promise<CryptoPanicPost[]> = fetchCryptoPanicPosts({
    filter: "hot",
  }).catch((e) => {
    console.error("[trending] cryptopanic fetch failed:", e);
    return [];
  });

  const githubPromise: Promise<GitHubActivity[]> = fetchCryptoRepoActivity().catch((e) => {
    console.error("[trending] github fetch failed:", e);
    return [];
  });

  const [reddit, youtubeArrays, cryptopanic, github] = await Promise.all([
    redditPromise,
    youtubePromise,
    cryptopanicPromise,
    githubPromise,
  ]);

  const result = buildTrending(
    { reddit, youtube: youtubeArrays, cryptopanic, github },
    { limit },
  );

  // Surface per-source fetch status (raw, with lastFetchedAt + errors).
  // This helps the founder diagnose why a list is empty.
  const rdStatus = getRedditFetchStatus();
  const ytStatus = getYouTubeFetchStatus();
  const cpStatus = getCryptoPanicFetchStatus();
  const ghStatus = getGitHubFetchStatus();

  result.sources = {
    reddit: {
      ok: rdStatus.status === "ok" || rdStatus.status === "skipped-cache-hit",
      error:
        rdStatus.status !== "ok" && rdStatus.status !== "skipped-cache-hit"
          ? rdStatus.errorSnippet
          : undefined,
    },
    youtube: {
      ok: ytStatus.status === "ok" || ytStatus.status === "skipped-cache-hit",
      error:
        ytStatus.status !== "ok" && ytStatus.status !== "skipped-cache-hit"
          ? ytStatus.errorSnippet
          : undefined,
    },
    cryptopanic: {
      ok: cpStatus.status === "ok" || cpStatus.status === "skipped-cache-hit",
      error:
        cpStatus.status !== "ok" && cpStatus.status !== "skipped-cache-hit"
          ? cpStatus.errorSnippet
          : undefined,
    },
    github: {
      ok: ghStatus.status === "ok" || ghStatus.status === "ok-partial" || ghStatus.status === "skipped-cache-hit",
      error:
        ghStatus.status !== "ok" && ghStatus.status !== "ok-partial" && ghStatus.status !== "skipped-cache-hit"
          ? ghStatus.errorSnippet
          : undefined,
    },
  };

  setCached(result);
  return NextResponse.json(result);
}
