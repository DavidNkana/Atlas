import { ImageResponse } from "next/og";
import { ATLAS_HOOK, ATLAS_HOST } from "@/lib/copy";

/**
 * Atlas — dynamic Open Graph card.
 *
 *   GET /api/og?id=<questionId>  ->  1200x630 PNG
 *
 * Rendered by next/og (built-in, no extra dependency) and used by
 * the result page's generateMetadata() so a shared Atlas link
 * unfurls into a branded card on WhatsApp / X / LinkedIn / Slack
 * instead of a bare URL.
 *
 * Runtime note: this route is `nodejs`, NOT `edge`. The card needs
 * the Question row, and that means Prisma — which cannot run in the
 * Edge Runtime without Accelerate / a driver adapter (neither is
 * configured here). next/og works fine on the Node runtime in
 * Next 15, so this is the only combination that actually renders.
 *
 * Fonts: none are fetched. We rely on next/og's bundled default
 * font so the card can never fail on a font request.
 *
 * Failure policy: an OG scraper must never see a 500. Every failure
 * path (missing id, DB down, malformed responseJson) degrades to the
 * generic Atlas card.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BG = "#0a0a0f"; // atlas-bg
const INDIGO = "#6366f1"; // atlas-accent
const MUTED = "#8b8b9e";

const MAX_QUESTION_CHARS = 120;

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

export async function GET(req: Request) {
  let questionText = "";
  let topSiteName = "";
  let topScore: number | null = null;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      // Imported lazily and inside the try: if DATABASE_URL is
      // missing the PrismaClient constructor throws, and a
      // top-level import would take the whole route down with a
      // 500. Here it just degrades to the generic card.
      const { prisma } = await import("@/lib/db");
      const row = await prisma.question.findUnique({
        where: { id },
        select: { questionText: true, responseJson: true },
      });
      if (row) {
        questionText = truncate(row.questionText ?? "", MAX_QUESTION_CHARS);
        const body = (row.responseJson ?? {}) as {
          ranked_sites?: Array<{ name?: string; score?: number }>;
        };
        const top = Array.isArray(body.ranked_sites)
          ? body.ranked_sites[0]
          : undefined;
        if (top?.name) {
          topSiteName = truncate(String(top.name), 48);
          topScore = typeof top.score === "number" ? Math.round(top.score) : null;
        }
      }
    }
  } catch (err) {
    // Never throw at a scraper — fall through to the generic card.
    console.error(
      "[/api/og] falling back to generic card:",
      err instanceof Error ? err.message.slice(0, 160) : String(err),
    );
  }

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: BG,
            padding: "64px 72px",
          }}
        >
          {/* Wordmark + tagline */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: INDIGO,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Atlas
            </div>
            {/* ⚑ HOOK COPY — swap in lib/copy.ts */}
            <div style={{ fontSize: 28, color: MUTED, marginTop: 8 }}>
              {ATLAS_HOOK}
            </div>
          </div>

          {/* Question + top pick */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 56,
                fontWeight: 600,
                color: "#ffffff",
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
              }}
            >
              {questionText || "Site intelligence for South African builders"}
            </div>

            {topSiteName ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginTop: 28,
                  fontSize: 36,
                }}
              >
                <span style={{ color: MUTED }}>Top pick:&nbsp;</span>
                <span style={{ color: INDIGO, fontWeight: 600 }}>
                  {topSiteName}
                </span>
                {topScore !== null && (
                  <span style={{ color: MUTED }}>&nbsp;· score {topScore}</span>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", marginTop: 28, fontSize: 36, color: MUTED }}>
                Ranked, map-backed answers in 30 seconds
              </div>
            )}
          </div>

          {/* Footer: indigo divider + host */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: 3,
                backgroundColor: INDIGO,
                opacity: 0.7,
              }}
            />
            <div style={{ display: "flex", marginTop: 20, fontSize: 26, color: MUTED }}>
              {ATLAS_HOST}
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (err) {
    // Absolute last resort — a 1x1-ish text card beats a 500.
    console.error(
      "[/api/og] ImageResponse failed:",
      err instanceof Error ? err.message.slice(0, 160) : String(err),
    );
    return new Response("", { status: 204 });
  }
}
