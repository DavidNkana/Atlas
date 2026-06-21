import { NextResponse } from "next/server";
import {
  fetchTopCoins,
  getAfricanExchanges,
  getCryptoFetchStatus,
} from "@/lib/connectors/crypto";

/**
 * Day 26 — Client-facing crypto feed endpoint.
 *
 * Pattern matches /api/news/feed: client bundle cannot read env
 * vars, so this server route calls CoinGecko server-side where
 * process.env.COINGECKO_API_KEY is real, then returns JSON.
 *
 * Cache: 5min in-memory on the connector. This route is
 * force-dynamic so it always reads the current cache state.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const coins = await fetchTopCoins({ limit: 50 });
    const exchanges = getAfricanExchanges();

    // Top movers — split into gainers and losers (top 5 each)
    const sortedByGain = [...coins].sort(
      (a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h,
    );
    const gainers = sortedByGain.slice(0, 5);
    const losers = sortedByGain.slice(-5).reverse();

    // African-relevant coins — anything where the name or symbol
    // matches African projects or is widely traded on African
    // exchanges. For now we surface the static African exchange
    // list; later we can cross-reference CoinGecko categories.
    const africanCoinSymbols = new Set([
      "civic", "celo", "axl", "savax", "paxg",
    ]);
    const africanCoins = coins.filter((c) =>
      africanCoinSymbols.has(c.symbol),
    );

    return NextResponse.json({
      ok: coins.length > 0,
      version: "crypto-v1",
      counts: {
        coins: coins.length,
        gainers: gainers.length,
        losers: losers.length,
        africanCoins: africanCoins.length,
        exchanges: exchanges.length,
      },
      coins,
      gainers,
      losers,
      africanCoins,
      exchanges,
      lastFetch: getCryptoFetchStatus(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        version: "crypto-v1",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
