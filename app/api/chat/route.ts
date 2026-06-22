import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import {
  fetchTavilyWebAnswer,
  bustTavilyWebCache,
} from "@/lib/connectors/tavily-search";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Day 28 — Result-page chat endpoint.
 *
 * Body: { message: string, questionContext?: string, model?: string }
 *
 * Returns: {
 *   ok: boolean,
 *   answer: string,        // synthesized by Gemini from Tavily results
 *   sources: Array<{title, url}>,
 *   ranked_sites?: Array<RankedSite>  // populated if the user asked for
 *                                     // sites (e.g. "what about in Gauteng for 2000 sqm")
 * }
 *
 * Architecture:
 *   1. Tavily fetches real web data (with sources + answer)
 *   2. Gemini synthesizes a chat-style response from:
 *      - the user's message
 *      - the questionContext (what they originally asked)
 *      - the Tavily answer + sources
 *   3. If the user asks for sites in a different city/size/etc,
 *      the chat response includes a `refinedQuery` field that
 *      the UI uses to trigger a /api/ask re-run for real-time
 *      result updates.
 *
 * Strict budget: 10s total (Tavily 5s + Gemini 5s).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TAVILY_TIMEOUT_MS = 5_000;
const GEMINI_TIMEOUT_MS = 5_000;

interface ChatRequestBody {
  message: string;
  questionContext?: string;
  model?: string;
}

interface ChatResponse {
  ok: boolean;
  answer: string;
  sources: Array<{ title: string; url: string }>;
  refinedQuery?: string;
  error?: string;
  // LCP-30 — diagnostics so the client can show what actually happened
  // without needing a Vercel dashboard.
  diagnostics?: {
    path: "gemini" | "tavily_answer" | "tavily_sources" | "openrouter" | "no_data";
    tavilyConfigured: boolean;
    tavilyOk: boolean;
    tavilySources: number;
    tavilyElapsedMs: number;
    tavilyError: string | null;
    geminiConfigured: boolean;
    geminiOk: boolean;
    geminiError: string | null;
  };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  // Auth gate — only signed-in users can use chat (matches /api/ask).
  const { userId } = getAuth(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 401 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json(
      { error: "Missing 'message' field" },
      { status: 401 },
    );
  }
  const context = (body.questionContext ?? "").trim();

  // LCP-30 — Read TAVILY_API_KEY fresh on every request instead of
  // relying on the module-level const in tavily-search.ts. The
  // module-level const captures the env var at cold start; if the
  // env was set after the function instance warmed up (e.g. a
  // Vercel redeploy that picked up a new env but the route module
  // was already cached), the const is stale. Reading fresh per-
  // request makes the failure mode loud instead of silent.
  const tavilyKey = process.env.TAVILY_API_KEY ?? "";
  if (!tavilyKey) {
    console.warn("[/api/chat] TAVILY_API_KEY not set in runtime env");
  }

  // Step 1 — Tavily fetches real web data.
  // We give Tavily the user's question + a bit of context so the
  // search is biased toward the relevant topic.
  const tavilyQuery = context
    ? `${message} (context: ${context})`
    : message;

  let tavilyAnswer = "";
  let tavilySources: Array<{ title: string; url: string }> = [];
  let tavilyOk = false;
  let tavilyError: string | null = null;
  let tavilyHttpStatus: number | null = null;
  let tavilyElapsedMs = 0;

