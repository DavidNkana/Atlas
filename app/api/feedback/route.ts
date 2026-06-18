import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/feedback
 *
 * Day 10. Records a user's rating of a result. Used by the
 * thumbs-up / thumbs-down widget on the result page. The body:
 *
 *   { questionId: string, rating: -1 | 1, note?: string }
 *
 * - questionId: the cuid of the Question row
 * - rating: -1 (thumbs down) or 1 (thumbs up)
 * - note: optional free-form comment up to 500 chars
 *
 * Auth: required. The user can only rate their OWN questions.
 * We scope the update with `userId` to prevent a malicious user
 * from rating someone else's result.
 *
 * Response:
 *   { ok: true, questionId, rating, ratedAt } on success
 *   { error: "..." } with appropriate status on failure
 *
 * Idempotent: if the user clicks thumbs-up twice, we just record
 * the latest rating. The earlier rating is overwritten. Note is
 * overwritten on every submit (no appending).
 */

export const dynamic = "force-dynamic";

const NOTE_MAX = 500;

function isValidRating(n: unknown): n is -1 | 1 {
  return n === -1 || n === 1;
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const { userId } = getAuth(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // 2. Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const questionId = typeof body?.questionId === "string" ? body.questionId : "";
  const rating = body?.rating;
  const noteRaw = typeof body?.note === "string" ? body.note.trim() : null;
  const note = noteRaw ? noteRaw.slice(0, NOTE_MAX) : null;

  if (!questionId) {
    return NextResponse.json(
      { error: "questionId required" },
      { status: 400 }
    );
  }
  if (!isValidRating(rating)) {
    return NextResponse.json(
      { error: "rating must be -1 or 1" },
      { status: 400 }
    );
  }

  // 3. Update the question, scoped to this user. Using
  // updateMany (not update) gives us a count we can check — if
  // the userId doesn't match the row's userId, count is 0 and
  // we return 404 (don't reveal that the row exists for someone
  // else).
  try {
    const result = await prisma.question.updateMany({
      where: { id: questionId, userId },
      data: { rating, ratingNote: note, ratedAt: new Date() },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      questionId,
      rating,
      ratedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[feedback] update failed: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/feedback?questionId=...
 *
 * Returns the current rating for a question (used by the result
 * page to pre-fill the thumbs-up/down widget when the user
 * reloads the page).
 *
 * Auth: required. Scoped to the current user — same protection
 * as POST.
 */
export async function GET(req: NextRequest) {
  const { userId } = getAuth(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const questionId = url.searchParams.get("questionId") ?? "";
  if (!questionId) {
    return NextResponse.json(
      { error: "questionId query param required" },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.question.findFirst({
      where: { id: questionId, userId },
      select: { rating: true, ratingNote: true, ratedAt: true },
    });
    if (!row) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      questionId,
      rating: row.rating,
      note: row.ratingNote,
      ratedAt: row.ratedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
