import { NextRequest, NextResponse } from "next/server";

/**
 * Day 12 v24 — /api/test-keys diagnostic.
 *
 * Tests every key the user has set in Vercel env vars by making
 * one cheap test call to each provider. Returns the actual
 * HTTP status + a human-readable "ok" or "broken" verdict per
 * key. Use this the moment you save a new key in Vercel to
 * confirm it works WITHOUT waiting for a full /api/ask call.
 *
 *   GET /api/test-keys
 *
 * Each test makes the smallest possible API call:
 *   - Gemini: list available models
 *   - Tavily: empty search with max_results=1
 *   - OpenRouter: list available models
 *   - Perplexity: 1-token completion
 *
 * The endpoint never returns the actual key — just "ok" or
 * "broken: <reason>".
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface KeyTest {
  name: string;
  envVar: string;
  available: boolean;
  ok: boolean;
  status?: number;
  reason?: string;
  latencyMs: number;
}

async function timeIt<T>(fn: () => Promise<T>): Promise<{ result?: T; error?: any; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, latencyMs: Date.now() - t0 };
  } catch (error) {
    return { error, latencyMs: Date.now() - t0 };
  }
}

async function testGemini(): Promise<KeyTest> {
  const name = "Gemini";
  const envVar = "GEMINI_API_KEY";
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { name, envVar, available: false, ok: false, reason: "not set", latencyMs: 0 };
  }
  const { result, error, latencyMs } = await timeIt(async () => {
    // List models — cheapest API call. Returns the available model
    // list. The shape of the response tells us the key has free
    // tier access.
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { cache: "no-store" },
    );
    return r;
  });
  if (error) {
    return {
      name,
      envVar,
      available: true,
      ok: false,
      reason: `network: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs,
    };
  }
  if (!result!.ok) {
    const text = await result!.text().catch(() => "");
    return {
      name,
      envVar,
      available: true,
      ok: false,
      status: result!.status,
      reason: text.slice(0, 200),
      latencyMs,
    };
  }
  const data: any = await result!.json();
  const modelNames: string[] = (data.models ?? []).map((m: any) => m.name);
  return {
    name,
    envVar,
    available: true,
    ok: true,
    status: result!.status,
    reason: `${modelNames.length} models available${modelNames.includes("models/gemini-1.5-flash") ? " (1.5-flash OK)" : ""}${modelNames.includes("models/gemini-2.0-flash") ? " (2.0-flash OK)" : ""}`,
    latencyMs,
  };
}

async function testTavily(): Promise<KeyTest> {
  const name = "Tavily";
  const envVar = "TAVILY_API_KEY";
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    return { name, envVar, available: false, ok: false, reason: "not set", latencyMs: 0 };
  }
  const { result, error, latencyMs } = await timeIt(async () => {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: "test",
        max_results: 1,
        search_depth: "basic",
      }),
      cache: "no-store",
    });
    return r;
  });
  if (error) {
    return {
      name,
      envVar,
      available: true,
      ok: false,
      reason: `network: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs,
    };
  }
  if (!result!.ok) {
    const text = await result!.text().catch(() => "");
    return {
      name,
      envVar,
      available: true,
      ok: false,
      status: result!.status,
      reason: text.slice(0, 200),
      latencyMs,
    };
  }
  const data: any = await result!.json();
  return {
    name,
    envVar,
    available: true,
    ok: true,
    status: result!.status,
    reason: `${data.results?.length ?? 0} results returned`,
    latencyMs,
  };
}

async function testOpenRouter(): Promise<KeyTest> {
  const name = "OpenRouter";
  const envVar = "OPENROUTER_API_KEY";
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return { name, envVar, available: false, ok: false, reason: "not set", latencyMs: 0 };
  }
  const { result, error, latencyMs } = await timeIt(async () => {
    const r = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    return r;
  });
  if (error) {
    return {
      name,
      envVar,
      available: true,
      ok: false,
      reason: `network: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs,
    };
  }
  if (!result!.ok) {
    return {
      name,
      envVar,
      available: true,
      ok: false,
      status: result!.status,
      reason: `HTTP ${result!.status}`,
      latencyMs,
    };
  }
  return {
    name,
    envVar,
    available: true,
    ok: true,
    status: result!.status,
    reason: "models endpoint OK",
    latencyMs,
  };
}

async function testPerplexity(): Promise<KeyTest> {
  const name = "Perplexity";
  const envVar = "PERPLEXITY_API_KEY";
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) {
    return { name, envVar, available: false, ok: false, reason: "not set", latencyMs: 0 };
  }
  const { result, error, latencyMs } = await timeIt(async () => {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
      cache: "no-store",
    });
    return r;
  });
  if (error) {
    return {
      name,
      envVar,
      available: true,
      ok: false,
      reason: `network: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs,
    };
  }
  if (!result!.ok) {
    const text = await result!.text().catch(() => "");
    return {
      name,
      envVar,
      available: true,
      ok: false,
      status: result!.status,
      reason: text.slice(0, 200),
      latencyMs,
    };
  }
  return {
    name,
    envVar,
    available: true,
    ok: true,
    status: result!.status,
    reason: "OK",
    latencyMs,
  };
}

export async function GET() {
  const t0 = Date.now();
  const tests = await Promise.all([
    testGemini(),
    testTavily(),
    testOpenRouter(),
    testPerplexity(),
  ]);
  const summary = {
    totalKeys: tests.length,
    keysSet: tests.filter((t) => t.available).length,
    keysWorking: tests.filter((t) => t.ok).length,
    allWorking: tests.every((t) => !t.available || t.ok),
  };
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - t0,
    summary,
    keys: tests,
  });
}