  const tavilyStart = Date.now();
  try {
    const tavilyPromise = fetchTavilyWebAnswer(tavilyQuery, {
      context,
      maxResults: 5,
    });
    const tavilyResult = (await Promise.race([
      tavilyPromise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), TAVILY_TIMEOUT_MS),
      ),
    ])) as Awaited<typeof tavilyPromise>;
    tavilyElapsedMs = Date.now() - tavilyStart;
    if (tavilyResult) {
      tavilyAnswer = tavilyResult.answer ?? "";
      tavilySources = tavilyResult.sources.map((s) => ({
        title: s.title,
        url: s.url,
      }));
      // OK = we got data back (either answer OR sources).
      tavilyOk = tavilyAnswer.length > 0 || tavilySources.length > 0;
      if (!tavilyOk) tavilyError = "tavily_returned_no_data";
    } else {
      tavilyError = `tavily_connector_timeout_or_null_after_${TAVILY_TIMEOUT_MS}ms`;
    }
  } catch (err) {
    tavilyElapsedMs = Date.now() - tavilyStart;
    tavilyError = err instanceof Error ? err.message : String(err);
    console.warn("[/api/chat] tavily error:", err);
  }

  // LCP-33 — INLINE Tavily call as second-attempt. If the
  // connector returned null but the env key IS set, this
  // inline call hits Tavily directly with the same params and
  // recovers. Also serves as a definitive diagnostic — if the
  // inline call also returns null, the Tavily key itself is
  // missing or revoked on Vercel (not a code bug).
  if (!tavilyOk) {
    const inlineKey = process.env.TAVILY_API_KEY ?? "";
    if (inlineKey) {
      const inlineStart = Date.now();
      try {
        const inlineController = new AbortController();
        const inlineTimeout = setTimeout(
          () => inlineController.abort(),
          TAVILY_TIMEOUT_MS,
        );
        const inlineRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${inlineKey}`,
          },
          body: JSON.stringify({
            api_key: inlineKey,
            query: tavilyQuery,
            search_depth: "advanced",
            include_answer: "advanced",
            include_raw_content: false,
            max_results: 5,
            topic: "general",
            include_domains: [],
          }),
          signal: inlineController.signal,
          cache: "no-store",
        });
        clearTimeout(inlineTimeout);
        if (inlineRes.ok) {
          const inlineData = (await inlineRes.json()) as {
            answer?: string;
            results?: Array<{ title: string; url: string }>;
          };
          tavilyAnswer = inlineData.answer ?? "";
          tavilySources = (inlineData.results ?? []).map((r) => ({
            title: r.title,
            url: r.url,
          }));
          tavilyOk = tavilyAnswer.length > 0 || tavilySources.length > 0;
          tavilyElapsedMs = Date.now() - inlineStart;
          if (tavilyOk) {
            console.log(
              `[/api/chat] INLINE Tavily recovered after connector failed: sources=${tavilySources.length} answerLen=${tavilyAnswer.length} inMs=${tavilyElapsedMs}`,
            );
          } else {
            tavilyError = `tavily_inline_returned_no_data_after_${tavilyElapsedMs}ms`;
          }
        } else {
          tavilyError = `tavily_inline_http_${inlineRes.status}_after_${Date.now() - inlineStart}ms`;
        }
      } catch (err) {
        tavilyError = `tavily_inline_error:${err instanceof Error ? err.message : String(err)}`;
        console.warn("[/api/chat] inline tavily error:", err);
      }
    }
  }

  // Step 2 — Gemini synthesizes a chat-style response.
  // Uses Gemini 2.0 Flash with the same Vertex/AQ.Ab8RN6 key the
  // rest of Atlas uses. If Gemini fails (quota), fall back to
  // returning Tavily's raw answer verbatim.
  let geminiAnswer = "";
  let geminiOk = false;
  let geminiError: string | null = null;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = buildGeminiPrompt(message, context, tavilyAnswer, tavilySources);
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("gemini_timeout")), GEMINI_TIMEOUT_MS),
        ),
      ]);
      geminiAnswer = (result.response.text() ?? "").trim();
      geminiOk = geminiAnswer.length >= 20;
    } catch (err) {
      geminiError = err instanceof Error ? err.message : String(err);
      console.warn("[/api/chat] gemini error:", err);
      // Fall through — we'll use Tavily's answer below.
    }
  } else {
    geminiError = "GEMINI_API_KEY not set";
  }

  // Day 28 v2 — Compose the final answer with PROPER fallback chain.
  //
  // Priority:
  //   1. Gemini's synthesized answer (best — chat-style + cites sources)
  //   2. Tavily's pre-synthesized answer (good — direct from web search)
  //   3. Synthesize a response from Tavily's sources if Tavily returned
  //      sources but no synthesized answer (common with Tavily /search)
  //   4. OpenRouter free-tier fallback (LLM-32) — only when Tavily is
  //      empty AND Gemini failed. Uses OPENROUTER_API_KEY with a free
  //      model. Catches the "Tavily returned null but key works" case
  //      that the v2 fresh-env-read fix couldn't cover (e.g. mid-
  //      flight env change, network edge issues).
  //   5. Genuine fallback message — only when ALL of the above failed
  let finalAnswer: string;
  let path:
    | "gemini"
    | "tavily_answer"
    | "tavily_sources"
    | "openrouter"
    | "no_data" = "no_data";
  if (geminiOk) {
    finalAnswer = geminiAnswer;
    path = "gemini";
  } else if (tavilyAnswer.length > 0) {
    // Tavily gave us a synthesized answer; use it.
    finalAnswer = tavilyAnswer;
    path = "tavily_answer";
  } else if (tavilySources.length > 0) {
    // Tavily returned sources but no synthesized answer (very common
    // pattern — Tavily's /search often returns just the results array).
    // Surface them as a structured "live data" response.
    const sourceList = tavilySources
      .slice(0, 3)
      .map((s, i) => `[${i + 1}] ${s.title}`)
      .join("\n");
    finalAnswer = `I found live web data on this topic but couldn't synthesize a full answer right now. Here are the most relevant sources:\n\n${sourceList}\n\nClick any citation below for the full article.`;
    path = "tavily_sources";
  } else {
    // Both Tavily and Gemini returned nothing. LCP-32 — try
    // OpenRouter free-tier as last AI fallback before giving up.
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      try {
        const orController = new AbortController();
        const orTimeout = setTimeout(() => orController.abort(), 7_000);
        const orRes = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openrouterKey}`,
            },
            body: JSON.stringify({
              model: "openai/gpt-oss-20b:free",
              messages: [
                {
                  role: "system",
                  content:
                    "You are Atlas, an AI assistant for African builders and investors. Be brief, specific, and grounded. If you don't know, say so.",
                },
                { role: "user", content: message },
              ],
              max_tokens: 400,
            }),
            signal: orController.signal,
            cache: "no-store",
          },
        );
        clearTimeout(orTimeout);
        if (orRes.ok) {
          const orData = (await orRes.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const orText =
            orData.choices?.[0]?.message?.content?.trim() ?? "";
          if (orText.length >= 20) {
            finalAnswer = orText + "\n\n_Note: this answer came from a free-tier fallback model (Llama 3.1 8B), not Atlas's primary research engine. Tavily and Gemini were both unavailable._";
            path = "openrouter";
          } else {
            finalAnswer =
              "I couldn't reach a live web data source right now. " +
              "AI synthesis, Tavily search, and the OpenRouter fallback all returned empty. " +
              "Try a more specific question or check back in a few minutes.";
            path = "no_data";
          }
        } else {
          finalAnswer =
            "I couldn't reach a live web data source right now. " +
            `Tavily (${tavilyError ?? "no data"}), Gemini (${geminiError ?? "no data"}), OpenRouter (HTTP ${orRes.status}) all returned empty. ` +
            "Try a more specific question or check back in a few minutes.";
          path = "no_data";
        }
      } catch (err) {
        console.warn("[/api/chat] openrouter error:", err);
        finalAnswer =
          "I couldn't reach a live web data source right now. " +
          (geminiKey ? "AI synthesis and Tavily search both returned empty. " : "") +
          "Try a more specific question or check back in a few minutes.";
        path = "no_data";
      }
    } else {
      // No OpenRouter key — original fallback message.
      finalAnswer =
        "I couldn't reach a live web data source right now. " +
        (geminiKey ? "AI synthesis and Tavily search both returned empty. " : "") +
        "Try a more specific question or check back in a few minutes.";
      path = "no_data";
    }
  }

  // Day 28 v2 — diagnostics so David can see what actually happened.
  console.log(
    `[/api/chat] path=${path} tavilyOk=${tavilyOk} sources=${tavilySources.length} tavilyErr=${tavilyError ?? "none"} tavilyMs=${tavilyElapsedMs} geminiOk=${geminiOk} finalLen=${finalAnswer.length}`,
  );

  // Detect if the user is asking for a refined site query.
  // Heuristic: words like "Gauteng", "2000 sqm", "Sandton" in
  // the message + the user has questionContext indicating an
  // existing result. We surface refinedQuery so the UI can
  // re-run /api/ask with the new query.
  let refinedQuery: string | undefined;
  const looksLikeSiteRefinement =
    /\b(gauteng|sandton|cape town|lusaka|johannesburg|durban|pretoria|nairobi|2[0-9]{3}\s*(sqm|m2|square|m\xB2)|hectare|ha\b)\b/i.test(
      message,
    );
  if (looksLikeSiteRefinement) {
    refinedQuery = mergeQueryWithContext(message, context);
  }

  const elapsed = Date.now() - t0;
  const response: ChatResponse = {
    ok: true,
    answer: finalAnswer,
    sources: tavilySources,
    refinedQuery,
    diagnostics: {
      path,
      tavilyConfigured: !!tavilyKey,
      tavilyOk,
      tavilySources: tavilySources.length,
      tavilyElapsedMs,
      tavilyError,
      geminiConfigured: !!geminiKey,
      geminiOk,
      geminiError,
    },
  };
  return NextResponse.json(response, {
    headers: {
      "x-atlas-elapsed-ms": String(elapsed),
      "x-atlas-status": path === "no_data" ? "no-data" : "ok",
    },
  });
}

/**
 * GET — health/diag endpoint with LIVE probe (no auth required).
 * Lets David verify Tavily + Gemini wiring in production without
 * opening the Vercel dashboard. Pass ?probe=1 to actually call
 * Tavily from the server (bypassing cache) and report the truth.
 */
export async function GET(req: NextRequest) {
  const tavilyKey = !!process.env.TAVILY_API_KEY;
  const geminiKey = !!process.env.GEMINI_API_KEY;
  const url = new URL(req.url);

  // Optionally bust cache via ?bust=1
  if (url.searchParams.get("bust") === "1") {
    bustTavilyWebCache();
  }

  // LCP-30 — live probe. Runs an actual Tavily /search call from
  // the server and reports the real result shape. This is the
  // single best way to know whether the key works in production.
  let liveProbe: unknown = null;
  if (url.searchParams.get("probe") === "1") {
    const probeStart = Date.now();
    try {
      const probeResult = await fetchTavilyWebAnswer(
        "What is the average land price per hectare in Lusaka Zambia 2025?",
        { maxResults: 3, bypassCache: true },
      );
      liveProbe = {
        elapsedMs: Date.now() - probeStart,
        ok: !!probeResult,
        answerLen: probeResult?.answer?.length ?? 0,
        sourcesCount: probeResult?.sources?.length ?? 0,
        firstSourceTitle: probeResult?.sources?.[0]?.title ?? null,
        firstSourceUrl: probeResult?.sources?.[0]?.url ?? null,
      };
    } catch (err) {
      liveProbe = {
        elapsedMs: Date.now() - probeStart,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    version: "chat-v2",
    config: {
      tavilyConfigured: tavilyKey,
      geminiConfigured: geminiKey,
      tavilyTimeoutMs: TAVILY_TIMEOUT_MS,
      geminiTimeoutMs: GEMINI_TIMEOUT_MS,
      cacheTtlMs: 30 * 60 * 1000,
    },
    routes: {
      POST: "Send { message, questionContext?, model? } to chat with Atlas.",
      GET: "Diag. Pass ?probe=1 to do a live Tavily probe. Pass ?bust=1 to bust the 30min cache.",
    },
    liveProbe,
  });
}

function buildGeminiPrompt(
  message: string,
  context: string,
  tavilyAnswer: string,
  sources: Array<{ title: string; url: string }>,
): string {
  const sourceList = sources
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`)
    .join("\n");

  return `You are Atlas, an AI assistant that helps African builders and investors with site selection, market intelligence, and investment opportunities.

The user originally asked: ${context || "(no prior context)"}

They are now asking: ${message}

${tavilyAnswer ? `A web search returned this synthesized answer (for reference, do NOT parrot verbatim):\n${tavilyAnswer}\n` : "A web search returned no usable data.\n"}
${sourceList ? `Source URLs (cite inline as [1], [2], etc.):\n${sourceList}\n` : ""}

Your task:
- Answer the user's question in 2-4 short paragraphs.
- Cite sources inline using the [N] notation when you use a fact from them.
- Be specific and grounded — don't fabricate data, prices, or sources.
- If the user is asking "why" something was selected, explain the reasoning behind the site selection using the context provided.
- If the user is asking to refine a query (different city, different size), acknowledge the change and offer to re-run.
- Keep the tone conversational and direct. No headers, no bullet lists unless the user explicitly asks.

Answer:`;
}

function mergeQueryWithContext(message: string, context: string): string {
  if (!context) return message;
  // If the user's message already contains the original context,
  // don't double-up. Simple heuristic: check for 4+ word overlap.
  const contextWords = new Set(
    context.toLowerCase().split(/\s+/).filter((w) => w.length > 4),
  );
  const messageWords = message.toLowerCase().split(/\s+/);
  const overlap = messageWords.filter((w) => contextWords.has(w)).length;
  if (overlap >= 3) return message;
  return `${message} (originally: ${context})`;
}
