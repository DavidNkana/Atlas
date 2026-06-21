import { NextResponse } from "next/server";
import {
  fetchAllCategories,
  fetchNews,
  getNewsFetchStatus,
} from "@/lib/connectors/news";

/**
 * Day 23 — News connector diagnostic.
 *
 * v4: Also probes NewsAPI.org DIRECTLY with the raw key from the env,
 * bypassing the in-memory fetchStatus cache. This gives the truth even
 * if the module-level NEWS_API_KEY constant was captured at a stale
 * cold start, and surfaces the raw API response so David can see
 * what's actually happening without curl'ing from a terminal.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // Read the env fresh on every request — module-level `const` captures
  // once at cold start, which can be stale if env was added after.
  const rawKey = process.env.NEWS_API_KEY;
  const hasKey = !!rawKey;
  const keyPreview = rawKey
    ? `${rawKey.slice(0, 4)}...${rawKey.slice(-4)} (len=${rawKey.length})`
    : null;

  // Direct probe of NewsAPI — independent of fetchNews / module state.
  let directProbe: {
    http: number;
    status?: string;
    totalResults?: number;
    errorSnippet?: string;
  } = { http: 0 };
  if (rawKey) {
    try {
      const probeUrl =
        "https://newsapi.org/v2/everything?q=stock+market&pageSize=1";
      const probeRes = await fetch(probeUrl, {
        headers: { "X-Api-Key": rawKey },
        cache: "no-store",
      });
      const probeBody = await probeRes.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(probeBody);
      } catch {
        // not JSON
      }
      directProbe = {
        http: probeRes.status,
        status: parsed?.status,
        totalResults: parsed?.totalResults,
        errorSnippet: parsed?.message
          ? String(parsed.message).slice(0, 200)
          : probeBody.slice(0, 200),
      };
    } catch (err) {
      directProbe = {
        http: 0,
        errorSnippet: err instanceof Error ? err.message.slice(0, 200) : String(err),
      };
    }
  }

  // Quick probe via connector (uses module-level cache)
  let sampleArticleCount = 0;
  let sampleSource = "";
  try {
    const articles = await fetchNews("stocks", { limit: 5 });
    sampleArticleCount = articles.length;
    sampleSource = articles[0]?.source ?? "";
  } catch {
    // Non-fatal
  }

  let allCounts: Record<string, number> = {};
  try {
    const all = await fetchAllCategories();
    for (const [cat, list] of Object.entries(all)) {
      allCounts[cat] = list.length;
    }
  } catch {
    // Non-fatal
  }

  const directProbeOk = directProbe.http === 200 && directProbe.status === "ok";
  const connectorWorks = sampleArticleCount > 0;

  return NextResponse.json({
    ok: directProbeOk,
    version: "news-v4",
    summary: directProbeOk
      ? "NewsAPI.org reachable from Vercel Production with the configured key. If /news still shows empty, the React client is hitting a different env (cache or stale build)."
      : hasKey
        ? `Key IS set but NewsAPI.org returned HTTP ${directProbe.http} (${directProbe.status ?? "?"}). ${directProbe.errorSnippet ?? ""}`
        : "NEWS_API_KEY env var is NOT set on Vercel Production. Add it under Settings → Environment Variables → Production.",
    newsApi: {
      keyConfigured: hasKey,
      keyPreview,
      keyLength: rawKey?.length ?? 0,
      base: "https://newsapi.org/v2",
      freeTierLimit: "100 req/day",
      cacheTtlMs: 60 * 60 * 1000,
    },
    directProbe,
    sampleFetch: {
      category: "stocks",
      articleCount: sampleArticleCount,
      firstSource: sampleSource,
    },
    allCounts,
    perCategoryStatus: getNewsFetchStatus(),
    diagnosis: {
      envVarPresent: hasKey,
      newsApiReachable: directProbeOk,
      connectorReturnsArticles: connectorWorks,
      mostLikelyIssue: !hasKey
        ? "ENV: add NEWS_API_KEY to Vercel Production env"
        : !directProbeOk
          ? `KEY INVALID OR QUOTA: NewsAPI returned ${directProbe.http} — ${directProbe.errorSnippet ?? "unknown error"}`
          : !connectorWorks
            ? "CACHE STALE: connector cache is poisoned. Click Retry on /news or wait 1hr."
            : "WORKING: connector works. If /news UI still shows empty, hard-refresh (Ctrl+Shift+R) or wait for Vercel to fully roll out news-v4.",
    },
    tips: [
      "Hit /api/news/diag in your browser to see live diagnosis — no terminal needed.",
      "If diagnosis says 'envVarPresent: false', go to Vercel → Project → Settings → Environment Variables and tick the Production checkbox for NEWS_API_KEY. Then redeploy.",
      "If diagnosis says 'key invalid or quota', check https://newsapi.org/account for your account status. Free tier is 100 req/day — count your test calls.",
      "If diagnosis says 'cache stale', the Retry button on /news busts the 1-hour cache. Click it.",
    ],
  });
}
