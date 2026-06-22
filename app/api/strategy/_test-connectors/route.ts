import { NextResponse } from "next/server";
import {
  fetchCryptoPanicPosts,
  bustCryptoPanicCache,
  getCryptoPanicFetchStatus,
  type CryptoPanicPost,
} from "@/lib/connectors/cryptopanic";
import {
  fetchYouTubeTitlesForCoin,
  bustYouTubeCache,
  getYouTubeFetchStatus,
  type YouTubeVideoTitle,
} from "@/lib/connectors/youtube-titles";
import {
  fetchPostsForCoin,
  bustRedditCache,
  getRedditFetchStatus,
  type RedditPost,
} from "@/lib/connectors/reddit";
import {
  fetchCryptoRepoActivity,
  bustGitHubCache,
  getGitHubFetchStatus,
  type GitHubActivity,
} from "@/lib/connectors/github-activity";
import { COIN_MAP } from "@/lib/strategy/aggregator";

/**
 * LCP-52 — End-to-end connector smoke test.
 *
 * Runs all four connectors in parallel, bypassing cache, and returns
 * detailed per-source success/failure with sample data. Use this
 * after setting env keys in Vercel to confirm the runtime is
 * actually reaching the upstream APIs.
 *
 * Example:
 *   curl https://atlas-q2eh.vercel.app/api/strategy/_test-connectors
 *
 * Note the underscore prefix — Next.js does not treat it as a
 * private route, but it signals "diagnostic, not a user-facing API"
 * to anyone reading the path.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SourceTestResult {
  ok: boolean;
  latencyMs: number;
  itemCount: number;
  sample: unknown[];
  status: string;
  error?: string;
  http?: number;
  envKeyPresent: boolean;
  envKeyName: string;
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, ms: Date.now() - t0 };
  } catch (err) {
    return { result: err as T, ms: Date.now() - t0 };
  }
}

export async function GET() {
  // Bust every connector cache so we hit the live APIs.
  bustCryptoPanicCache();
  bustYouTubeCache();
  bustRedditCache();
  bustGitHubCache();

  const testCoin = COIN_MAP.bitcoin;

  const [cpT, ytT, rdT, ghT] = await Promise.all([
    timed<CryptoPanicPost[]>(() =>
      fetchCryptoPanicPosts({ coins: ["BTC"], filter: "hot", bypassCache: true }),
    ),
    timed<YouTubeVideoTitle[]>(() =>
      fetchYouTubeTitlesForCoin(testCoin, { maxResults: 5, bypassCache: true }),
    ),
    timed<RedditPost[]>(() =>
      fetchPostsForCoin(testCoin, { limit: 5, bypassCache: true }),
    ),
    timed<GitHubActivity[]>(() => fetchCryptoRepoActivity({ bypassCache: true })),
  ]);

  const cpStatus = getCryptoPanicFetchStatus();
  const ytStatus = getYouTubeFetchStatus();
  const rdStatus = getRedditFetchStatus();
  const ghStatus = getGitHubFetchStatus();

  const cryptopanic: SourceTestResult = {
    ok: Array.isArray(cpT.result) && cpT.result.length > 0,
    latencyMs: cpT.ms,
    itemCount: Array.isArray(cpT.result) ? cpT.result.length : 0,
    sample: Array.isArray(cpT.result) ? cpT.result.slice(0, 2) : [],
    status: cpStatus.status,
    error: cpStatus.errorSnippet,
    http: cpStatus.http,
    envKeyPresent: envPresent("CRYPTOPANIC_API_KEY"),
    envKeyName: "CRYPTOPANIC_API_KEY (optional, raises 200/day limit)",
  };

  const youtube: SourceTestResult = {
    ok: Array.isArray(ytT.result) && ytT.result.length > 0,
    latencyMs: ytT.ms,
    itemCount: Array.isArray(ytT.result) ? ytT.result.length : 0,
    sample: Array.isArray(ytT.result)
      ? ytT.result.map((v) => ({ title: v.title, channel: v.channelTitle, url: v.url }))
      : [],
    status: ytStatus.status,
    error: ytStatus.errorSnippet,
    http: ytStatus.http,
    envKeyPresent: envPresent("YOUTUBE_API_KEY"),
    envKeyName: "YOUTUBE_API_KEY (required — without it, YouTube source is empty)",
  };

  const reddit: SourceTestResult = {
    ok: Array.isArray(rdT.result) && rdT.result.length > 0,
    latencyMs: rdT.ms,
    itemCount: Array.isArray(rdT.result) ? rdT.result.length : 0,
    sample: Array.isArray(rdT.result)
      ? rdT.result.slice(0, 2).map((p) => ({
          title: p.title,
          subreddit: p.subreddit,
          score: p.score,
          url: p.url,
        }))
      : [],
    status: rdStatus.status,
    error: rdStatus.errorSnippet,
    http: rdStatus.http,
    envKeyPresent:
      envPresent("REDDIT_CLIENT_ID") && envPresent("REDDIT_CLIENT_SECRET"),
    envKeyName:
      "REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (optional — anonymous works in dev)",
  };

  const github: SourceTestResult = {
    ok: Array.isArray(ghT.result) && ghT.result.length > 0,
    latencyMs: ghT.ms,
    itemCount: Array.isArray(ghT.result) ? ghT.result.length : 0,
    sample: Array.isArray(ghT.result)
      ? ghT.result.slice(0, 3).map((a) => ({
          repo: a.repo,
          commitsLast7d: a.commitsLast7d,
          commitsLast30d: a.commitsLast30d,
          stars: a.stars,
          lastCommitAt: a.lastCommitAt,
        }))
      : [],
    status: ghStatus.status,
    error: ghStatus.errorSnippet,
    http: ghStatus.http,
    envKeyPresent: envPresent("GITHUB_TOKEN"),
    envKeyName: "GITHUB_TOKEN (optional — raises 60/hr limit to 5000/hr)",
  };

  const liveSources = [cryptopanic, youtube, reddit, github].filter((s) => s.ok).length;

  return NextResponse.json({
    ok: liveSources > 0,
    version: "strategy-v1",
    asOf: new Date().toISOString(),
    testCoin: { id: testCoin.id, name: testCoin.name, symbol: testCoin.symbol },
    summary: {
      sourcesLive: liveSources,
      sourcesTotal: 4,
      overallStatus: liveSources === 4 ? "all-sources-live" : liveSources === 0 ? "no-sources-live" : "partial",
      notFinancialAdvice: true,
    },
    sources: {
      cryptopanic,
      youtube,
      reddit,
      github,
    },
    nextSteps: [
      "If youtube.envKeyPresent is false, add YOUTUBE_API_KEY in Vercel env and redeploy.",
      "If github.envKeyPresent is false, add GITHUB_TOKEN in Vercel env and redeploy.",
      "If reddit status is rate-limited, wait 5 minutes and retry.",
      "If cryptopanic status is rate-limited, the 200/day free-tier quota is exhausted — sign up for Pro or wait until tomorrow.",
      "If all 4 sources show ok:false, check Vercel function logs for the underlying network errors.",
    ],
  });
}
