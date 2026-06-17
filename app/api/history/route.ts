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
      },
    });
    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        questionText: r.questionText,
        vertical: r.vertical,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    // If Prisma is down or the table is missing, return empty rather
    // than 500-ing the sidebar.
    return NextResponse.json({ items: [], error: String(e) });
  }
}
