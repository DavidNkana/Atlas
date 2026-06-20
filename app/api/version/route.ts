/**
 * Day 22 v9 — Build-version endpoint.
 *
 * Returns the latest git commit SHA on main + the build time.
 * Used to verify Vercel actually deployed the latest code.
 * If X-Latest-Commit doesn't match GitHub main, Vercel hasn't rebuilt.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest) {
  // Try to read from Vercel's env vars (auto-injected on deploy)
  // VERCEL_GIT_COMMIT_SHA is set automatically on every Vercel build
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    "unknown";
  const commitShort = commit.slice(0, 8);
  const buildTime = new Date().toISOString();

  return NextResponse.json(
    {
      ok: true,
      commit,
      commitShort,
      buildTime,
      // Hard-coded marker so we can verify the new code is deployed
      // (search the diag response for this string)
      version: "v9-version-endpoint-shipped",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Atlas-Version": commitShort,
        "X-Atlas-Build-Time": buildTime,
      },
    },
  );
}
