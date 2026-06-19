/**
 * Day 18 — /api/chat — Perplexity-style threaded chat.
 *
 * Always uses Tavily + Gemini for the chat engine. No model picker
 * for chat — that's what David decided. Users pick a model only
 * when they click View Data on a chat message (transitions to the
 * spatial view via /api/ask).
 *
 * POST /api/chat
 *   body: { threadId?: string, content: string }
 *   - If threadId is omitted, creates a new thread + appends the
 *     first user message, runs Tavily + Gemini, appends the assistant
 *     message, returns { threadId, messageId }.
 *   - If threadId is provided, appends a new user message, runs the
 *     engine, appends the assistant message.
 *
 * The chat engine always returns:
 *   - prose content (the answer body)
 *   - sources (Tavily URLs as clickable citations)
 *   - intent ("conversational" or "spatial")
 *   - matchedPatterns (so the UI can show "why this was classified
 *     this way")
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { tavily as tavilyModel } from "@/lib/models/tavily";
import { classifyIntent } from "@/lib/intent/classify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to chat with Atlas" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const content = String(body?.content ?? "").trim();
  const threadId = body?.threadId ? String(body.threadId) : null;

  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (content.length > 4000) {
    return NextResponse.json(
      { error: "content too long (max 4000 chars)" },
      { status: 400 },
    );
  }

  // Find or create the thread. Title = first 80 chars of the first
  // user message.
  let thread;
  if (threadId) {
    thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.userId !== userId) {
      return NextResponse.json({ error: "thread not found" }, { status: 404 });
    }
  } else {
    thread = await prisma.thread.create({
      data: {
        userId,
        title: content.length > 80 ? content.slice(0, 77) + "..." : content,
      },
    });
  }

  // Append the user message.
  const userMessage = await prisma.message.create({
    data: {
      threadId: thread.id,
      role: "user",
      content,
      question: content,
    },
  });
  await prisma.thread.update({
    where: { id: thread.id },
    data: { messageCount: { increment: 1 } },
  });

  // Run the chat engine. Always Tavily + Gemini.
  const intentResult = classifyIntent(content);
  const modelReq = {
    // Day 18: chat engine ignores the spatial vertical picker. We
    // still pass something valid so the model doesn't reject the
    // request — but the chat engine's prompt is question-agnostic.
    vertical: "mixed_use_land" as const,
    question: content,
  };

  let answerBody = "";
  let sources: Array<{ title?: string; url: string }> = [];
  let modelOk = false;
  let modelError: string | undefined;

  try {
    const result: any = await tavilyModel.call(modelReq);
    if (result && result.ok !== false) {
      // Tavily model returns ranked_sites + answer + sources when ok.
      // If ranked_sites is empty but answer is present, the chat
      // still has content to show.
      answerBody = typeof result.answer === "string" ? result.answer : "";
      if (Array.isArray(result.sources)) {
        sources = result.sources.filter(
          (s: any) => s && typeof s.url === "string" && s.url.length > 0,
        );
      }
      // If the model returned ranked_sites but no prose answer,
      // synthesise a short answer from the sites.
      if (!answerBody && Array.isArray(result.ranked_sites) && result.ranked_sites.length > 0) {
        answerBody = result.ranked_sites
          .slice(0, 5)
          .map((s: any) => `• **${s.name}** — ${s.rationale ?? ""}`)
          .join("\n\n");
      }
      modelOk = answerBody.length > 0;
    } else {
      modelError = typeof result?.error === "string" ? result.error : "unknown";
    }
  } catch (e) {
    modelError = e instanceof Error ? e.message : String(e);
  }

  if (!modelOk) {
    answerBody =
      "I couldn't reach a research model right now. Try again in a moment, or click 'View data' below to try the spatial view.";
  }

  // Append the assistant message.
  const assistantMessage = await prisma.message.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      content: answerBody,
      question: content,
      intent: intentResult.primary,
      sources: sources.length > 0 ? (sources as any) : undefined,
    },
  });
  await prisma.thread.update({
    where: { id: thread.id },
    data: { messageCount: { increment: 1 }, updatedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    threadId: thread.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    answer: answerBody,
    sources,
    intent: intentResult.primary,
    intentScore: {
      spatial: intentResult.spatialScore,
      conversational: intentResult.conversationalScore,
    },
    matchedPatterns: {
      spatial: intentResult.matchedSpatialPatterns,
      conversational: intentResult.matchedConversationalPatterns,
    },
    modelError,
  });
}

/** GET /api/chat — list threads for the current user (sidebar). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const threads = await prisma.thread.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true },
      },
    },
  });
  return NextResponse.json({
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      messageCount: t.messageCount,
      updatedAt: t.updatedAt,
      lastMessage: t.messages[0]?.content?.slice(0, 120) ?? null,
    })),
  });
}
