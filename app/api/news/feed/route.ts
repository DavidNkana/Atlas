import { NextRequest, NextResponse } from "next/server";
import {
  bustNewsCache,
  fetchAllCategories,
  type NewsCategory,
} from "@/lib/connectors/news";

/**
 * Day 23 v5 — Client-facing news feed endpoint.
 *
 * The NewsFeedGrid component is a "use client" component. It cannot
 * import lib/connectors/news.ts directly because that module reads
 * process.env.NEWS_API_KEY at load time — and on the client bundle,
 * process.env.NEWS_API_KEY is always undefined. Calling fetchAllCategories()
 * from the client returned [] even when the server-side connector had
 * articles.
 *
 * This route runs the connector server-side (where process.env.NEWS_API_KEY
 * is real), then returns the JSON to the client. The client only sees
 * articles or an empty array, never the env var directly.
 *
 * Cache: relies on the connector's in-memory 1-hour cache. This route
 * is force-dynamic so it always reads current cache state.
 *
 * LCP-45 — Vercel runs each route in its own serverless function,
 * so the in-memory cache in /api/news/feed and /api/news/retry
 * are different Map instances. The Retry button (POST /api/news/retry)
 * busts its OWN cache, not the feed's. We add a `?bust=1` query
 * param so the client can force a fresh fetch on the feed
 * instance itself.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CATEGORIES: NewsCategory[] = [
  "stocks",
  "crypto",
  "investments",
  "real_estate",
];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const shouldBust = url.searchParams.get("bust") === "1";
    const targetCategory = url.searchParams.get("category");

    // LCP-45 — Vercel route isolation fix. When the client
    // signals bust=1, clear the local cache for the requested
    // category (or all) BEFORE fetching. This guarantees a
    // fresh fetch on the same instance that handles the GET.
    if (shouldBust) {
      if (targetCategory && VALID_CATEGORIES.includes(targetCategory as NewsCategory)) {
        bustNewsCache(targetCategory as NewsCategory);
      } else {
        bustNewsCache();
      }
    }

    const articles = await fetchAllCategories();
    const total = Object.values(articles).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    return NextResponse.json({
      ok: true,
      version: "news-v5",
      articles,
      counts: {
        stocks: articles.stocks?.length ?? 0,
        crypto: articles.crypto?.length ?? 0,
        investments: articles.investments?.length ?? 0,
        real_estate: articles.real_estate?.length ?? 0,
        total,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        version: "news-v5",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
