import { NextResponse } from "next/server";
import { getCryptoPanicFetchStatus } from "@/lib/connectors/cryptopanic";
import { getRedditFetchStatus as _reddit } from "@/lib/connectors/reddit";
import { getYouTubeFetchStatus as _youtube } from "@/lib/connectors/youtube-titles";
import { getGitHubFetchStatus as _github } from "@/lib/connectors/github-activity";

/**
 * LCP-52 — Source health for the four Atlas Strategy connectors.
 *
 * Returns per-source status plus a summary of which env keys are
 * present (names only — NEVER values). No key values appear in this
 * response. Pattern matches /api/crypto/diag.
 *
 * Use this from a terminal:
 *   curl https://atlas-q2eh.vercel.app/api/strategy/diag
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SourceDiag {
  ok: boolean;
  status: string;
  postCount?: number;
  videoCount?: number;
  repoCount?: number;
  lastFetchedAt?: string;
  cacheAgeMs?: number;
  http?: number;
  errorSnippet?: string;
  envKeyPresent: boolean;
  envKeyName: string;
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

export async function GET() {
  const cp = getCryptoPanicFetchStatus();
  const rd = _reddit();
  const yt = _youtube();
  const gh = _github();

  const cryptopanic: SourceDiag = {
    ok: cp.status === "ok" || cp.status === "skipped-cache-hit",
    status: cp.status,
    postCount: cp.postCount,
    lastFetchedAt: cp.lastFetchedAt,
    cacheAgeMs: cp.cacheAgeMs,
    http: cp.http,
    errorSnippet: cp.errorSnippet,
    envKeyPresent: envPresent("CRYPTOPANIC_API_KEY"),
    envKeyName: "CRYPTOPANIC_API_KEY",
  };

  const reddit: SourceDiag = {
    ok: rd.status === "ok" || rd.status === "skipped-cache-hit",
    status: rd.status,
    postCount: rd.postCount,
    lastFetchedAt: rd.lastFetchedAt,
    cacheAgeMs: rd.cacheAgeMs,
    http: rd.http,
    errorSnippet: rd.errorSnippet,
    envKeyPresent:
      envPresent("REDDIT_CLIENT_ID") && envPresent("REDDIT_CLIENT_SECRET"),
    envKeyName: "REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET",
  };

  const youtube: SourceDiag = {
    ok: yt.status === "ok" || yt.status === "skipped-cache-hit",
    status: yt.status,
    videoCount: yt.videoCount,
    lastFetchedAt: yt.lastFetchedAt,
    cacheAgeMs: yt.cacheAgeMs,
    http: yt.http,
    errorSnippet: yt.errorSnippet,
    envKeyPresent: envPresent("YOUTUBE_API_KEY"),
    envKeyName: "YOUTUBE_API_KEY",
  };

  const github: SourceDiag = {
    ok: gh.status === "ok" || gh.status === "skipped-cache-hit" || gh.status === "ok-partial",
    status: gh.status,
    repoCount: gh.repoCount,
    lastFetchedAt: gh.lastFetchedAt,
    cacheAgeMs: gh.cacheAgeMs,
    http: gh.http,
    errorSnippet: gh.errorSnippet,
    envKeyPresent: envPresent("GITHUB_TOKEN"),
    envKeyName: "GITHUB_TOKEN",
  };

  const allOk =
    cryptopanic.ok && reddit.ok && youtube.ok && github.ok;
  const allEnvKeysPresent =
    cryptopanic.envKeyPresent &&
    reddit.envKeyPresent &&
    youtube.envKeyPresent &&
    github.envKeyPresent;

  return NextResponse.json({
    ok: allOk,
    version: "strategy-v1",
    asOf: new Date().toISOString(),
    summary: {
      overallStatus: allOk ? "ok" : "degraded",
      sourcesLive: [cryptopanic, reddit, youtube, github].filter((s) => s.ok).length,
      sourcesTotal: 4,
      allEnvKeysPresent,
      notFinancialAdvice: true,
    },
    sources: {
      cryptopanic,
      reddit,
      youtube,
      github,
    },
    notes: [
      "Key values are NEVER returned by this endpoint. envKeyPresent is true/false only.",
      "CryptoPanic free tier (no key) works at 200 req/day. Auth token raises the limit.",
      "Reddit works in anonymous mode if OAuth env vars are missing — IP rate-limited.",
      "YouTube and GitHub both have stricter rate limits without auth, and YouTube titles are empty if YOUTUBE_API_KEY is missing.",
      "Use ?bust=1 on the feed route to force a fresh fetch after changing env keys.",
    ],
  });
}
