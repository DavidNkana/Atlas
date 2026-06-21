import { NextResponse } from "next/server";
import {
  fetchAllCategories,
  fetchNews,
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
    ok: hasKey && sampleError === null,
    version: "news-v1",
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
    fixInstructions: hasKey
      ? null
      : "Add NEWS_API_KEY to Vercel environment variables (Production, Preview, Development). Get a free key at https://newsapi.org/register.",
  });
}
