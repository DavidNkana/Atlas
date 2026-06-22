"use client";

/**
 * Day 26 — Crypto dashboard.
 *
 * Three tabs:
 *   - Top Movers: top 5 gainers + top 5 losers by 24h change
 *   - African Markets: African coins + African exchanges (Luno,
 *     VALR, Yellow Card, Quidax, Bitnob, Noah)
 *   - All: full top 50 by market cap, sorted by market cap desc
 *
 * Each card: rank/name/symbol on left, price + 24h change + market
 * cap on right. Heat badge ("Hot" / "Cold") on cards with |24h| > 5%.
 *
 * Hero card = top coin by market cap (usually BTC or ETH).
 * Refresh button calls /api/crypto/retry to bust 5-min cache.
 *
 * Data flows via /api/crypto/feed (server route) — client bundle
 * can't read env, so the connector is server-only.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  sparkline_in_7d?: { price: number[] };
  last_updated: string;
}

interface AfricanExchange {
  id: string;
  name: string;
  countries: string[];
  url: string;
  pairs: string;
  blurb: string;
}

interface FeedResponse {
  ok: boolean;
  version: string;
  counts: {
    coins: number;
    gainers: number;
    losers: number;
    africanCoins: number;
    exchanges: number;
  };
  coins: CryptoCoin[];
  gainers: CryptoCoin[];
  losers: CryptoCoin[];
  africanCoins: CryptoCoin[];
  exchanges: AfricanExchange[];
  lastFetch: {
    status: string;
    http?: number;
    errorSnippet?: string;
    coinCount?: number;
    lastFetchedAt?: string;
  };
}

type Tab = "movers" | "african" | "all" | "trending" | "algorithm";

const TABS: { id: Tab; label: string; description: string }[] = [
  {
    id: "movers",
    label: "Top Movers",
    description: "Biggest 24-hour gainers and losers across the top 50 coins.",
  },
  {
    id: "african",
    label: "African Markets",
    description: "African-relevant coins + on-ramp exchanges for African investors.",
  },
  {
    id: "all",
    label: "All",
    description: "Top 50 cryptocurrencies by market capitalization, ranked.",
  },
  {
    id: "trending",
    label: "Trending",
    description:
      "What people are actually saying about each coin right now. Reddit, YouTube, CryptoPanic, GitHub. Social signal, not financial advice.",
  },
  {
    id: "algorithm",
    label: "Atlas Algorithm",
    description:
      "Sum the digits. If odd, keep the item. If even, throw it away. Top 50 by mention count. The founder's boss's rule, applied at Atlas.",
  },
];

const HEAT_BADGE: Record<"hot" | "cold" | "neutral", string> = {
  hot: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cold: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  neutral: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function coinHeat(coin: CryptoCoin): "hot" | "cold" | "neutral" {
  if (coin.price_change_percentage_24h >= 5) return "hot";
  if (coin.price_change_percentage_24h <= -5) return "cold";
  return "neutral";
}

function formatPrice(price: number): string {
  if (price >= 1) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  return `$${price.toFixed(6)}`;
}

function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
  return `$${cap.toLocaleString("en-US")}`;
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hr ago`;
}

/**
 * LCP-46 — Render a sparkline of an array of prices as an
 * inline SVG. No external library; we just normalize the
 * values to a viewBox and draw a polyline with a soft fill.
 */
