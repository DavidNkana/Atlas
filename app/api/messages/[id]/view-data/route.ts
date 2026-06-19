/**
 * Day 18 — /api/messages/[id]/view-data — Run the spatial engine for
 * a chat message and persist the resulting questionId.
 *
 * The chat page calls this when the user clicks "View data" on an
 * assistant message + selects a model. We:
 *
 *   1. Reuse the assistant message's `question` field as input.
 *   2. Call /api/ask with the user-selected model.
 *   3. Persist the resulting questionId + model on the message row.
 *   4. Return the questionId so the client can navigate to
 *      /result/[questionId].
 *
 * Auth: message owner only.
 *
 * Body: { model: "gemini-search" | "gemini-flash" | "openrouter" | "curated-stub" }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { ALL_MODELS } from "@/lib/models/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_MODELS = new Set(ALL_MODELS.map((m) => m.info.id).filter((id) => id !== "tavily"));

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const { id: messageId } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const model = String(body?.model ?? "");
  if (!VALID_MODELS.has(model)) {
    return NextResponse.json(
      {
        error: `model must be one of: ${[...VALID_MODELS].join(", ")}. Tavily is the chat engine and not selectable for spatial view.`,
        validModels: [...VALID_MODELS],
      },
      { status: 400 },
    );
  }

  // Look up the message + thread for auth + question reuse.
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { thread: true },
  });
  if (!message || message.thread.userId !== userId) {
    return NextResponse.json({ error: "message not found" }, { status: 404 });
  }
  if (message.role !== "assistant") {
    return NextResponse.json(
      { error: "only assistant messages can be promoted to a spatial view" },
      { status: 400 },
    );
  }

  // Reuse the original question that produced this assistant message.
  const question =
    message.question?.trim() || message.content?.trim() || "";
  if (!question) {
    return NextResponse.json(
      { error: "no question available to send to the spatial engine" },
      { status: 400 },
    );
  }

  // Hit /api/ask with the user-selected model. Use the same code
  // path the home page uses, so the response is identical to a
  // fresh ask. We pass model via a custom header so the route picks
  // it up without changing the public /api/ask shape.
  const origin = req.nextUrl.origin;
  const askRes = await fetch(`${origin}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
    body: JSON.stringify({
      question,
      // The /api/ask route reads vertical from the body. We pick
      // a sensible default for the spatial view; the user can
      // re-pick a vertical on /result/[id] if they want.
      vertical: "mixed_use_land",
      // Force the model the user picked.
      modelOverride: model,
    }),
  }).catch((e) => {
    return null;
  });

  if (!askRes || !askRes.ok) {
    const text = askRes ? await askRes.text().catch(() => "") : "network error";
    return NextResponse.json(
      { error: `spatial engine failed: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }
  const askJson = await askRes.json();
  const questionId = askJson?.id;
  if (!questionId) {
    return NextResponse.json(
      { error: "spatial engine returned no questionId" },
      { status: 502 },
    );
  }

  // Persist the link so the chat UI shows "View spatial" chip.
  await prisma.message.update({
    where: { id: messageId },
    data: { spatialQuestionId: questionId, spatialModel: model },
  });

  return NextResponse.json({ ok: true, questionId, model });
}
