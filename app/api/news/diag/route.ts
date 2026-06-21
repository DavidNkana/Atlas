import { NextResponse } from "next/server";
import {
  fetchAllCategories,
  fetchNews,
  getNewsFetchStatus,
} from "@/lib/connectors/news";

/**
 * Day 23 — News connector diagnostic.
 *
 * Returns the version of the news connector, whether NEWS_API_KEY is
 * set, and a per-category article count + sample article. Used by
 * Jobs for post-deploy verification and by /api/email-status to
 * surface missing keys.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const hasKey = !!process.env.NEWS_API_KEY;
  const keyPreview = process.env.NEWS_API_KEY
    ? `${process.env.NEWS_API_KEY.slice(0, 4)}...${process.env.NEWS_API_KEY.slice(-4)}`
    : null;

  // Quick probe of one category so the response carries evidence
  let sampleArticleCount = 0;
  let sampleSource = "";
  let sampleError: string | null = null;

  try {
    const articles = await fetchNews("stocks", { limit: 5 });
    sampleArticleCount = articles.length;
    sampleSource = articles[0]?.source ?? "";
  } catch (err) {
    sampleError = err instanceof Error ? err.message : String(err);
  }

  let allCounts: Record<string, number> = {};
  try {
    const all = await fetchAllCategories();
    for (const [cat, list] of Object.entries(all)) {
      allCounts[cat] = list.length;
    }
  } catch {
    // Non-fatal for diag endpoint
  }

  return NextResponse.json({
    ok: hasKey && sampleError === null && sampleArticleCount > 0,
    version: "news-v3",
    newsApi: {
      keyConfigured: hasKey,
      keyPreview,
      base: "https://newsapi.org/v2",
      freeTierLimit: "100 req/day",
      cacheTtlMs: 60 * 60 * 1000,
    },
    sampleFetch: {
      category: "stocks",
      articleCount: sampleArticleCount,
      firstSource: sampleSource,
      error: sampleError,
    },
    allCounts,
    perCategoryStatus: getNewsFetchStatus(),
    fixInstructions: hasKey
      ? null
      : "Add NEWS_API_KEY to Vercel environment variables (Production, Preview, Development). Get a free key at https://newsapi.org/register.",
    tips: [
      "NewsAPI.org free tier does NOT allow the domains=, country=, or category= parameters — passing any of them silently returns 0 articles instead of an error. SA bias is applied client-side via PREFERRED_SA_SOURCES sort.",
      "If articleCount is 0 for every category, check (1) NEWS_API_KEY is set in ALL 3 Vercel envs (Production, Preview, Development — not just Preview), (2) the free tier quota hasn't been exhausted (100 req/day), and (3) the cache hasn't cached an empty result from a previous failed run.",
      "If keyConfigured=false in production, the env var was set in the wrong environment or not propagated to a redeploy. Try Vercel → Project → Settings → Environment Variables → confirm 'Production' checkbox is ticked.",
      "Empty results are NEVER cached. Cache only fills after a successful non-empty fetch.",
    ],
  });
}
