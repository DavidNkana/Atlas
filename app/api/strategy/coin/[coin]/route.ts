import { NextRequest, NextResponse } from "next/server";
import { buildStrategyFeed, isSupportedCoin } from "@/lib/strategy/aggregator";

/**
 * LCP-52 — Per-coin strategy signal.
 *
 * Lighter wrapper around /api/strategy/feed that takes the coin from
 * the URL path. Used by the per-coin slide-out panel on /crypto and
 * the future /strategy page.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ coin: string }> },
) {
  const { coin } = await params;
  const shouldBust = new URL(req.url).searchParams.get("bust") === "1";

  if (!isSupportedCoin(coin)) {
    return NextResponse.json(
      {
        ok: false,
        version: "strategy-v1",
        error: `Unsupported coin: ${coin}`,
      },
      { status: 404 },
    );
  }

  try {
    const feed = await buildStrategyFeed(coin, { bypassCache: shouldBust });
    return NextResponse.json(feed);
  } catch (err) {
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
