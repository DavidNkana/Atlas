/**
 * Day 18 — /api/threads/[threadId] — Fetch a thread + all messages.
 *
 * GET returns the full ordered message list for the chat page to
 * render. POST is for adding a message to an existing thread (used
 * by the follow-up input at the bottom of the chat page).
 *
 * Auth: thread owner only. Returns 404 for other users' threads.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const { threadId } = await params;

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!thread || thread.userId !== userId) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: thread.id,
    title: thread.title,
    messageCount: thread.messageCount,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      question: m.question,
      intent: m.intent,
      sources: m.sources,
      spatialQuestionId: m.spatialQuestionId,
      spatialModel: m.spatialModel,
      createdAt: m.createdAt,
    })),
  });
}
