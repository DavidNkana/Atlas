import { NextResponse } from "next/server";
import {
  bustNewsCache,
  fetchNews,
  type NewsCategory,
} from "@/lib/connectors/news";

/**
 * Day 23 v3 — Force-refresh the news cache.
 *
 * Hits when David (or any user) clicks "Retry" on the empty state.
 * Busts the in-memory cache for the requested category (or all 4),
 * then performs a fresh fetch bypassing cache.
 *
 * Cache poisoning guardrail (news-v3): empty results are never cached,
 * so a retry can recover without waiting an hour.
 */
export const dynamic = "force-dynamic";

const VALID_CATEGORIES: NewsCategory[] = [
  "stocks",
  "crypto",
  "investments",
  "real_estate",
];

export async function POST(req: Request) {
  let category: NewsCategory | "all" = "all";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.category && VALID_CATEGORIES.includes(body.category)) {
      category = body.category;
    }
  } catch {
    // default to all
  }

  bustNewsCache(category === "all" ? undefined : category);

  const cats = category === "all" ? VALID_CATEGORIES : [category];
  const results = await Promise.all(
    cats.map(async (c) => {
      const articles = await fetchNews(c, { limit: 8, bypassCache: true });
      return [c, articles.length] as const;
    }),
  );

  const counts = Object.fromEntries(results) as Record<NewsCategory, number>;

  return NextResponse.json({
    ok: true,
    version: "news-v3",
    category,
    counts,
    totalArticles: Object.values(counts).reduce((a, b) => a + b, 0),
  });
}

export async function GET() {
  // Convenience: GET also busts all (idempotent) and reports counts
  return POST(new Request("http://localhost", { method: "POST" }));
}
