"use client";

/**
 * Day 23 — Bing News-style card grid.
 *
 * Layout matches Microsoft Bing News feed:
 *   - Category tabs at top (All / Stocks / Crypto / Investments / Real Estate)
 *   - 2-column responsive grid of cards
 *   - Each card: thumbnail (left), source + relative time (top meta),
 *     headline (2-line max, bold), description (2-line max, muted),
 *     sentiment badge (positive/neutral/negative colored dot)
 *   - "View more" button at bottom of each section
 *   - Cards link out to source article (target=_blank)
 */

import { useState, useEffect } from "react";
import {
  fetchAllCategories,
  relativeTime,
  type NewsArticle,
  type NewsCategory,
} from "@/lib/connectors/news";

const CATEGORIES: { id: NewsCategory; label: string; description: string }[] = [
  { id: "stocks", label: "Stocks", description: "JSE, NYSE, NASDAQ, IPOs, earnings" },
  { id: "crypto", label: "Crypto", description: "Bitcoin, Ethereum, DeFi, blockchain" },
  { id: "investments", label: "Investments", description: "Funds, ETFs, venture capital" },
  { id: "real_estate", label: "Real Estate", description: "Property market, REITs, mortgages" },
];

const SENTIMENT_BADGE: Record<NonNullable<NewsArticle["sentiment"]>, string> = {
  positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  neutral: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  negative: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const SENTIMENT_LABEL: Record<NonNullable<NewsArticle["sentiment"]>, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

export function NewsFeedGrid() {
  const [activeTab, setActiveTab] = useState<NewsCategory>("stocks");
  const [articlesByCat, setArticlesByCat] = useState<
    Record<NewsCategory, NewsArticle[]>
  >({
    stocks: [],
    crypto: [],
    investments: [],
    real_estate: [],
    all: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAllCategories()
      .then((data) => {
        if (!cancelled) {
          setArticlesByCat(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleArticles = (() => {
    if (activeTab === "all") {
      // Flatten + sort by publishedAt desc
      return Object.values(articlesByCat)
        .flat()
        .sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
        );
    }
    return articlesByCat[activeTab] ?? [];
  })();

  const displayed = showAll
    ? visibleArticles
    : visibleArticles.slice(0, 8);

  return (
    <section className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-atlas-text">
            Market intelligence
          </h1>
          <p className="mt-1 text-xs text-atlas-muted">
            Stocks, crypto, investments &amp; real estate — for land
            developers tracking market signals. Updated hourly.
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-atlas-muted">
          Powered by NewsAPI.org
        </span>
      </div>

      {/* Category tabs (Bing-style) */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-atlas-border/40">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setActiveTab(cat.id);
              setShowAll(false);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              activeTab === cat.id
                ? "border-atlas-accent text-atlas-text"
                : "border-transparent text-atlas-muted hover:text-atlas-text"
            }`}
          >
            {cat.label}
            {articlesByCat[cat.id]?.length > 0 && (
              <span className="ml-2 rounded-full bg-atlas-surface px-2 py-0.5 font-mono text-[9px] text-atlas-muted">
                {articlesByCat[cat.id].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active tab description */}
      <p className="mb-4 text-[11px] text-atlas-muted">
        {CATEGORIES.find((c) => c.id === activeTab)?.description}
      </p>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-amber-900 bg-atlas-surface px-4 py-3 text-xs text-amber-400"
        >
          News API error: {error}. Check that NEWS_API_KEY is set in
          Vercel environment variables.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded border border-atlas-border/40 bg-atlas-surface/40"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && visibleArticles.length === 0 && (
        <div className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-8 text-center text-sm text-atlas-muted">
          No articles in this category right now. Try the All tab —
          it surfaces the broadest mix of stocks, crypto, investments
          and real-estate coverage from around the world. NewsAPI.org
          free tier caches for an hour.
        </div>
      )}

      {/* Card grid (Bing layout) */}
      {!loading && displayed.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {displayed.map((article) => (
            <li
              key={article.id}
              className="group overflow-hidden rounded border border-atlas-border/40 bg-atlas-surface/40 transition hover:border-atlas-accent/50 hover:bg-atlas-surface"
            >
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full gap-3 p-3"
              >
                {/* Thumbnail */}
                {article.urlToImage ? (
                  <img
                    src={article.urlToImage}
                    alt=""
                    className="h-24 w-24 shrink-0 rounded object-cover"
                    onError={(e) => {
                      // Fallback if image fails to load
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded bg-atlas-bg text-atlas-muted">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l4-4h10l4 4M3 7h18" />
                    </svg>
                  </div>
                )}

                {/* Content */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-atlas-muted">
                    <span className="truncate font-medium">
                      {article.source}
                    </span>
                    <span>·</span>
                    <span className="shrink-0">
                      {relativeTime(article.publishedAt)}
                    </span>
                  </div>

                  <h3 className="mb-1 line-clamp-2 text-sm font-semibold leading-snug text-atlas-text group-hover:text-atlas-accent">
                    {article.title}
                  </h3>

                  {article.description && (
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-atlas-muted">
                      {article.description}
                    </p>
                  )}

                  {article.sentiment && (
                    <span
                      className={`mt-auto inline-flex w-fit items-center gap-1 self-start rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                        SENTIMENT_BADGE[article.sentiment]
                      }`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          article.sentiment === "positive"
                            ? "bg-emerald-400"
                            : article.sentiment === "negative"
                              ? "bg-rose-400"
                              : "bg-zinc-400"
                        }`}
                      />
                      {SENTIMENT_LABEL[article.sentiment]}
                    </span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* View more button */}
      {!loading && !showAll && visibleArticles.length > 8 && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded border border-atlas-border bg-atlas-surface px-6 py-2 text-xs font-medium uppercase tracking-wider text-atlas-text transition hover:border-atlas-accent hover:text-atlas-accent"
          >
            View more ({visibleArticles.length - 8} more)
          </button>
        </div>
      )}
    </section>
  );
}
