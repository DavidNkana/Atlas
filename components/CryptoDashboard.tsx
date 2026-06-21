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

type Tab = "movers" | "african" | "all";

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

export function CryptoDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("movers");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeed = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/crypto/feed", { cache: "no-store" });
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
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/crypto/diag", { method: "POST", cache: "no-store" });
      await loadFeed();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadFeed();
  }, []);

  const hero = feed?.coins?.[0];
  const displayedCoins = (() => {
    if (!feed) return [];
    if (activeTab === "movers") return [...feed.gainers, ...feed.losers];
    if (activeTab === "african") return feed.africanCoins;
    return feed.coins;
  })();

  return (
    <section className="mx-auto max-w-5xl">
      {/* Top bar — title (left) + Back button (right) */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-atlas-text">
            Crypto markets
          </h1>
          <p className="mt-1 text-xs text-atlas-muted">
            Real-time prices and momentum for the top 50 cryptocurrencies,
            plus African on-ramp exchanges. Updated every 5 minutes.
          </p>
        </div>
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
                  : "All top 50"}
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
            onClick={refresh}
            className="mt-4 rounded border border-atlas-accent bg-atlas-accent/10 px-4 py-2 text-xs font-medium uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh (busts 5-min cache)"}
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
      <div className="text-right">
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
