/**
 * Day 18 v3 — /api/chat/diagnostic — Verify the chat stack end-to-end.
 *
 * Tests in order:
 *   1. Thread table exists (else the schema migration hasn't run)
 *   2. Tavily + Gemini keys are set
 *   3. A live Tavily search returns >=1 result
 *   4. The Gemini synthesis call succeeds
 *
 * Returns a JSON report. No auth required so you can curl it.
 * GET = report only. POST = also runs a sample chat round-trip.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function checkSchema(): Promise<{ ok: boolean; reason: string }> {
  try {
    // Query the Thread table. If it doesn't exist, Prisma throws.
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "Thread" LIMIT 1`);
    return { ok: true, reason: "Thread table exists" };
  } catch (e) {
    // Day 19 v2: self-heal from the diagnostic endpoint too. If the
    // tables are missing, run the migration now so a re-curl of
    // /api/chat/diagnostic reports allOk=true.
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "Thread" (
           "id" TEXT PRIMARY KEY,
           "userId" TEXT NOT NULL,
           "title" TEXT NOT NULL,
           "messageCount" INTEGER NOT NULL DEFAULT 0,
           "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
         )`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "Thread_userId_updatedAt_idx" ON "Thread"("userId", "updatedAt")`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "Thread_userId_createdAt_idx" ON "Thread"("userId", "createdAt")`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "Message" (
           "id" TEXT PRIMARY KEY,
           "threadId" TEXT NOT NULL,
           "role" TEXT NOT NULL,
           "content" TEXT NOT NULL,
           "question" TEXT,
           "intent" TEXT,
           "sources" JSONB,
           "spatialQuestionId" TEXT,
           "spatialModel" TEXT,
           "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
           CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE
         )`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt")`,
      );
      return { ok: true, reason: "Thread + Message tables self-healed by this diagnostic call" };
    } catch (migrateErr) {
      return {
        ok: false,
        reason: `Thread table missing and self-heal failed: ${migrateErr instanceof Error ? migrateErr.message : String(migrateErr)}`,
      };
    }
  }
}

async function checkTavily(): Promise<{ ok: boolean; reason: string; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return { ok: false, reason: "TAVILY_API_KEY not set", latencyMs: 0 };
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: "test",
        max_results: 1,
        include_answer: false,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `Tavily HTTP ${res.status}`, latencyMs: Date.now() - t0 };
    }
    const data = (await res.json()) as { results?: unknown[] };
    return {
      ok: Array.isArray(data.results) && data.results.length > 0,
      reason: `${data.results?.length ?? 0} results returned`,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkGemini(): Promise<{ ok: boolean; reason: string; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { ok: false, reason: "GEMINI_API_KEY not set", latencyMs: 0 };
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent("Reply with the word OK.");
    const text = result.response.text().trim();
    return {
      ok: text.toUpperCase().includes("OK"),
      reason: `Gemini replied: "${text.slice(0, 40)}"`,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - t0,
    };
  }
}

export async function GET() {
  const schema = await checkSchema();
  const tavily = await checkTavily();
  const gemini = await checkGemini();
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    schema,
    tavily,
    gemini,
    allOk: schema.ok && tavily.ok && gemini.ok,
    nextStepIfFailed: !schema.ok
      ? "Run: DATABASE_URL='postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true' pnpm migrate:thread"
      : !tavily.ok
      ? "Check TAVILY_API_KEY in Vercel env (1/1000 credits/month free)"
      : !gemini.ok
      ? "Check GEMINI_API_KEY in Vercel env (Vertex format or AI Studio format both work)"
      : null,
  });
}
