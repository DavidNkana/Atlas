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

  // Step 1 — Tavily fetches real web data.
  // We give Tavily the user's question + a bit of context so the
  // search is biased toward the relevant topic.
  const tavilyQuery = context
    ? `${message} (context: ${context})`
    : message;

  let tavilyAnswer = "";
  let tavilySources: Array<{ title: string; url: string }> = [];

  try {
    const tavilyPromise = fetchTavilyWebAnswer(tavilyQuery, {
      context,
      maxResults: 5,
    });
    const tavilyResult = await Promise.race([
      tavilyPromise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), TAVILY_TIMEOUT_MS),
      ),
    ]);
    if (tavilyResult) {
      tavilyAnswer = tavilyResult.answer;
      tavilySources = tavilyResult.sources.map((s) => ({
        title: s.title,
        url: s.url,
      }));
    }
  } catch (err) {
    console.warn("[/api/chat] tavily error:", err);
  }

  // Step 2 — Gemini synthesizes a chat-style response.
  // Uses Gemini 2.0 Flash with the same Vertex/AQ.Ab8RN6 key the
  // rest of Atlas uses. If Gemini fails (quota), fall back to
  // returning Tavily's raw answer verbatim.
  let geminiAnswer = "";
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
      geminiAnswer = result.response.text().trim();
    } catch (err) {
      console.warn("[/api/chat] gemini error:", err);
      // Fall through — we'll use Tavily's answer below.
    }
  }

  // Compose the final answer.
  // - If Gemini produced something useful, use it.
  // - Otherwise fall back to Tavily's pre-synthesized answer.
  // - Otherwise return a "no data" message but still mark ok:true so
  //   the UI can show the sources.
  const finalAnswer =
    geminiAnswer && geminiAnswer.length > 20
      ? geminiAnswer
      : tavilyAnswer ||
        "I couldn't find live web data on that topic right now. Try refining the question or check back in a few minutes.";

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
  };
  return NextResponse.json(response, {
    headers: {
      "x-atlas-elapsed-ms": String(elapsed),
      "x-atlas-status": "ok",
    },
  });
}

/**
 * GET — health/diag endpoint (no auth required).
 * Lets David verify Tavily + Gemini wiring via the diag pattern.
 */
export async function GET(req: NextRequest) {
  const tavilyKey = !!process.env.TAVILY_API_KEY;
  const geminiKey = !!process.env.GEMINI_API_KEY;

  // Optionally bust cache via ?bust=1
  if (new URL(req.url).searchParams.get("bust") === "1") {
    bustTavilyWebCache();
  }

  return NextResponse.json({
    ok: true,
    version: "chat-v1",
    config: {
      tavilyConfigured: tavilyKey,
      geminiConfigured: geminiKey,
      tavilyTimeoutMs: TAVILY_TIMEOUT_MS,
      geminiTimeoutMs: GEMINI_TIMEOUT_MS,
      cacheTtlMs: 30 * 60 * 1000,
    },
    routes: {
      POST: "Send { message, questionContext?, model? } to chat with Atlas.",
      GET: "Diag. Pass ?bust=1 to bust the 30min cache.",
    },
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
