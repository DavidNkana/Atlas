/**
 * Day 26 — Crypto connector.
 *
 * Pulls top N coins by market cap from CoinGecko public API.
 * Free tier works without a key (rate-limited to ~10-30 req/min,
 * which is fine for a 5min cache). Pro tier (COINGECKO_API_KEY)
 * raises the limit and gives priority routing.
 *
 * Returns the price/market-cap/momentum data investors want when
 * scanning the market. African exchanges (Yellow Card, Luno, VALR,
 * Quidax, Bitnob) are surfaced via the AFRICAN_EXCHANGES static
 * config so investors can route to local on-ramps directly.
 *
 * Cache: 5 min in-memory. Free tier rate limit is comfortable for
 * this — a single page load hits the route once and gets 5min of
 * data. If a free-tier user reloads fast, they hit cache. No empty
 * cache poisoning: empty results are NEVER cached (lesson learned
 * from the news connector).
 */

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface CryptoCoin {
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

export interface AfricanExchange {
  id: string;
  name: string;
  countries: string[];
  url: string;
  pairs: string;
  blurb: string;
}

// In-memory cache. Empty results are NEVER cached (lesson learned).
const cache = new Map<string, { data: CryptoCoin[]; expiresAt: number }>();
let lastFetchStatus: {
  status: "ok" | "no-key" | "http-error" | "bad-shape" | "no-cache-hit";
  http?: number;
  errorSnippet?: string;
  coinCount?: number;
  lastFetchedAt?: string;
} = { status: "no-cache-hit" };

export function getCryptoFetchStatus() {
  return { ...lastFetchStatus };
}

/**
 * Static config for African-relevant crypto exchanges. This is NOT
 * fetched live — these are durable venues investors should know
 * about for on-ramp + custody. Update the list as the market
 * consolidates.
 */
const AFRICAN_EXCHANGES: AfricanExchange[] = [
  {
    id: "luno",
    name: "Luno",
    countries: ["ZA", "NG", "KE", "UG", "ZM", "GH"],
    url: "https://www.luno.com",
    pairs: "BTC/NGN, BTC/ZAR, ETH/ZAR, XRP/ZAR",
    blurb: "Largest regulated exchange in South Africa + Nigeria. FCA-registered UK entity.",
  },
  {
    id: "valr",
    name: "VALR",
    countries: ["ZA", "NA", "BW"],
    url: "https://www.valr.com",
    pairs: "BTC/ZAR, ETH/ZAR, SOL/ZAR, 70+ pairs",
    blurb: "South Africa-based exchange with strong ZAR on-ramp and FSCA-registered entity.",
  },
  {
    id: "yellowcard",
    name: "Yellow Card",
    countries: ["NG", "KE", "GH", "UG", "TZ", "ZM", "RW", "+12 more"],
    url: "https://yellowcard.io",
    pairs: "BTC, ETH, USDT, USDC against local currencies",
    blurb: "Pan-African on-ramp. Buy/sell stablecoins + BTC in 20+ African countries via mobile money.",
  },
  {
    id: "quidax",
    name: "Quidax",
    countries: ["NG", "GH", "KE", "ZA"],
    url: "https://www.quidax.com",
    pairs: "BTC/NGN, ETH/NGN, USDT/NGN, XRP/NGN",
    blurb: "Nigerian exchange + API for builders. White-label liquidity for African fintechs.",
  },
  {
    id: "bitnob",
    name: "Bitnob",
    countries: ["NG", "KE", "GH", "UG"],
    url: "https://bitnob.com",
    pairs: "BTC, USDT against local currencies + cross-border remittance",
    blurb: "Bitcoin-first exchange focused on remittance + savings for the African diaspora.",
  },
  {
    id: "noah",
    name: "Noah",
    countries: ["ZA"],
    url: "https://www.noah.co.za",
    pairs: "BTC/ZAR, ETH/ZAR",
    blurb: "South African crypto on-ramp integrated with major banks.",
  },
];

export function getAfricanExchanges(): AfricanExchange[] {
  return AFRICAN_EXCHANGES;
}

function cacheKey(): string {
  return "crypto:top";
}

function getCached(): CryptoCoin[] | null {
  const entry = cache.get(cacheKey());
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey());
    return null;
  }
  return entry.data;
}

