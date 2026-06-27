import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  const results: any = {};

  // Test 1: Gemini raw HTTP
  if (geminiKey) {
    const t0 = Date.now();
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Say hello" }] }] }),
        },
      );
      const body = await r.text();
      results.gemini = {
        status: r.status,
        ok: r.ok,
        latencyMs: Date.now() - t0,
        body: body.slice(0, 200),
        keyFirst8: geminiKey.slice(0, 8),
      };
    } catch (e: any) {
      results.gemini = { error: e.message };
    }
  }

  // Test 2: OpenRouter — test 3 different models
  if (orKey) {
    const models = [
      "meta-llama/llama-3.3-70b-instruct",
      "qwen/qwen3-next-80b-a3b-instruct",
      "meta-llama/llama-3.2-3b-instruct",
    ];
    results.openrouter = [];
    for (const m of models) {
      const t0 = Date.now();
      try {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${orKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: m,
            messages: [{ role: "user", content: "Say hello" }],
          }),
        });
        const body = await r.text().catch(() => "");
        results.openrouter.push({
          model: m,
          status: r.status,
          ok: r.ok,
          latencyMs: Date.now() - t0,
          body: body.slice(0, 200),
        });
      } catch (e: any) {
        results.openrouter.push({ model: m, error: e.message, latencyMs: Date.now() - t0 });
      }
    }
  }

  return NextResponse.json(results);
}