function Sparkline({
  prices,
  width = 96,
  height = 32,
  strokeWidth = 1.5,
}: {
  prices: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  if (!prices || prices.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={"0 0 " + width + " " + height}
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={1}
          className="text-atlas-border"
        />
      </svg>
    );
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = width / (prices.length - 1);
  const padY = 2;
  const usableH = height - padY * 2;
  const points = prices
    .map((p, i) => {
      const x = i * stepX;
      const norm = (p - min) / range;
      const y = padY + (1 - norm) * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const isUp = prices[prices.length - 1] >= prices[0];
  const isDown = !isUp && prices[prices.length - 1] < prices[0];
  const stroke = isUp
    ? "rgb(52 211 153)"
    : isDown
      ? "rgb(251 113 133)"
      : "rgb(161 161 170)";
  const fill = isUp
    ? "rgb(52 211 153 / 0.12)"
    : isDown
      ? "rgb(251 113 133 / 0.12)"
      : "rgb(161 161 170 / 0.12)";

  const fillPoints = `${points} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={"0 0 " + width + " " + height}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="overflow-visible"
    >
      <polygon points={fillPoints} fill={fill} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function HeroChart({ prices }: { prices: number[] }) {
  if (!prices || prices.length < 2) {
    return (
      <div className="mt-4 flex h-24 items-center justify-center rounded border border-atlas-border/30 bg-atlas-bg/30 font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
        7-day chart unavailable
      </div>
    );
  }
  return (
    <div className="mt-4">
      <Sparkline prices={prices} width={520} height={120} strokeWidth={2} />
    </div>
  );
}

export function CryptoDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("movers");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const loadFeed = async (opts: { bust?: boolean } = {}) => {
    if (opts.bust) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = opts.bust
        ? "/api/crypto/feed?bust=1"
        : "/api/crypto/feed";
      const r = await fetch(url, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? `Feed endpoint returned ${r.status}`);
        return;
      }
      setFeed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // LCP-46 — auto-refresh every 30s (matches server cache TTL).
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadFeed({ bust: true });
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render every 5s so the "X seconds ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hero = feed?.coins?.[0];

  // LCP-46 — show how stale the data is (relative + absolute UTC).
  // The relative label is human-friendly ("12s ago") for at-a-glance
  // trust; the absolute UTC label is precise — you can verify
  // against an external clock that the snapshot is what we say it is.
  const lastFetchedAt = (feed as { lastFetch?: { lastFetchedAt?: string } } | null)?.lastFetch?.lastFetchedAt;
  const ageLabel = (() => {
    if (!lastFetchedAt) return null;
    const ageMs = now - new Date(lastFetchedAt).getTime();
    if (ageMs < 0) return "just now";
    const sec = Math.floor(ageMs / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min} min ago`;
  })();
  const utcLabel = lastFetchedAt
    ? new Date(lastFetchedAt).toISOString().slice(11, 19) + " UTC"
    : null;
  const displayedCoins = (() => {
    if (!feed) return [];
    if (activeTab === "movers") return [...feed.gainers, ...feed.losers];
    if (activeTab === "african") return feed.africanCoins;
    return feed.coins;
  })();

  return (
    <section className="mx-auto max-w-5xl">
      {/* Top bar — title (left) + Refresh + Back (right) */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-atlas-text">
            Crypto markets
          </h1>
          <p className="mt-1 text-xs text-atlas-muted">
            Real-time prices, momentum, and 7-day trends for the top 50
            cryptocurrencies, plus African on-ramp exchanges.
          </p>
          {/* LCP-47/48/49 — own header row, bolder and bigger so
              the trust signal is the second thing your eye lands
              on after the title. text-sm (was 10px) semibold, atlas
              text color (was muted), dot 2.5x2.5 (was 1.5). */}
          {(ageLabel || utcLabel) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-semibold tracking-wide text-atlas-text">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  refreshing
                    ? "animate-pulse bg-amber-400"
                    : ageLabel === "just now"
                      ? "bg-emerald-400"
                      : "bg-atlas-muted/60"
                }`}
                aria-hidden="true"
              />
              {ageLabel && <span>Updated {ageLabel}</span>}
              {utcLabel && (
                <span className="text-atlas-muted">· {utcLabel}</span>
              )}
              {refreshing && <span className="text-amber-400">· refreshing…</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void loadFeed({ bust: true })}
            disabled={refreshing}
            aria-label="Refresh crypto data"
            className="flex items-center gap-1.5 rounded border border-atlas-accent bg-atlas-accent/10 px-3 py-2 text-xs font-medium uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshing ? "animate-spin" : ""}
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
              } else {
                router.push("/");
              }
            }}
            aria-label="Back to Atlas"
            className="group flex items-center gap-2 rounded border border-atlas-border bg-atlas-surface px-3 py-2 text-xs font-medium uppercase tracking-wider text-atlas-muted transition hover:border-atlas-accent hover:text-atlas-text"
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
      </div>

      {/* Category tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-atlas-border/40">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "border-atlas-accent text-atlas-text"
                : "border-transparent text-atlas-muted hover:text-atlas-text"
            }`}
          >
            {tab.label}
            {feed?.counts && tab.id === "movers" && (
              <span className="ml-2 rounded-full bg-atlas-surface px-2 py-0.5 font-mono text-[9px] text-atlas-muted">
                {feed.counts.gainers + feed.counts.losers}
              </span>
            )}
            {feed?.counts && tab.id === "african" && (
              <span className="ml-2 rounded-full bg-atlas-surface px-2 py-0.5 font-mono text-[9px] text-atlas-muted">
                {feed.counts.africanCoins + feed.counts.exchanges}
              </span>
            )}
            {feed?.counts && tab.id === "all" && (
              <span className="ml-2 rounded-full bg-atlas-surface px-2 py-0.5 font-mono text-[9px] text-atlas-muted">
                {feed.counts.coins}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mb-6 text-[11px] text-atlas-muted">
        {TABS.find((t) => t.id === activeTab)?.description}
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-amber-900 bg-atlas-surface px-4 py-3 text-xs text-amber-400"
        >
          {error}. Check that the crypto connector is healthy at{" "}
          <a href="/api/crypto/diag" className="underline">
            /api/crypto/diag
          </a>
          .
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 gap-3">
          <div className="h-64 animate-pulse rounded border border-atlas-border/40 bg-atlas-surface/40" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded border border-atlas-border/40 bg-atlas-surface/40"
              />
            ))}
          </div>
        </div>
      )}

      {/* HERO + Grid */}
      {!loading && !error && feed && hero && (
        <div className="space-y-6">
          {activeTab === "movers" && (
            <HeroCard coin={hero} subtitle="#1 by market cap — top mover benchmark" />
          )}
          {activeTab === "african" && feed.africanCoins.length > 0 && (
            <HeroCard
              coin={feed.africanCoins[0]}
              subtitle="Top African-relevant coin"
            />
          )}
          {activeTab === "all" && (
            <HeroCard coin={hero} subtitle="Largest by market capitalization" />
          )}

          <div className="flex items-center gap-3 pt-2">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-atlas-muted">
              {activeTab === "movers"
                ? "Gainers & losers"
                : activeTab === "african"
                  ? "African on-ramp exchanges"
                  : activeTab === "all"
                    ? "All top 50"
                    : ""}
            </h2>
            <div className="h-px flex-1 bg-atlas-border/40" />
          </div>

          {/* Movers tab: split into gainers + losers */}
          {activeTab === "movers" && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Gainers
                </h3>
                <ul className="grid grid-cols-1 gap-2">
                  {feed.gainers.map((c) => (
                    <CoinRow key={c.id} coin={c} />
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                  Losers
                </h3>
                <ul className="grid grid-cols-1 gap-2">
                  {feed.losers.map((c) => (
                    <CoinRow key={c.id} coin={c} />
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* African tab: coins + exchanges */}
          {activeTab === "african" && (
            <div className="space-y-6">
              {feed.africanCoins.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-atlas-text">
                    African-relevant coins
                  </h3>
                  <ul className="grid grid-cols-1 gap-2">
                    {feed.africanCoins.map((c) => (
                      <CoinRow key={c.id} coin={c} />
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-atlas-text">
                  On-ramp exchanges (African-friendly)
                </h3>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {feed.exchanges.map((ex) => (
                    <ExchangeCard key={ex.id} exchange={ex} />
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* All tab: full list */}
          {activeTab === "all" && (
            <ul className="grid grid-cols-1 gap-2">
              {displayedCoins.map((c) => (
                <CoinRow key={c.id} coin={c} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* LCP-54 — Trending tab content (independent of the crypto feed) */}
      {activeTab === "trending" && <TrendingPanel />}

      {/* LCP-55 — Atlas Algorithm tab content */}
      {activeTab === "algorithm" && <AlgorithmPanel />}

      {/* Empty state */}
      {!loading && !error && feed && feed.coins.length === 0 && (
        <div className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-8 text-center text-sm text-atlas-muted">
          <p>
            No coin data available right now. Check{" "}
            <a href="/api/crypto/diag" className="underline">
              /api/crypto/diag
            </a>{" "}
            for connector health.
          </p>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void loadFeed({ bust: true })}
            className="mt-4 rounded border border-atlas-accent bg-atlas-accent/10 px-4 py-2 text-xs font-medium uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

function HeroCard({
  coin,
  subtitle,
}: {
  coin: CryptoCoin;
  subtitle: string;
}) {
  const heat = coinHeat(coin);
  const pctColor =
    coin.price_change_percentage_24h >= 0
      ? "text-emerald-400"
      : "text-rose-400";
  return (
    <div className="rounded-lg border border-atlas-border/40 bg-atlas-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {coin.image && (
            <img
              src={coin.image}
              alt={coin.name}
              className="h-16 w-16 rounded-full bg-atlas-bg"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
                #{coin.market_cap_rank} · {subtitle}
              </span>
              {heat !== "neutral" && (
                <span
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                    HEAT_BADGE[heat]
                  }`}
                >
                  {heat === "hot" ? "Hot" : "Cold"}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-semibold text-atlas-text">
              {coin.name}{" "}
              <span className="font-mono text-sm uppercase text-atlas-muted">
                {coin.symbol}
              </span>
            </h2>
            <p className="mt-1 font-mono text-3xl text-atlas-text">
              {formatPrice(coin.current_price)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-semibold ${pctColor}`}>
            {formatPct(coin.price_change_percentage_24h)}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
            24h
          </div>
          <div className="mt-3 font-mono text-xs text-atlas-muted">
            MCap {formatMarketCap(coin.market_cap)}
          </div>
        </div>
      </div>
      {/* LCP-46 — 7-day price chart for the hero coin */}
      <HeroChart prices={coin.sparkline_in_7d?.price ?? []} />
    </div>
  );
}

function CoinRow({ coin }: { coin: CryptoCoin }) {
  const heat = coinHeat(coin);
  const pctColor =
    coin.price_change_percentage_24h >= 0
      ? "text-emerald-400"
      : "text-rose-400";
  return (
    <li className="flex items-center gap-3 rounded border border-atlas-border/40 bg-atlas-surface/40 p-3 transition hover:border-atlas-accent/50 hover:bg-atlas-surface">
      <span className="w-8 text-right font-mono text-[10px] text-atlas-muted">
        #{coin.market_cap_rank}
      </span>
      {coin.image && (
        <img
          src={coin.image}
          alt={coin.name}
          className="h-8 w-8 rounded-full bg-atlas-bg"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-atlas-text">
            {coin.name}
          </span>
          <span className="font-mono text-[10px] uppercase text-atlas-muted">
            {coin.symbol}
          </span>
          {heat !== "neutral" && (
            <span
              className={`rounded border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
                HEAT_BADGE[heat]
              }`}
            >
              {heat === "hot" ? "Hot" : "Cold"}
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-atlas-muted">
          MCap {formatMarketCap(coin.market_cap)}
        </div>
      </div>
      {/* LCP-46 — 7-day sparkline. hidden on small screens */}
      <div className="hidden shrink-0 sm:block">
        <Sparkline
          prices={coin.sparkline_in_7d?.price ?? []}
          width={88}
          height={28}
        />
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm text-atlas-text">
          {formatPrice(coin.current_price)}
        </div>
        <div className={`font-mono text-[11px] font-semibold ${pctColor}`}>
          {formatPct(coin.price_change_percentage_24h)}
        </div>
      </div>
    </li>
  );
}

function ExchangeCard({ exchange }: { exchange: AfricanExchange }) {
  return (
    <li className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-4 transition hover:border-atlas-accent/50 hover:bg-atlas-surface">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <a
          href={exchange.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-atlas-text hover:text-atlas-accent"
        >
          {exchange.name}
        </a>
        <span className="font-mono text-[9px] uppercase tracking-wider text-atlas-muted">
          {exchange.countries.join(", ")}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-atlas-muted">
        {exchange.blurb}
      </p>
      <div className="mt-2 font-mono text-[10px] text-atlas-muted">
        Pairs: {exchange.pairs}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* LCP-54 — Trending panel                                              */
/* ------------------------------------------------------------------ */

interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  mentionCount: number;
  lastMentionAt: string | null;
  momentum: number;
  sample: string[];
}

interface TrendingResult {
  ok: boolean;
  version: string;
  asOf: string;
  lists: {
    overall: TrendingCoin[];
    reddit: TrendingCoin[];
    youtube: TrendingCoin[];
    cryptopanic: TrendingCoin[];
    github: TrendingCoin[];
  };
  sources: Record<string, { ok: boolean; error?: string }>;
  methodology: {
    ranking: string;
    recencyWeighting: string;
    sentimentAlgorithm: string;
    notFinancialAdvice: boolean;
    windowMinutes: number | null;
  };
  cache: { ttlMs: number; ageMs: number; lastFetchedAt: string };
}

type TrendingSource = "overall" | "reddit" | "youtube" | "cryptopanic" | "github";

const TRENDING_TABS: { id: TrendingSource; label: string }[] = [
  { id: "overall", label: "Overall" },
  { id: "reddit", label: "Reddit" },
  { id: "youtube", label: "YouTube" },
  { id: "cryptopanic", label: "CryptoPanic" },
  { id: "github", label: "GitHub" },
];

/**
 * Time window options for Trending + Atlas Algorithm panels.
 * Values are minutes. UI label + dropdown value + URL param.
 * "All" sends no window param to the API (server returns full data).
 */
const TIME_WINDOWS: { label: string; minutes: number | null }[] = [
  { label: "10m", minutes: 10 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
  { label: "7d", minutes: 10080 },
];

const MAX_TRENDING_RESULTS = 100;

/** Build a strategy URL with window + limit params. */
function strategyUrl(
  path: string,
  opts: { windowMinutes: number | null; bust?: boolean },
): string {
  const params = new URLSearchParams();
  if (opts.windowMinutes !== null) params.set("window", String(opts.windowMinutes));
  params.set("limit", String(MAX_TRENDING_RESULTS));
  if (opts.bust) params.set("bust", "1");
  return `${path}?${params.toString()}`;
}

function TrendingPanel() {
  const [data, setData] = useState<TrendingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [activeList, setActiveList] = useState<TrendingSource>("overall");
  const [windowMinutes, setWindowMinutes] = useState<number | null>(1440); // default 24h

  const load = async (opts: { bust?: boolean } = {}) => {
    if (opts.bust) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = strategyUrl("/api/strategy/trending", { windowMinutes, bust: opts.bust });
      const r = await fetch(url, { cache: "no-store" });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error ?? `Trending returned ${r.status}`);
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMinutes]);

  // 30s auto-refresh, same cadence as the crypto feed.
  // Skip when tab is hidden so we don't burn rate limits.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMinutes]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  const lastFetchedAt = data?.cache.lastFetchedAt;
  const ageLabel = (() => {
    if (!lastFetchedAt) return null;
    const ageMs = now - new Date(lastFetchedAt).getTime();
    if (ageMs < 0) return "just now";
    const sec = Math.floor(ageMs / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min} min ago`;
  })();

  return (
    <div className="space-y-6">
      {/* Header row: status + disclaimer + refresh */}
      <div className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-atlas-text">
              What people are saying about each coin right now.
            </p>
            <p className="mt-1 text-[11px] text-atlas-muted">
              Reddit, YouTube, CryptoPanic, GitHub. Mention count + recency.{" "}
              {ageLabel && (
                <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-atlas-muted/80">
                  Updated {ageLabel}
                  {refreshing && " · refreshing…"}
                </span>
              )}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-amber-400/80">
              Social signal — not financial advice
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-atlas-muted">
              <span>Window</span>
              <select
                value={windowMinutes === null ? "all" : String(windowMinutes)}
                onChange={(e) => {
                  const v = e.target.value;
                  setWindowMinutes(v === "all" ? null : Number(v));
                }}
                className="rounded border border-atlas-border bg-atlas-surface px-2 py-1.5 text-xs font-medium text-atlas-text focus:border-atlas-accent focus:outline-none"
              >
                {TIME_WINDOWS.map((w) => (
                  <option key={w.label} value={w.minutes === null ? "all" : String(w.minutes)}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void load({ bust: true })}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded border border-atlas-accent bg-atlas-accent/10 px-3 py-2 text-xs font-medium uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={refreshing ? "animate-spin" : ""}
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
        {data && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-atlas-muted/60">
            {data.methodology.ranking} · {data.methodology.recencyWeighting} · {data.methodology.sentimentAlgorithm}
            {data.methodology.windowMinutes !== null && data.methodology.windowMinutes !== undefined
              ? ` · window ${data.methodology.windowMinutes}m`
              : ""}
          </p>
        )}
      </div>

      {/* Source health badges */}
      {data && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
          <span>Sources:</span>
          {(["reddit", "youtube", "cryptopanic", "github"] as const).map((src) => {
            const ok = data.sources[src]?.ok;
            return (
              <span
                key={src}
                className={`inline-flex items-center gap-1 ${
                  ok ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    ok ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                {src}
              </span>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded border border-atlas-border/40 bg-atlas-surface/40"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !data && (
        <div className="rounded border border-rose-900/40 bg-atlas-surface/40 p-6 text-center text-sm text-rose-400">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load({ bust: true })}
            className="mt-3 rounded border border-atlas-accent bg-atlas-accent/10 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20"
          >
            Retry
          </button>
        </div>
      )}

      {/* Sub-tabs (Overall / Reddit / YouTube / CryptoPanic / GitHub) */}
      {data && (
        <div className="flex gap-1 overflow-x-auto border-b border-atlas-border/40">
          {TRENDING_TABS.map((tab) => {
            const count = data.lists[tab.id]?.length ?? 0;
            const isActive = activeList === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveList(tab.id)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition ${
                  isActive
                    ? "border-atlas-accent text-atlas-text"
                    : "border-transparent text-atlas-muted hover:text-atlas-text"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 rounded-full bg-atlas-surface px-1.5 py-0.5 font-mono text-[9px] text-atlas-muted">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* The active list */}
      {data && data.lists[activeList] && data.lists[activeList].length > 0 && (
        <ul className="grid grid-cols-1 gap-2">
          {data.lists[activeList].map((coin, idx) => (
            <TrendingRow key={coin.id} coin={coin} rank={idx + 1} />
          ))}
        </ul>
      )}

      {/* Empty state for a specific list */}
      {data && data.lists[activeList] && data.lists[activeList].length === 0 && (
        <div className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-8 text-center text-sm text-atlas-muted">
          <p>No trending data for this source right now.</p>
          <p className="mt-1 text-[11px]">
            Check{" "}
            <a href="/api/strategy/diag" className="underline">
              /api/strategy/diag
            </a>{" "}
            for source health.
          </p>
        </div>
      )}
    </div>
  );
}

function TrendingRow({ coin, rank }: { coin: TrendingCoin; rank: number }) {
  const momentumColor =
    coin.momentum > 0.6
      ? "bg-emerald-400"
      : coin.momentum < 0.3
        ? "bg-rose-400"
        : "bg-atlas-muted/60";

  return (
    <li className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-3 transition hover:border-atlas-accent/50 hover:bg-atlas-surface">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-6 shrink-0 text-right font-mono text-[10px] text-atlas-muted">
          #{rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-atlas-text">
              {coin.name}
            </span>
            <span className="font-mono text-[10px] uppercase text-atlas-muted">
              {coin.symbol}
            </span>
          </div>
          {coin.sample && coin.sample.length > 0 && (
            <p className="mt-1 line-clamp-1 text-[11px] text-atlas-muted">
              {coin.sample[0]}
            </p>
          )}
        </div>
        {/* Momentum gauge */}
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-1.5 w-3 rounded-sm ${
                coin.momentum * 5 > i + 1 ? momentumColor : "bg-atlas-border/40"
              }`}
            />
          ))}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-semibold text-atlas-text">
            {coin.mentionCount}
          </div>
          <div className="font-mono text-[9px] uppercase text-atlas-muted">
            mentions
          </div>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* LCP-55 — Atlas Algorithm panel                                      */
/* ------------------------------------------------------------------ */

interface AlgorithmSample {
  source: "reddit" | "youtube" | "cryptopanic" | "github";
  coin: { id: string; name: string; symbol: string };
  number: number;
  sum: number;
  valueLabel: string;
  sample: string;
  at: string | null;
  url: string | null;
}

interface AlgorithmTrendingCoin {
  rank: number;
  id: string;
  name: string;
  symbol: string;
  qualifiedMentions: number;
  bySource: { reddit: number; youtube: number; cryptopanic: number; github: number };
  lastQualifiedAt: string | null;
  sample: AlgorithmSample[];
}

interface AlgorithmResult {
  ok: boolean;
  version: string;
  asOf: string;
  methodology: {
    rule: string;
    byline: string;
    perSource: {
      youtube: string;
      github: string;
      cryptopanic: string;
      reddit: string;
    };
    ranking: string;
    outputSize: number;
    notFinancialAdvice: boolean;
    windowMinutes: number | null;
  };
  filterStats: {
    youtube: { total: number; qualified: number; reason: string };
    github: { total: number; qualified: number; reason: string };
    cryptopanic: { total: number; qualified: number; reason: string };
    reddit: { total: number; qualified: number; reason: string };
  };
  trending: AlgorithmTrendingCoin[];
  cache: { ttlMs: number; ageMs: number; lastFetchedAt: string };
}

function AlgorithmPanel() {
  const [data, setData] = useState<AlgorithmResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [windowMinutes, setWindowMinutes] = useState<number | null>(1440); // default 24h

  const load = async (opts: { bust?: boolean } = {}) => {
    if (opts.bust) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = strategyUrl("/api/strategy/algorithm", { windowMinutes, bust: opts.bust });
      const r = await fetch(url, { cache: "no-store" });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error ?? `Algorithm returned ${r.status}`);
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMinutes]);

  // 30s auto-refresh, same cadence as the crypto feed.
  // Skip when tab is hidden so we don't burn rate limits.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMinutes]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  const lastFetchedAt = data?.cache.lastFetchedAt;
  const ageLabel = (() => {
    if (!lastFetchedAt) return null;
    const ageMs = now - new Date(lastFetchedAt).getTime();
    if (ageMs < 0) return "just now";
    const sec = Math.floor(ageMs / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min} min ago`;
  })();

  return (
    <div className="space-y-6">
      {/* Header card: the rule, plain language */}
      <div className="rounded border border-atlas-accent/40 bg-atlas-surface/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-atlas-text">
              The rule
            </h3>
            <p className="mt-1 text-sm text-atlas-text">
              Sum the digits. If the sum is odd, the item qualifies. If even, it doesn't.
            </p>
            <p className="mt-1 text-[11px] text-atlas-muted">
              Then rank coins by mention count in the qualified set. Top 100.{" "}
              {ageLabel && (
                <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-atlas-muted/80">
                  Updated {ageLabel}
                  {refreshing && " · refreshing…"}
                </span>
              )}
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-amber-400/80">
              {data?.methodology.byline ?? "Invented by the founder's boss, applied at Atlas as a social-trend filter. Not a financial signal."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-atlas-muted">
              <span>Window</span>
              <select
                value={windowMinutes === null ? "all" : String(windowMinutes)}
                onChange={(e) => {
                  const v = e.target.value;
                  setWindowMinutes(v === "all" ? null : Number(v));
                }}
                className="rounded border border-atlas-border bg-atlas-surface px-2 py-1.5 text-xs font-medium text-atlas-text focus:border-atlas-accent focus:outline-none"
              >
                {TIME_WINDOWS.map((w) => (
                  <option key={w.label} value={w.minutes === null ? "all" : String(w.minutes)}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void load({ bust: true })}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded border border-atlas-accent bg-atlas-accent/10 px-3 py-2 text-xs font-medium uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={refreshing ? "animate-spin" : ""}
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Per-source filter stats — the user can see how the rule behaved */}
      {data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {(["youtube", "github", "cryptopanic", "reddit"] as const).map((src) => {
            const stat = data.filterStats[src];
            const qualifiedPct =
              stat.total > 0 ? Math.round((stat.qualified / stat.total) * 100) : 0;
            const filterColor =
              qualifiedPct >= 40
                ? "text-emerald-400"
                : qualifiedPct >= 20
                  ? "text-amber-400"
                  : "text-rose-400";
            return (
              <div
                key={src}
                className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
                    {src}
                  </span>
                  <span className={`font-mono text-sm font-semibold ${filterColor}`}>
                    {stat.qualified}/{stat.total}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-atlas-muted/60">
                  qualified ({qualifiedPct}%)
                </p>
                {stat.reason && stat.reason !== "ok" && (
                  <p className="mt-1 text-[10px] leading-relaxed text-atlas-muted/80">
                    {stat.reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded border border-atlas-border/40 bg-atlas-surface/40"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div className="rounded border border-rose-900/40 bg-atlas-surface/40 p-6 text-center text-sm text-rose-400">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load({ bust: true })}
            className="mt-3 rounded border border-atlas-accent bg-atlas-accent/10 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20"
          >
            Retry
          </button>
        </div>
      )}

      {/* The top-50 */}
      {data && data.trending.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-atlas-muted">
              Top {data.trending.length} (most mentions in the qualified set)
            </h2>
            <div className="h-px flex-1 bg-atlas-border/40" />
          </div>
          <ul className="grid grid-cols-1 gap-2">
            {data.trending.map((coin) => (
              <AlgorithmRow key={coin.id} coin={coin} />
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {data && data.trending.length === 0 && (
        <div className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-8 text-center text-sm text-atlas-muted">
          <p>
            No coins qualified this round. Either the filters are rejecting everything,
            or no upstream sources returned data.
          </p>
          <p className="mt-2 text-[11px]">
            Check{" "}
            <a href="/api/strategy/diag" className="underline">
              /api/strategy/diag
            </a>{" "}
            for source health.
          </p>
        </div>
      )}
    </div>
  );
}

function AlgorithmRow({ coin }: { coin: AlgorithmTrendingCoin }) {
  const hasReddit = coin.bySource.reddit > 0;
  const hasYouTube = coin.bySource.youtube > 0;
  const hasCryptoPanic = coin.bySource.cryptopanic > 0;
  const hasGithub = coin.bySource.github > 0;
  const sourceCount =
    (hasReddit ? 1 : 0) +
    (hasYouTube ? 1 : 0) +
    (hasCryptoPanic ? 1 : 0) +
    (hasGithub ? 1 : 0);

  // Per-row expand/collapse state. Default open so the user sees all
  // qualified mentions on first render (matches the "show all qualified
  // ones" request). User can collapse individual rows if the list is
  // long.
  const [expanded, setExpanded] = useState<boolean>(true);

  const hasMoreThanOne = coin.sample.length > 1;
  const SOURCE_LABEL: Record<AlgorithmSample["source"], string> = {
    reddit: "Reddit",
    youtube: "YouTube",
    cryptopanic: "CryptoPanic",
    github: "GitHub",
  };

  return (
    <li className="rounded border border-atlas-border/40 bg-atlas-surface/40 p-3 transition hover:border-atlas-accent/50 hover:bg-atlas-surface">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-8 shrink-0 text-right font-mono text-[10px] text-atlas-muted">
          #{coin.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-atlas-text">
              {coin.name}
            </span>
            <span className="font-mono text-[10px] uppercase text-atlas-muted">
              {coin.symbol}
            </span>
            <span className="font-mono text-[9px] uppercase text-atlas-muted/60">
              · {sourceCount} source{sourceCount === 1 ? "" : "s"}
            </span>
          </div>
          {/* Top-line summary: first sample if present, plus a toggle
              when there are more. */}
          {coin.sample.length > 0 && (
            <p className="mt-1 line-clamp-1 text-[11px] text-atlas-muted">
              <span className="font-mono text-[10px] uppercase text-atlas-muted/80">
                [{SOURCE_LABEL[coin.sample[0].source]}]
              </span>{" "}
              {coin.sample[0].valueLabel}: {coin.sample[0].sample}
              {hasMoreThanOne && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="ml-2 font-mono text-[10px] uppercase text-atlas-accent hover:underline"
                >
                  {expanded
                    ? `Hide ${coin.sample.length - 1} more`
                    : `Show all ${coin.sample.length} qualified`}
                </button>
              )}
            </p>
          )}
        </div>
        {/* Per-source badges */}
        <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {hasReddit && (
            <span className="rounded bg-atlas-surface px-1.5 py-0.5 font-mono text-[9px] text-atlas-muted">
              R{coin.bySource.reddit}
            </span>
          )}
          {hasYouTube && (
            <span className="rounded bg-atlas-surface px-1.5 py-0.5 font-mono text-[9px] text-atlas-muted">
              Y{coin.bySource.youtube}
            </span>
          )}
          {hasCryptoPanic && (
            <span className="rounded bg-atlas-surface px-1.5 py-0.5 font-mono text-[9px] text-atlas-muted">
              C{coin.bySource.cryptopanic}
            </span>
          )}
          {hasGithub && (
            <span className="rounded bg-atlas-surface px-1.5 py-0.5 font-mono text-[9px] text-atlas-muted">
              G{coin.bySource.github}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-base font-semibold text-atlas-text">
            {coin.qualifiedMentions}
          </div>
          <div className="font-mono text-[9px] uppercase text-atlas-muted">
            qualified
          </div>
        </div>
      </div>
      {/* Expanded list of ALL qualified mentions. */}
      {hasMoreThanOne && expanded && (
        <ul className="mt-3 space-y-1.5 border-t border-atlas-border/30 pt-3">
          {coin.sample.slice(1).map((m, i) => (
            <li
              key={`${m.source}-${m.at ?? "no-ts"}-${i}`}
              className="flex flex-wrap items-baseline gap-2 text-[11px] text-atlas-muted"
            >
              <span className="font-mono text-[10px] uppercase text-atlas-muted/80">
                [{SOURCE_LABEL[m.source]}]
              </span>
              {m.url ? (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-1 flex-1 text-atlas-text hover:text-atlas-accent hover:underline"
                >
                  {m.valueLabel}: {m.sample}
                </a>
              ) : (
                <span className="line-clamp-1 flex-1 text-atlas-text">
                  {m.valueLabel}: {m.sample}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
