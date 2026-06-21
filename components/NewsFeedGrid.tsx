"use client";

/**
 * Day 23 v6 — Bing News-style hero + grid layout.
 *
 * Layout:
 *   - Top bar: page title (left) + Back button (right)
 *   - Category tabs (Stocks / Crypto / Investments / Real Estate)
 *   - Active tab description
 *   - HERO article (first article, big card with wide image + overlay
 *     gradient + large headline + full description + sentiment badge)
 *   - GRID of remaining articles (2-col responsive, image left, content right)
 *   - View more button at the bottom of each tab
 *
 * Data source: /api/news/feed (server route). We CANNOT import
 * lib/connectors/news directly from a "use client" component because
 * that module reads process.env.NEWS_API_KEY at module load — and on
 * the client bundle, process.env.NEWS_API_KEY is always undefined.
 *
 * Image source: /api/news/image?url=... server proxy. Many NewsAPI
 * source sites (biztoc.com, ft.com) reject hotlinking via Referer
 * checks; the proxy strips Referer and re-serves the image.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type NewsCategory =
  | "all"
  | "stocks"
  | "crypto"
  | "investments"
  | "real_estate";

interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  author: string | null;
  description: string | null;
  urlToImage: string | null;
  publishedAt: string;
  category: NewsCategory;
  sentiment?: "positive" | "neutral" | "negative";
}

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

// Per-category accent color for the hero placeholder gradient
const HERO_GRADIENT: Record<NewsCategory, string> = {
  all: "from-indigo-600/40 via-atlas-bg to-atlas-bg",
  stocks: "from-emerald-600/40 via-atlas-bg to-atlas-bg",
  crypto: "from-amber-600/40 via-atlas-bg to-atlas-bg",
  investments: "from-sky-600/40 via-atlas-bg to-atlas-bg",
  real_estate: "from-rose-600/40 via-atlas-bg to-atlas-bg",
};

function relativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} wk${wk === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Build a proxied image URL. Server-side proxy at /api/news/image
 * strips Referer so upstream can't hotlink-block.
 */
function proxiedImage(url: string | null): string | null {
  if (!url) return null;
  return `/api/news/image?url=${encodeURIComponent(url)}`;
}

