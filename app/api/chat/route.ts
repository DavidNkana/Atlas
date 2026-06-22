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
 * Body: { message: string, questionContext?: string, model?: string, history?: Array }
 *
 * Returns: {
 *   ok: boolean,
 *   answer: string,        // synthesized by Gemini from Tavily results
 *   sources: Array<{title, url}>,
 *   applyQuery: string,    // LCP-36 — always set so the client can
 *                          // render "Apply to results" on every response
 *   followups?: string[],  // LCP-36 — Perplexity-style related questions
 *   refinedQuery?: string, // populated if the user asked for sites
 *                          // (e.g. "what about in Gauteng for 2000 sqm")
 * }
 *
 * LCP-36 — major rewrite of how the LLM is prompted:
 *   1. Gemini's `systemInstruction` field is used (NOT a user turn)
 *      so the model treats follow-ups like "why that?" as grounded
 *      in the prior conversation, not as standalone English questions.
 *   2. Conversation history is wired into Gemini's `contents` so it
 *      can see prior turns when answering follow-ups.
 *   3. `applyQuery` is always returned (not only on refined queries)
 *      so the UI can show an "Apply to results" button on every
 *      Atlas message.
 *   4. `followups` is generated server-side from the answer context
 *      so the UI can show 2-3 related questions like Perplexity.
 *
 * Strict budget: 10s total (Tavily 5s + Gemini 5s + Followups 4s).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TAVILY_TIMEOUT_MS = 5_000;
const GEMINI_TIMEOUT_MS = 5_000;
const FOLLOWUPS_TIMEOUT_MS = 4_000;

interface ChatRequestBody {
  message: string;
  questionContext?: string;
  model?: string;
  // LCP-36 — conversation history for grounded follow-up answers.
  // Max 10 turns. Each entry is { role: "user"|"atlas", text: string }.
  history?: Array<{ role: "user" | "atlas"; text: string }>;
}

