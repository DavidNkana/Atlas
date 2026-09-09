import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/history — last 20 questions for the signed-in user.
 *
 * Used by the home page sidebar to render the History list. Distinct
 * from /dashboard (which is a full page) and /api/ask (which creates
 * a question). Read-only.
 *
 * If the user is not signed in, returns { items: [] } so the sidebar
 * just shows an empty state without redirecting.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ items: [] });
  }

  try {
    const rows = await prisma.question.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        questionText: true,
        vertical: true,
        createdAt: true,
        responseJson: true,
      },
    });
    return NextResponse.json({
      items: rows.map((r) => {
        const response = r.responseJson as {
          answer?: unknown;
          ranked_sites?: Array<{ name?: unknown; rationale?: unknown }>;
        } | null;
        const answer = typeof response?.answer === "string" ? response.answer : "";
        const topSite = response?.ranked_sites?.[0];
        const rankedSummary = [topSite?.name, topSite?.rationale]
          .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
          .join(": ");
        const summary = answer || rankedSummary;
        return {
          id: r.id,
          questionText: r.questionText,
          vertical: r.vertical,
          createdAt: r.createdAt.toISOString(),
          summary: summary.trim().slice(0, 180),
        };
      }),
    });
  } catch (e) {
    // If Prisma is down or the table is missing, return empty rather
    // than 500-ing the sidebar.
    return NextResponse.json({ items: [], error: String(e) });
  }
}
