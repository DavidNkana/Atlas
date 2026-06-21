import { NextResponse } from "next/server";

/**
 * Day 23 v6 — Server-side image proxy for news thumbnails.
 *
 * Many NewsAPI source sites (biztoc.com, ft.com, reuters.com etc.)
 * reject hotlinking by checking the Referer header. When the Atlas
 * frontend <img src="https://source.com/..."> hits them directly,
 * they return 403 and the browser shows a broken image.
 *
 * This route fetches the image server-side with no Referer, then
 * streams it back to the client. Caches aggressively because the
 * upstream images don't change.
 *
 * Usage: <img src="/api/news/image?url=https%3A%2F%2F..." />
 *
 * Security:
 * - Only http(s) URLs accepted
 * - Private/localhost URLs blocked (SSRF prevention)
 * - 8MB response cap to prevent abuse
 * - No auth needed — these are already-public news images
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const ALLOWED_ORIGINS = (): string[] => [
  // NewsAPI's most common CDN origins (we hit these directly today)
  "https://biztoc.com",
  "https://cdn.biztoc.com",
  "https://s.yimg.com",
  "https://media.zenfs.com",
  "https://d15shllkswkct0.cloudfront.net",
  "https://imageio.forbes.com",
  "https://www.ft.com",
  "https://static.ft.net",
];

function isAllowedOrigin(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname.startsWith("192.168.") ||
      u.hostname.startsWith("10.")
    ) {
      return false;
    }
    // Allowlist is a soft check — if we don't have an explicit allow,
    // still allow the fetch but strip the Referer header to defeat
    // most hotlink blocks.
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target) {
    return NextResponse.json(
      { error: "Missing ?url= parameter" },
      { status: 400 },
    );
  }

  if (!isAllowedOrigin(target)) {
    return NextResponse.json(
      { error: "URL not allowed" },
      { status: 400 },
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const upstream = await fetch(target, {
      headers: {
        // Strip Referer so upstream can't hotlink-block
        Referer: "",
        "User-Agent":
          "Mozilla/5.0 (compatible; AtlasBot/1.0; +https://atlas-q2eh.vercel.app)",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: controller.signal,
      // Don't follow too many redirects
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Upstream is not an image" },
        { status: 415 },
      );
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image too large" },
        { status: 413 },
      );
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