function setCached(coins: CryptoCoin[]): void {
  if (coins.length === 0) {
    // Guardrail: never cache empty results.
    return;
  }
  cache.set(cacheKey(), {
    data: coins,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Fetch top N coins by market cap. Defaults to 50 — gives the
 * investor dashboard enough to scan without overwhelming the UI.
 */
export async function fetchTopCoins(
  options: { limit?: number; bypassCache?: boolean } = {},
): Promise<CryptoCoin[]> {
  const limit = options.limit ?? 50;

  if (!options.bypassCache) {
    const cached = getCached();
    if (cached && cached.length > 0) return cached.slice(0, limit);
  }

  // CoinGecko public endpoint. Pro tier (with API key) gets a
  // dedicated base URL and higher rate limits.
  const baseUrl = COINGECKO_API_KEY
    ? "https://pro-api.coingecko.com/api/v3"
    : COINGECKO_BASE;
  const url = `${baseUrl}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${Math.min(
    limit,
    250,
  )}&page=1&sparkline=true&price_change_percentage=24h,7d`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "Atlas-Crypto/1.0 (+https://atlas-q2eh.vercel.app)",
  };
  if (COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = COINGECKO_API_KEY;
  }

  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      lastFetchStatus = {
        status: "http-error",
        http: res.status,
        errorSnippet: errText.slice(0, 200),
        lastFetchedAt: new Date().toISOString(),
      };
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      lastFetchStatus = {
        status: "bad-shape",
        errorSnippet: `expected array, got ${typeof data}`,
        lastFetchedAt: new Date().toISOString(),
      };
      return [];
    }

    const coins: CryptoCoin[] = data
      .filter((c: any) => c && c.id && c.symbol && c.name)
      .map((c: any) => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        image: c.image ?? "",
        current_price: typeof c.current_price === "number" ? c.current_price : 0,
        market_cap: typeof c.market_cap === "number" ? c.market_cap : 0,
        market_cap_rank: typeof c.market_cap_rank === "number" ? c.market_cap_rank : 0,
        total_volume: typeof c.total_volume === "number" ? c.total_volume : 0,
        price_change_percentage_24h:
          typeof c.price_change_percentage_24h === "number"
            ? c.price_change_percentage_24h
            : 0,
        price_change_percentage_7d_in_currency:
          typeof c.price_change_percentage_7d_in_currency === "number"
            ? c.price_change_percentage_7d_in_currency
            : undefined,
        sparkline_in_7d:
          c.sparkline_in_7d &&
          typeof c.sparkline_in_7d === "object" &&
          Array.isArray(c.sparkline_in_7d.price)
            ? { price: c.sparkline_in_7d.price }
            : undefined,
        last_updated: c.last_updated ?? new Date().toISOString(),
      }));

    lastFetchStatus = {
      status: "ok",
      http: 200,
      coinCount: coins.length,
      lastFetchedAt: new Date().toISOString(),
    };
    setCached(coins);
    return coins.slice(0, limit);
  } catch (err) {
    lastFetchStatus = {
      status: "http-error",
      errorSnippet: err instanceof Error ? err.message.slice(0, 200) : String(err),
      lastFetchedAt: new Date().toISOString(),
    };
    return [];
  }
}

export function bustCryptoCache(): void {
  cache.delete(cacheKey());
}

/**
 * Categorize a coin for UI rendering. Returns a heat indicator
 * based on 24h momentum. > +5% = "hot" (strong green badge),
 * < -5% = "cold" (red), otherwise "neutral".
 */
export function coinHeat(coin: CryptoCoin): "hot" | "cold" | "neutral" {
  if (coin.price_change_percentage_24h >= 5) return "hot";
  if (coin.price_change_percentage_24h <= -5) return "cold";
  return "neutral";
}
