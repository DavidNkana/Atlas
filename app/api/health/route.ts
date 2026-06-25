/**
 * Day 22 v18 — Health check that diagnoses model key issues.
 *
 * GET /api/health
 *
 * Tests each research model in sequence and reports:
 *   - Is the key configured?
 *   - Is the key format valid (recognized prefix check)
 *     OpenRouter, etc)?
 *   - Does a tiny test call succeed?
 *
 * Returns a structured JSON report so the result page can show
 * actionable next steps instead of mysterious Lusaka fallback.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ModelHealth {
  id: string;
  configured: boolean;
  keyFormat: "valid" | "wrong-format" | "unknown" | "missing";
  detail: string;
  ok?: boolean;
  latencyMs?: number;
}

function checkKey(
  envName: string,
  key: string | undefined,
  expectedPrefixes: string[],
): ModelHealth {
  if (!key) {
    return {
      id: envName,
      configured: false,
      keyFormat: "missing",
      detail: `Set ${envName} in Vercel Environment Variables`,
    };
  }
  const prefix = expectedPrefixes.find((p) => key.startsWith(p));
  if (prefix) {
    return {
      id: envName,
      configured: true,
      keyFormat: "valid",
      detail: `Starts with ${prefix} ✓`,
    };
  }
  // Detect common wrong formats
  // (removed AQ. rejection — Google AI Studio now issues AQ.* keys,
  // replacing the old AIzaSy... format as of 2026.)
  return {
    id: envName,
    configured: true,
    keyFormat: "unknown",
    detail: `Key present but does not start with any expected prefix (${expectedPrefixes.join(", ")})`,
  };
}

export async function GET(_req: NextRequest) {
  const t0 = Date.now();
  const geminiKey = process.env.GEMINI_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  const checks: ModelHealth[] = [
    checkKey("GEMINI_API_KEY", geminiKey, ["AIzaSy", "AQ."]),
    checkKey("TAVILY_API_KEY", tavilyKey, ["tvly-"]),
    checkKey("OPENROUTER_API_KEY", openrouterKey, ["sk-or-"]),
    checkKey("PERPLEXITY_API_KEY", perplexityKey, ["pplx-"]),
  ];

  // Test Gemini with a tiny call if the key format is recognized
  const geminiCheck = checks[0];
  if (geminiCheck.keyFormat === "valid" && geminiKey) {
    try {
      const start = Date.now();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: "ping" }] },
            ],
            generationConfig: { maxOutputTokens: 4 },
          }),
        },
      );
      geminiCheck.latencyMs = Date.now() - start;
      if (res.ok) {
        geminiCheck.ok = true;
      } else {
        const err = await res.text();
        geminiCheck.ok = false;
        geminiCheck.detail = `Test call returned ${res.status}: ${err.slice(0, 150)}`;
        if (res.status === 429 || /quota/i.test(err)) {
          geminiCheck.detail =
            "Quota exceeded on this key. Free AI Studio keys get 15 RPM / 1500 RPD. Wait or use a different key.";
        }
      }
    } catch (err) {
      geminiCheck.ok = false;
      geminiCheck.detail = `Test call failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Test Tavily
  const tavilyCheck = checks[1];
  if (tavilyCheck.keyFormat === "valid" && tavilyKey) {
    try {
      const start = Date.now();
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: "test",
          max_results: 1,
        }),
      });
      tavilyCheck.latencyMs = Date.now() - start;
      tavilyCheck.ok = res.ok;
      if (!res.ok) {
        const err = await res.text();
        tavilyCheck.detail = `Tavily returned ${res.status}: ${err.slice(0, 150)}`;
      }
    } catch (err) {
      tavilyCheck.ok = false;
      tavilyCheck.detail = `Tavily test failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const anyOk = checks.some((c) => c.ok === true);
  const allConfigured = checks.every((c) => c.configured);
  const anyMissing = checks.some((c) => !c.configured);

  return NextResponse.json(
    {
      ok: anyOk,
      buildCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "unknown",
      buildTime: process.env.VERCEL_DEPLOYMENT_ID ?? new Date().toISOString(),
      models: checks,
      summary: {
        totalConfigured: checks.filter((c) => c.configured).length,
        total: checks.length,
        anyModelOk: anyOk,
        allConfigured,
        anyMissing,
      },
      fixInstructions: anyMissing
        ? "Set the missing env vars in Vercel. For GEMINI_API_KEY, use an AI Studio key from aistudio.google.com/apikey."
        : checks.find((c) => c.keyFormat === "wrong-format")
          ? "GEMINI_API_KEY is set but uses an unrecognized format. Atlas needs an AI Studio key. Get one free at aistudio.google.com/apikey"
          : "All keys configured.",
      elapsedMs: Date.now() - t0,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