export function NewsFeedGrid() {
  const router = useRouter();
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
  const [retrying, setRetrying] = useState(false);
  const [diag, setDiag] = useState<any>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/news/feed", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? `Feed endpoint returned ${r.status}`);
        return;
      }
      const stocks = data.articles.stocks ?? [];
      const crypto = data.articles.crypto ?? [];
      const investments = data.articles.investments ?? [];
      const real_estate = data.articles.real_estate ?? [];
      setArticlesByCat({
        stocks,
        crypto,
        investments,
        real_estate,
        all: [...stocks, ...crypto, ...investments, ...real_estate].sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
        ),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const refreshDiag = async () => {
    try {
      const r = await fetch("/api/news/diag", { cache: "no-store" });
      const d = await r.json();
      setDiag(d);
      return d;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    void refreshDiag().then(() => {
      if (cancelled) return;
    });
    void loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleArticles =
    activeTab === "all"
      ? articlesByCat.all
      : articlesByCat[activeTab] ?? [];

  const hero = visibleArticles[0];
  const rest = visibleArticles.slice(1);
  const restDisplayed = showAll ? rest : rest.slice(0, 7);

  return (
    <section className="mx-auto max-w-5xl">
      {/* Top bar — title (left) + Back button (right) */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-atlas-text">
            Market intelligence
          </h1>
          <p className="mt-1 text-xs text-atlas-muted">
            Stocks, crypto, investments &amp; real estate — for land
            developers tracking market signals. Updated hourly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            // Prefer history.back() if there's history; else go to /.
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          aria-label="Back to Atlas"
          className="group flex shrink-0 items-center gap-2 rounded border border-atlas-border bg-atlas-surface px-3 py-2 text-xs font-medium uppercase tracking-wider text-atlas-muted transition hover:border-atlas-accent hover:text-atlas-text"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition group-hover:-translate-x-0.5"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>
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
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
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

      <p className="mb-6 text-[11px] text-atlas-muted">
        {CATEGORIES.find((c) => c.id === activeTab)?.description}
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-amber-900 bg-atlas-surface px-4 py-3 text-xs text-amber-400"
        >
          News API error: {error}. Check that NEWS_API_KEY is set in
          Vercel environment variables.
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-3">
          <div className="h-64 animate-pulse rounded border border-atlas-border/40 bg-atlas-surface/40" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded border border-atlas-border/40 bg-atlas-surface/40"
              />
            ))}
          </div>
        </div>
      )}

      {/* HERO + GRID layout */}
      {!loading && !error && hero && (
        <div className="space-y-6">
          {/* Hero — first article, large */}
          <HeroCard article={hero} category={activeTab} />

          {/* Section divider with "More in [Category]" label */}
          {rest.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <h2 className="font-mono text-[10px] uppercase tracking-widest text-atlas-muted">
                  More in {CATEGORIES.find((c) => c.id === activeTab)?.label}
                </h2>
                <div className="h-px flex-1 bg-atlas-border/40" />
              </div>

              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {restDisplayed.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </ul>

              {!showAll && rest.length > 7 && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="rounded border border-atlas-border bg-atlas-surface px-6 py-2 text-xs font-medium uppercase tracking-wider text-atlas-text transition hover:border-atlas-accent hover:text-atlas-accent"
                  >
                    View more ({rest.length - 7} more)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!loading && !error && visibleArticles.length === 0 && (
        <EmptyState
          diag={diag}
          retrying={retrying}
          setRetrying={setRetrying}
          loadAll={loadAll}
          refreshDiag={refreshDiag}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

function HeroCard({
  article,
  category,
}: {
  article: NewsArticle;
  category: NewsCategory;
}) {
  const proxied = proxiedImage(article.urlToImage);
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-lg border border-atlas-border/40 bg-atlas-surface transition hover:border-atlas-accent/60"
    >
      <div className="relative h-64 w-full overflow-hidden md:h-80">
        {proxied ? (
          <img
            src={proxied}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const t = e.currentTarget as HTMLImageElement;
              t.style.display = "none";
              const fallback = t.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : null}
        {/* Fallback gradient + icon — always rendered, hidden if image loads */}
        <div
          className={`absolute inset-0 hidden items-center justify-center bg-gradient-to-br ${HERO_GRADIENT[category]}`}
          style={proxied ? { display: "none" } : { display: "flex" }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            className="text-atlas-muted"
          >
            <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l4-4h10l4 4M3 7h18" />
          </svg>
        </div>
        {/* Dark gradient overlay so headline reads on top of image */}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-atlas-bg via-atlas-bg/70 to-transparent" />
        {/* Content over the image */}
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-atlas-muted">
            {article.sentiment && (
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] ${
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
            <span className="font-semibold text-atlas-text">
              {article.source}
            </span>
            <span>·</span>
            <span>{relativeTime(article.publishedAt)}</span>
          </div>
          <h2 className="text-xl font-semibold leading-tight text-atlas-text group-hover:text-atlas-accent md:text-2xl">
            {article.title}
          </h2>
          {article.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-atlas-muted md:line-clamp-3">
              {article.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

function ArticleCard({ article }: { article: NewsArticle }) {
  const proxied = proxiedImage(article.urlToImage);
  return (
    <li className="group overflow-hidden rounded border border-atlas-border/40 bg-atlas-surface/40 transition hover:border-atlas-accent/50 hover:bg-atlas-surface">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full gap-3 p-3"
      >
        {proxied ? (
          <img
            src={proxied}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const t = e.currentTarget as HTMLImageElement;
              t.style.display = "none";
              const fallback = t.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }}
            className="h-24 w-24 shrink-0 rounded object-cover"
          />
        ) : null}
        <div
          className="hidden h-24 w-24 shrink-0 items-center justify-center rounded bg-atlas-bg text-atlas-muted"
          style={proxied ? { display: "none" } : { display: "flex" }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l4-4h10l4 4M3 7h18" />
          </svg>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-atlas-muted">
            <span className="truncate font-medium">{article.source}</span>
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
  );
}

function EmptyState({
  diag,
  retrying,
  setRetrying,
  loadAll,
  refreshDiag,
}: {
  diag: any;
  retrying: boolean;
  setRetrying: (b: boolean) => void;
  loadAll: () => Promise<void>;
  refreshDiag: () => Promise<any>;
}) {
  return (
    <div className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-8 text-center">
      <p className="text-sm text-atlas-text">
        No articles in this category right now.
      </p>

      {diag?.diagnosis && (
        <div className="mt-4 rounded border border-amber-900/60 bg-amber-950/20 p-3 text-left">
          <div className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
            Diagnosis
          </div>
          <div className="mt-1 text-[11px] text-atlas-text">
            {diag.diagnosis.mostLikelyIssue}
          </div>
          {diag?.newsApi && (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-atlas-muted">
              <dt>env var present</dt>
              <dd className="text-right">
                {diag.newsApi.keyConfigured ? "yes" : "NO"}
              </dd>
              <dt>key preview</dt>
              <dd className="text-right">
                {diag.newsApi.keyPreview ?? "—"}
              </dd>
              <dt>NewsAPI http</dt>
              <dd className="text-right">
                {diag.directProbe?.http ?? "—"}
              </dd>
              <dt>NewsAPI status</dt>
              <dd className="text-right">
                {diag.directProbe?.status ?? "—"}
              </dd>
            </dl>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-atlas-muted">
        Try the All tab — it surfaces the broadest mix of stocks,
        crypto, investments and real-estate coverage from around the
        world.
      </p>
      <p className="mt-2 text-[10px] text-atlas-muted">
        NewsAPI.org free tier: 100 req/day. Cache age: 1 hour.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await fetch("/api/news/retry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category: "all" }),
                cache: "no-store",
              });
              await Promise.all([loadAll(), refreshDiag()]);
            } finally {
              setRetrying(false);
            }
          }}
          className="rounded border border-atlas-accent bg-atlas-accent/10 px-4 py-2 text-xs font-medium uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Retry now (busts 1-hour cache)"}
        </button>

        <button
          type="button"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await refreshDiag();
            } finally {
              setRetrying(false);
            }
          }}
          className="rounded border border-atlas-border bg-atlas-surface px-4 py-2 text-xs font-medium uppercase tracking-wider text-atlas-muted transition hover:text-atlas-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          Refresh diagnosis
        </button>

        <a
          href="/api/news/diag"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-atlas-border bg-atlas-surface px-4 py-2 text-xs font-medium uppercase tracking-wider text-atlas-muted transition hover:text-atlas-text"
        >
          Open diag JSON ↗
        </a>
      </div>
    </div>
  );
}
