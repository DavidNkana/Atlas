import { NextRequest, NextResponse } from "next/server";
import {
  fetchTopRedditPosts,
  getRedditFetchStatus,
  type RedditPost,
} from "@/lib/connectors/reddit";
import {
  fetchYouTubeTitlesForCoin,
  getYouTubeFetchStatus,
  type YouTubeVideoTitle,
} from "@/lib/connectors/youtube-titles";
import {
  fetchCryptoPanicPosts,
  getCryptoPanicFetchStatus,
  type CryptoPanicPost,
} from "@/lib/connectors/cryptopanic";
import {
  fetchCryptoRepoActivity,
  getGitHubFetchStatus,
  type GitHubActivity,
} from "@/lib/connectors/github-activity";
import { listSupportedCoins } from "@/lib/strategy/aggregator";
import {
  buildAlgorithm,
  type AlgorithmResult,
} from "@/lib/strategy/atlas-algorithm";

/**
 * LCP-55 — Atlas Algorithm endpoint.
 *
 * The founder's boss's rule: "Sum the digits. If odd, keep it. If
 * even, throw it away." Then rank coins by mention count in the
 * qualified set, descending, top 50.
 *
 * Per-source "number to digit-sum":
 *   - YouTube:    video duration as raw displayed digits, colon-stripped
 *   - GitHub:     commits in the last 7 days, per repo
 *   - CryptoPanic: net votes (positive − negative)
 *   - Reddit:     post score (upvotes)
 *
 * GET /api/strategy/algorithm?limit=50&bust=1
 *
 * Cache: 10 minutes. ?bust=1 forces a fresh fetch and bypasses the
 * route-level cache (each underlying connector has its own cache
 * which gets naturally bypassed by ?bust=1 at the upstream level).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  result: AlgorithmResult;
  expiresAt: number;
  lastFetchedAt: number;
}

let cache: CacheEntry | null = null;

function getCached(): AlgorithmResult | null {
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

function setCached(result: AlgorithmResult): void {
  if (result.trending.length === 0) {
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
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)), 100);
  const shouldBust = url.searchParams.get("bust") === "1";

  if (!shouldBust) {
    const cached = getCached();
    if (cached) return NextResponse.json(cached);
  }

  // Fetch all 4 sources in parallel.
  const redditPromise: Promise<RedditPost[]> = fetchTopRedditPosts({
    sort: "top",
    time: "day",
    limit: 200, // over-fetch so the filter has room to work
  }).catch((e) => {
    console.error("[algorithm] reddit fetch failed:", e);
    return [];
  });

  // YouTube needs per-coin queries; iterate the supported list in
  // parallel. 5 videos per coin is enough — the filter is strict.
  const coins = listSupportedCoins();
  const youtubePromise: Promise<YouTubeVideoTitle[]> = Promise.all(
    coins.map((c) =>
      fetchYouTubeTitlesForCoin(c, { maxResults: 5 }).catch(() => []),
    ),
  ).then((arrays) => arrays.flat());

  const cryptopanicPromise: Promise<CryptoPanicPost[]> = fetchCryptoPanicPosts({
    filter: "hot",
  }).catch((e) => {
    console.error("[algorithm] cryptopanic fetch failed:", e);
    return [];
  });

  const githubPromise: Promise<GitHubActivity[]> = fetchCryptoRepoActivity().catch((e) => {
    console.error("[algorithm] github fetch failed:", e);
    return [];
  });

  const [reddit, youtube, cryptopanic, github] = await Promise.all([
    redditPromise,
    youtubePromise,
    cryptopanicPromise,
    githubPromise,
  ]);

  const result = buildAlgorithm(
    { reddit, youtube, cryptopanic, github },
    { limit },
  );

  // Surface per-source fetch status for diagnosability
  const rdStatus = getRedditFetchStatus();
  const ytStatus = getYouTubeFetchStatus();
  const cpStatus = getCryptoPanicFetchStatus();
  const ghStatus = getGitHubFetchStatus();

  // Annotate filterStats with the upstream status if the source returned 0
  // (helps the user see "0 qualified because 0 returned" vs "0 qualified
  // because rule rejected everything")
  if (result.filterStats.reddit.qualified === 0 && reddit.length > 0) {
    result.filterStats.reddit.reason =
      rdStatus.status !== "ok" && rdStatus.status !== "skipped-cache-hit"
        ? `upstream: ${rdStatus.status}`
        : "0 reddit posts passed the odd-digit filter";
  }
  if (result.filterStats.youtube.qualified === 0 && youtube.length > 0) {
    result.filterStats.youtube.reason =
      ytStatus.status !== "ok" && ytStatus.status !== "skipped-cache-hit"
        ? `upstream: ${ytStatus.status}`
        : "MVP: YouTube connector does not return duration yet. Algorithm upgrade ticket pending.";
  }
  if (result.filterStats.cryptopanic.qualified === 0 && cryptopanic.length > 0) {
    result.filterStats.cryptopanic.reason =
      cpStatus.status !== "ok" && cpStatus.status !== "skipped-cache-hit"
        ? `upstream: ${cpStatus.status}`
        : "0 cryptopanic posts passed the odd-digit filter";
  }
  if (result.filterStats.github.qualified === 0 && github.length > 0) {
    result.filterStats.github.reason =
      ghStatus.status !== "ok" && ghStatus.status !== "ok-partial" && ghStatus.status !== "skipped-cache-hit"
        ? `upstream: ${ghStatus.status}`
        : "0 github repos passed the odd-digit filter";
  }

  setCached(result);
  return NextResponse.json(result);
}
