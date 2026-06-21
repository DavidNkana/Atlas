import { NewsFeedGrid } from "@/components/NewsFeedGrid";

/**
 * Day 23 — Investor news feed.
 *
 * Bing-style news layout filtered to investor-relevant categories:
 * stocks, crypto, investments, real estate. Free NewsAPI.org only.
 *
 * Embedded linkable from Atlas sidebar (Land → News).
 */
export const metadata = {
  title: "Market Intelligence — Atlas",
  description:
    "Stocks, crypto, investments and real estate news for land developers tracking market signals.",
};

export const dynamic = "force-dynamic";

export default function NewsPage() {
  return (
    <main className="min-h-screen bg-atlas-bg px-4 pb-12 pt-6 text-atlas-text">
      <NewsFeedGrid />
    </main>
  );
}
