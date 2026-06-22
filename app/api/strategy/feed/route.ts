import { NextRequest, NextResponse } from "next/server";
import { buildStrategyFeed, bustStrategyCache, listSupportedCoins } from "@/lib/strategy/aggregator";

/**
 * LCP-52 — Atlas Strategy aggregator endpoint.
 *
 * Returns the social-signal view for a single coin across all four
 * configured sources. Client bundles cannot read env vars, so this
 * server route is the only place the four connectors are called
 * from. The /strategy page UI consumes this shape.
 *
 * Query params:
 *   - coin (required): one of the supported CoinGecko IDs (bitcoin,
 *     ethereum, solana, ...). ?list=1 returns the supported list.
 *   - bust=1: force a fresh fetch and bypass the 10-min cache.
 *
 * Cache: 10 minutes. Empty-result guard is in the aggregator.
 * Pattern matches /api/crypto/feed and /api/news/feed.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const coin = url.searchParams.get("coin");
  const shouldBust = url.searchParams.get("bust") === "1";
  const listOnly = url.searchParams.get("list") === "1";

  if (listOnly || !coin) {
    return NextResponse.json({
      ok: true,
      version: "strategy-v1",
      supportedCoins: listSupportedCoins(),
      usage: "GET /api/strategy/feed?coin=bitcoin&bust=1",
    });
  }

  try {
    if (shouldBust) bustStrategyCache();
    const feed = await buildStrategyFeed(coin, { bypassCache: shouldBust });
    return NextResponse.json(feed);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Unsupported coin")) {
      return NextResponse.json(
        {
          ok: false,
          version: "strategy-v1",
          error: err.message,
          supportedCoins: listSupportedCoins(),
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        version: "strategy-v1",
        coin,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