interface ChatResponse {
  ok: boolean;
  answer: string;
  sources: Array<{ title: string; url: string }>;
  applyQuery: string;
  followups?: string[];
  refinedQuery?: string;
  error?: string;
  // LCP-30 — diagnostics so the client can show what actually happened
  // without needing a Vercel dashboard.
  diagnostics?: {
    path: "gemini" | "tavily_answer" | "tavily_sources" | "openrouter" | "followup_no_data" | "no_data";
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

  // LCP-37 + LCP-38 — detect short follow-up questions
  // BEFORE we run Tavily. The followup info is hoisted up
  // here so the Tavily block below can short-circuit when
  // this is a follow-up.
  const followupInfo = buildFollowupTurn(
    message,
    body.history ?? [],
    context,
  );

  // Step 1 — Tavily fetches real web data.
  // We give Tavily the user's question + a bit of context so the
  // search is biased toward the relevant topic.
  //
  // LCP-38 — short follow-ups (e.g. "is it the capital?") SKIP
  // the Tavily web search entirely. The user is asking a
  // clarification about the prior answer; running a fresh
  // web search returns generic definitions of "capital"
  // instead of grounding in the prior Gauteng answer. The
  // user turn was already rewritten with the full prior
  // answer as inline context (see buildFollowupTurn), so the
  // model has everything it needs.
  const tavilyQuery = context
    ? `${message} (context: ${context})`
    : message;

  let tavilyAnswer = "";
  let tavilySources: Array<{ title: string; url: string }> = [];
  let tavilyOk = false;
  let tavilyError: string | null = null;
  let tavilyHttpStatus: number | null = null;
  let tavilyElapsedMs = 0;

  if (!followupInfo.isFollowup) {
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
  } else {
    tavilyError = "tavily_skipped_followup_LCP38";
  }

  // LCP-33 — INLINE Tavily call as second-attempt. If the
  // connector returned null but the env key IS set, this
  // inline call hits Tavily directly with the same params and
  // recovers. Also serves as a definitive diagnostic — if the
  // inline call also returns null, the Tavily key itself is
  // missing or revoked on Vercel (not a code bug).
  // LCP-38 — also skipped for follow-ups.
  if (!tavilyOk && !followupInfo.isFollowup) {
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
  //
  // LCP-36 — major upgrade: we use the `systemInstruction` field
  // (NOT a user turn) so the model treats the grounding rules as
  // global. We also wire `history` into the contents so follow-ups
  // like "why that?" are answered against the prior conversation
  // instead of being interpreted as standalone English questions.
  let geminiAnswer = "";
  let geminiOk = false;
  let geminiError: string | null = null;
  const geminiKey = process.env.GEMINI_API_KEY;
  // LCP-37 + LCP-38 — followupInfo was hoisted up before
  // the Tavily block so we could short-circuit Tavily when
  // this is a follow-up. We re-use it here for the Gemini
  // call rewrite.

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: buildSystemInstruction(context, tavilyAnswer, tavilySources),
      });
      const historyContents = (body.history ?? []).map((h) => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text }],
      }));
      // LCP-37 + LCP-38 — rewrite the user turn to include
      // the FULL prior assistant answer as inline context
      // with explicit grounding instructions. The model
      // literally sees the prior answer before the new
      // question and cannot lose the thread.
      const finalUserText = followupInfo.text;
      const allContents = [
        ...historyContents,
        { role: "user" as const, parts: [{ text: finalUserText }] },
      ];
      const result = await Promise.race([
        model.generateContent({ contents: allContents }),
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
    | "followup_no_data"
    | "no_data" = "no_data";
  if (geminiOk) {
    finalAnswer = geminiAnswer;
    path = "gemini";
  } else if (followupInfo.isFollowup) {
    // LCP-38 — short follow-up that Gemini couldn't answer
    // based on the prior context. We skipped Tavily on
    // purpose (the user is asking about the prior answer,
    // not the open web). Emit a graceful fallback that
    // invites the user to rephrase.
    finalAnswer =
      "I couldn't answer that based on our earlier " +
      "conversation. Could you rephrase or give me a " +
      "bit more detail?";
    path = "followup_no_data";
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

  // LCP-36 — generate follow-up question chips so the UI can
  // show Perplexity-style "related questions" at the bottom of
  // every answer. Only attempt when we have a real answer; skip
  // the no_data stub so we don't suggest bad follow-ups.
  let followups: string[] = [];
  if (path !== "no_data") {
    followups = await tryGenerateFollowups({
      context,
      history: body.history ?? [],
      lastUserMessage: message,
      lastAnswer: finalAnswer,
    });
  }

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

  // LCP-36 — applyQuery is always populated so the client can
  // show an "Apply to results" button on every Atlas message.
  // When the user has a questionContext (i.e. they're chatting
  // from a /result/[id] page), applyQuery defaults to the
  // original question so a re-run gives them the same view.
  // When the message looks like a refinement, use that instead.
  const applyQuery = refinedQuery ?? (context ? context : message);

  const elapsed = Date.now() - t0;
  const response: ChatResponse = {
    ok: true,
    answer: finalAnswer,
    sources: tavilySources,
    applyQuery,
    followups: followups.length > 0 ? followups : undefined,
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

/**
 * LCP-36 — Build the systemInstruction for Gemini. This is the
 * global grounding rule the model will follow for the entire
 * conversation. The history is NOT included here — it's passed
 * separately in the `contents` array so the model sees the
 * conversation as user/model turns.
 *
 * Critical fix for "why that?" → dictionary answer: we explicitly
 * tell the model that short, pronouns-heavy, or vague follow-ups
 * are about the prior conversation, not standalone English
 * questions. This is the difference between Perplexity and a
 * dictionary API.
 */
function buildSystemInstruction(
  context: string,
  tavilyAnswer: string,
  sources: Array<{ title: string; url: string }>,
): string {
  const ctxLine = context
    ? `\n\nThe user's original Atlas question (the one that opened this conversation) is: "${context}". The user is asking follow-up questions about THIS question. If their follow-up is short, vague, or pronouns-heavy (e.g. "why that?", "what about prices?", "is it safe?"), you MUST interpret it as a follow-up about the original Atlas question — do NOT answer it as a standalone English question.`
    : `\n\nThe user has just asked a follow-up question. Interpret it as a continuation of the conversation history, not as a standalone English question. If the follow-up is short, vague, or pronouns-heavy (e.g. "why that?", "explain", "what about prices?"), ground your answer in the immediately preceding assistant answer.`;

  const sourceList = sources
    .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`)
    .join("\n");

  return `You are Atlas, an AI research assistant for African builders and investors. You help with site selection, market intelligence, property questions, and investment opportunities across southern Africa (South Africa, Zambia, Zimbabwe, Namibia, Botswana).

Your answers should be:
- Specific and grounded — cite real prices, areas, and trends when you know them. Do NOT fabricate data, addresses, or sources.
- Concise — 2-4 short paragraphs by default. Use a conversational, direct tone. No headers, no bullet lists unless the user explicitly asks.
- Honest about uncertainty — if you don't know, say so. Better to admit a gap than to invent.${ctxLine}

${tavilyAnswer ? `A web search returned this synthesized answer (for reference, do NOT parrot verbatim):\n${tavilyAnswer}\n` : "A web search returned no usable data — answer from your own knowledge but stay grounded.\n"}
${sourceList ? `Source URLs (cite inline as [1], [2], etc. when relevant):\n${sourceList}\n` : ""}

Style rules:
- Never use the word "delve". Never start with "Certainly" or "Great question".
- Use South African pricing (ZAR, "R") by default. Mention Zambian Kwacha (ZMW, "K") if the question is about Zambia.
- When you have sources, weave them into the answer naturally with [1], [2] markers. The sources list is provided separately.`;
}

interface FollowupsArgs {
  context: string;
  history: Array<{ role: "user" | "atlas"; text: string }>;
  lastUserMessage: string;
  lastAnswer: string;
}

/**
 * LCP-36 — Generate 2-3 follow-up question chips the user
 * can click to continue the conversation. Uses Gemini with
 * a strict JSON output prompt. Silently returns [] on any
 * failure so the UI gracefully shows no follow-ups.
 */
async function tryGenerateFollowups(args: FollowupsArgs): Promise<string[]> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const trimmedAnswer = args.lastAnswer.slice(0, 1500);
  if (!geminiKey || !trimmedAnswer) return [];

  const prompt = `You are generating follow-up question suggestions for an AI research assistant called Atlas.

The user's original Atlas question (if any): ${args.context || "(no original question — this is a free chat)"}

The most recent user message: ${args.lastUserMessage}

The assistant's most recent answer (truncated):
"""
${trimmedAnswer}
"""

Generate exactly 3 short follow-up questions the user is likely to ask next. Each question must be:
- 4-12 words
- A genuine natural follow-up, not a rephrasing of the prior question
- Grounded in the answer above (something a curious builder or investor would actually want to know next)
- A question, ending in a question mark

Return ONLY a JSON array of 3 strings. No commentary, no markdown fences. Example: ["How much does it cost to build there?", "Is the area safe for families?", "What's the average rental yield?"]`;

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
        responseMimeType: "application/json",
      },
    });
    const followupTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("followups_timeout")), FOLLOWUPS_TIMEOUT_MS),
    );
    const result = (await Promise.race([
      model.generateContent(prompt),
      followupTimeout,
    ])) as Awaited<ReturnType<typeof model.generateContent>>;
    const text = result.response.text().trim();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .slice(0, 3)
        .map((q) => q.trim());
    }
    return [];
  } catch {
    return [];
  }
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

/**
 * LCP-37 — When the user sends a short, pronoun-heavy, or
 * otherwise ambiguous follow-up in an existing conversation,
 * the model often loses the thread and answers a generic
 * global question instead of a question about the prior
 * subject. Example: user asks "Tell me about Gauteng" →
 * assistant explains Gauteng. User then asks "whats it's
 * population?" — model returns GLOBAL population (8.3B)
 * instead of Gauteng's 16M, even though the prior answer
 * contained the exact figure.
 *
 * Fix: detect this pattern and rewrite the user turn to
 * include a brief subject anchor extracted from the prior
 * assistant turn. The model then literally sees the prior
 * subject right before the new question and cannot lose
 * the thread.
 */
/**
 * LCP-37 + LCP-38 — Hard-fix for short follow-up questions.
 *
 * Background: David reported that after asking "Tell me about
 * Gauteng" (which returned a great answer), his follow-up
 * "is it the capital?" returned a Wikipedia definition of
 * "capital" instead of an answer about Gauteng.
 *
 * Root cause analysis (LCP-38):
 *   - LCP-36's systemInstruction + LCP-37's anchor rewrite
 *     helped on fresh questions but not on short follow-ups.
 *   - The real problem: Tavily was running a web search on
 *     the short query "is it the capital?" and returning
 *     generic results about "what is a capital city". The
 *     model then summarized those results instead of the
 *     prior answer's content.
 *
 * Fix (LCP-38): when the new message is a short follow-up
 * AND there is prior conversation history, do TWO things:
 *
 *   1. SKIP the Tavily web search entirely. The prior
 *      answer already contains the relevant facts. No
 *      external search is needed for a clarification.
 *      The caller checks isFollowup to decide this.
 *
 *   2. Pass the FULL prior assistant answer as inline
 *      context in the user turn with explicit grounding
 *      instructions. The model literally sees the prior
 *      answer before the new question.
 */
interface FollowupResult {
  text: string;
  isFollowup: boolean;
  priorAnswer: string | null;
}

function buildFollowupTurn(
  message: string,
  history: Array<{ role: "user" | "atlas"; text: string }>,
  questionContext: string,
): FollowupResult {
  if (questionContext) {
    return { text: message, isFollowup: false, priorAnswer: null };
  }
  if (history.length === 0) {
    return { text: message, isFollowup: false, priorAnswer: null };
  }

  const newLen = message.length;
  const isShort = newLen < 80;
  const followupPatterns = /\b(its|it's|their|them|they|that|this|those|these|there|here|he|she|it|the same|also|and what|and the|how about|what about|why|when|where|who)\b/i;
  const startsWithAnd = /^\s*(and|also|what about|how about|and what|and the|why|when|where)\b/i.test(message);
  const looksLikeFollowup =
    isShort || followupPatterns.test(message) || startsWithAnd;

  if (!looksLikeFollowup) {
    return { text: message, isFollowup: false, priorAnswer: null };
  }

  const lastAssistant = [...history].reverse().find((h) => h.role === "atlas");
  if (!lastAssistant || !lastAssistant.text.trim()) {
    return { text: message, isFollowup: false, priorAnswer: null };
  }

  const priorAnswer = lastAssistant.text.trim();

  // LCP-38 — pass the FULL prior answer as inline context
  // with explicit grounding instructions.
  const rewritten = `Given this prior answer:
"""
${priorAnswer}
"""

The user is asking this follow-up: ${message}

Answer the follow-up based ONLY on the prior answer above. Do not search the web, do not pull in outside definitions, and do not answer the follow-up as if it were a standalone question. If the prior answer contains the information, quote or paraphrase it directly.`;

  return { text: rewritten, isFollowup: true, priorAnswer };
}
