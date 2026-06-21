import { NextResponse } from "next/server";
import {
  fetchTopCoins,
  getAfricanExchanges,
  getCryptoFetchStatus,
  bustCryptoCache,
} from "@/lib/connectors/crypto";

/**
 * Day 26 — Crypto connector diagnostic.
 *
 * Pattern matches /api/news/diag: returns the truth about the
 * CoinGecko call + cache state so David can verify health
 * without terminal curl.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const hasKey = !!process.env.COINGECKO_API_KEY;

  let probeResult: {
    http?: number;
    status?: string;
    errorSnippet?: string;
    coinCount?: number;
  } = {};

  try {
    const coins = await fetchTopCoins({ limit: 5, bypassCache: true });
    probeResult = {
      http: 200,
      status: coins.length > 0 ? "ok" : "empty",
      coinCount: coins.length,
    };
  } catch (err) {
    probeResult = {
      errorSnippet: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }

  return NextResponse.json({
    ok: probeResult.coinCount !== undefined && probeResult.coinCount > 0,
    version: "crypto-v1",
    coinGecko: {
      keyConfigured: hasKey,
      tier: hasKey ? "Pro (API key set)" : "Free (no key, rate-limited)",
      base: hasKey ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3",
      rateLimitFree: "~10-30 req/min",
      cacheTtlMs: 5 * 60 * 1000,
    },
    probe: probeResult,
    lastFetch: getCryptoFetchStatus(),
    africanExchangesCount: getAfricanExchanges().length,
    fixInstructions: hasKey
      ? null
      : "Free tier works without a key but is rate-limited. Sign up at https://www.coingecko.com/en/api for a Pro key if you want higher limits. Add COINGECKO_API_KEY to all 3 Vercel envs.",
    tips: [
      "CoinGecko free tier: ~10-30 req/min. The connector caches results for 5 minutes, so a single page load uses 1 quota slot.",
      "If coinCount is 0, check: (1) COINGECKO_API_KEY if Pro tier expected, (2) free tier rate limit, (3) cache hasn't cached an empty result from a previous failed fetch.",
      "Cache is per-process. Deploys bust the cache. To force a refresh on demand, hit /api/crypto/retry.",
    ],
  });
}

export async function POST() {
  bustCryptoCache();
  const coins = await fetchTopCoins({ limit: 50, bypassCache: true });
  return NextResponse.json({
    ok: true,
    version: "crypto-v1",
    coinCount: coins.length,
  });
}
