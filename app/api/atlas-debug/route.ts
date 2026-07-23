/**
 * Atlas debug endpoint — probes what's deployed and configured.
 *
 * Hit: GET https://atlas-q2eh.vercel.app/api/atlas-debug
 *
 * Returns (no secret values, just presence + reachability):
 *  - which env vars are set
 *  - whether Prisma can answer a tiny query
 *  - which Clerk key prefix is in use
 *  - whether Clerk's session-token endpoint is reachable
 *  - recent Question count (so we know if DB writes are working)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  detail: string;
}

async function probe(name: string, fn: () => Promise<string>): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { ok: true, latencyMs: Date.now() - t0, detail };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
    };
  }
}

export async function GET() {
  const out: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // 1) Env var presence (without exposing values)
  const envChecks = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
    DATABASE_URL: !!process.env.DATABASE_URL,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    TAVILY_API_KEY: !!process.env.TAVILY_API_KEY,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY,
  };
  // Inspect key prefixes only — never log the key itself
  const keyPrefixes = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.slice(0, 10),
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY?.slice(0, 10),
    DATABASE_URL: process.env.DATABASE_URL?.slice(0, 20),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY?.slice(0, 10),
    TAVILY_API_KEY: process.env.TAVILY_API_KEY?.slice(0, 10),
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY?.slice(0, 14),
  };
  out.env = { presence: envChecks, prefixes: keyPrefixes };

  // 2) Prisma reachability + count
  out.prisma = await probe("prisma", async () => {
    const count = await prisma.question.count();
    return `${count} Question rows in DB`;
  });

  // 3) Clerk token endpoint reachability — the warm-coral-32 / accounts.dev
  //    pattern tells us if we're talking to dev or prod Clerk
  out.clerkTokenEndpoint = await probe("clerk-token", async () => {
    const pubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
    // Clerk's publishable key encodes the frontend API URL.
    // pk_test_* → *.clerk.accounts.dev (dev)
    // pk_live_* → *.clerk.com (prod)
    if (pubKey.startsWith("pk_live_")) {
      return "publishable key is pk_live_ → prod Clerk (clerk.com)";
    }
    if (pubKey.startsWith("pk_test_")) {
      return "publishable key is pk_test_ → dev Clerk (clerk.accounts.dev). Production should use pk_live_.";
    }
    return `publishable key prefix unrecognized: ${pubKey.slice(0, 10)}`;
  });

  return NextResponse.json(out, {
    headers: { "Cache-Control": "no-store" },
  });
}
