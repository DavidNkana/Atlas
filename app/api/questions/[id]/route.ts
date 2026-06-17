import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/questions/:id
 *
 * Permanently deletes a Question row. The signed-in user must own
 * the question (we match on both `id` AND `userId` so users can
 * never delete someone else's question).
 *
 * Returns 200 on success, 404 if the question doesn't exist or
 * isn't owned by the caller, 401 if not signed in.
 *
 * v1: hard delete. Day 30+ we may want to add a soft-delete
 * (`deletedAt` column) so we can restore questions the user
 * accidentally deleted. For now, the confirm dialog in the
 * Sidebar warns the user that the delete is permanent.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  try {
    // deleteMany returns the count of rows deleted. If 0, the question
    // didn't exist OR wasn't owned by the caller. Either way, return
    // 404 — we don't leak the existence of other users' questions.
    const result = await prisma.question.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "not found or not owned by caller" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
