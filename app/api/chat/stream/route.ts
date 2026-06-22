import { NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchTavilyWebAnswer } from "@/lib/connectors/tavily-search";

/**
 * Day 29 v1 — Streaming chat endpoint.
 *
 * Returns Server-Sent Events (text/event-stream) so the
 * client can typewriter-render the response letter-by-letter
 * like ChatGPT.
 *
 * SSE format:
 *   data: {"type":"sources","sources":[...]}\n\n
 *   data: {"type":"token","text":"hello"}\n\n
 *   data: {"type":"token","text":" world"}\n\n
 *   data: {"type":"done","path":"gemini","sources":[...]}\n\n
 *
 * Stream priority:
 *   1. Gemini streaming — best case, real token-by-token
 *   2. Tavily synthesized answer — chunked into tokens
 *   3. INLINE Tavily direct call (Day 33) — recovers from
 *      connector env-capture bug
 *   4. OpenRouter free-tier — full response chunked
 *   5. Genuine no-data fallback — chunked
 *
 * The client should read the response body as a stream and
 * parse the SSE events. ReadableStream is used to send each
 * event with \n\n delimiters per the SSE spec.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TAVILY_TIMEOUT_MS = 5_000;
const GEMINI_TIMEOUT_MS = 15_000;
const OPENROUTER_TIMEOUT_MS = 7_000;

interface ChatRequestBody {
  message: string;
  questionContext?: string;
  // LCP-35 — full conversation history (excluding the current
  // user message, which the client already includes as `message`).
  // Max 10 turns = 20 messages (user+atlas pairs).
  history?: Array<{ role: "user" | "atlas"; text: string }>;
}

interface SourceItem {
  title: string;
  url: string;
}

function sseEvent(type: string, payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

function chunkString(text: string, chunkSize = 8): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  // Auth gate
  const { userId } = getAuth(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Sign in required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return new Response(
      JSON.stringify({ error: "Missing 'message' field" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const context = (body.questionContext ?? "").trim();

  // Build SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1 — Try Gemini streaming
        const geminiKey = process.env.GEMINI_API_KEY;
        let path: string = "no_data";
        let sources: SourceItem[] = [];
        let geminiStreamed = false;

        if (geminiKey) {
          try {
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            // LCP-35 — wire conversation history into Gemini so
            // follow-up questions ('why Durbanville?') are
            // grounded in the prior context. The client sends
            // up to 10 prior turns; Gemini gets the system
            // context as the first 'user' turn (so it carries
            // context) plus the history and the current message.
            const historyContents = (body.history ?? []).map((h) => ({
              role: h.role === "user" ? "user" : "model",
              parts: [{ text: h.text }],
            }));
            const allContents = [
              ...historyContents,
              { role: "user" as const, parts: [{ text: buildGeminiPrompt(message, context) }] },
            ];
            const geminiStreamResult = model.generateContentStream({
              contents: allContents,
            });

            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("gemini_timeout")),
                GEMINI_TIMEOUT_MS,
              ),
            );

            let buffer = "";
            const streamIter = (await Promise.race([
              geminiStreamResult,
              timeoutPromise,
            ])) as unknown as AsyncIterable<{ text(): string }>;

            for await (const chunk of streamIter as AsyncIterable<{ text(): string }>) {
              const text = chunk.text();
              if (text) {
                buffer += text;
                controller.enqueue(
                  encoder.encode(sseEvent("token", { text })),
                );
              }
            }
            // If we got here without throwing, Gemini streamed
            // at least one chunk. path = "gemini".
            if (buffer.length > 0) {
              path = "gemini";
              geminiStreamed = true;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[/api/chat/stream] gemini error:", msg);
            // Fall through to Tavily
          }
        }

        // Step 2 — If Gemini didn't stream, try Tavily (connector
        // then inline backup) then OpenRouter, chunking the
        // result into SSE tokens.
        if (!geminiStreamed) {
          let tavilyAnswer = "";
          let tavilySources: SourceItem[] = [];

          // Connector call
          const tavilyQuery = context
            ? `${message} (context: ${context})`
            : message;
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
            if (tavilyResult) {
              tavilyAnswer = tavilyResult.answer ?? "";
              tavilySources = tavilyResult.sources.map((s) => ({
                title: s.title,
                url: s.url,
              }));
            }
          } catch (err) {
            console.warn("[/api/chat/stream] tavily connector:", err);
          }

          // Inline Tavily backup (Day 33) if connector returned null
          if (!tavilyAnswer && tavilySources.length === 0) {
            const inlineKey = process.env.TAVILY_API_KEY ?? "";
            if (inlineKey) {
              try {
                const inlineController = new AbortController();
                const inlineTimeout = setTimeout(
                  () => inlineController.abort(),
                  TAVILY_TIMEOUT_MS,
                );
                const inlineRes = await fetch(
                  "https://api.tavily.com/search",
                  {
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
                      max_results: 5,
                      topic: "general",
                    }),
                    signal: inlineController.signal,
                    cache: "no-store",
                  },
                );
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
                }
              } catch (err) {
                console.warn("[/api/chat/stream] inline tavily:", err);
              }
            }
          }

          // Chunk-stream whatever we have
          if (tavilyAnswer.length > 0) {
            path = "tavily_answer";
            sources = tavilySources;
            for (const chunk of chunkString(tavilyAnswer, 6)) {
              controller.enqueue(
                encoder.encode(sseEvent("token", { text: chunk })),
              );
              // small delay so it feels like streaming
              await sleep(15);
            }
          } else if (tavilySources.length > 0) {
            path = "tavily_sources";
            sources = tavilySources;
            const sourceList = tavilySources
              .slice(0, 3)
              .map((s, i) => `[${i + 1}] ${s.title}`)
              .join("\n");
            const text = `I found live web data on this topic. Most relevant sources:\n\n${sourceList}\n\nClick any citation below for the full article.`;
            for (const chunk of chunkString(text, 6)) {
              controller.enqueue(
                encoder.encode(sseEvent("token", { text: chunk })),
              );
              await sleep(15);
            }
          } else {
            // OpenRouter fallback
            const openrouterKey = process.env.OPENROUTER_API_KEY;
            if (openrouterKey) {
              try {
                const orController = new AbortController();
                const orTimeout = setTimeout(
                  () => orController.abort(),
                  OPENROUTER_TIMEOUT_MS,
                );
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
                      // LCP-35 — include history so the
                      // fallback LLM has the same conversation
                      // memory as Gemini would. Plus the
                      // question context as the second system
                      // message so the LLM knows the city/
                      // vertical even if Gemini failed.
                      messages: [
                        {
                          role: "system",
                          content:
                            "You are Atlas, an AI assistant for African builders and investors. Be brief, specific, and grounded. If you don't know, say so. Keep it under 200 words.",
                        },
                        ...(context
                          ? [
                              {
                                role: "system" as const,
                                content: `Question context (the user's original question on Atlas):\n${context}`,
                              },
                            ]
                          : []),
                        // Conversation history (max 10 turns)
                        ...((body.history ?? []).map((h) => ({
                          role: h.role === "user" ? ("user" as const) : ("assistant" as const),
                          content: h.text,
                        }))),
                        { role: "user" as const, content: message },
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
                  if (orText.length >= 10) {
                    path = "openrouter";
                    const text = `${orText}\n\n_Note: this came from a free-tier fallback model (GPT-OSS 20B), not Atlas's primary research engine._`;
                    for (const chunk of chunkString(text, 6)) {
                      controller.enqueue(
                        encoder.encode(sseEvent("token", { text: chunk })),
                      );
                      await sleep(15);
                    }
                  }
                }
              } catch (err) {
                console.warn("[/api/chat/stream] openrouter:", err);
              }
            }
            // If we still have nothing, fall to no-data
            if (path === "no_data") {
              const text =
                "I couldn't reach a live web data source right now. " +
                "Tavily, Gemini, and OpenRouter all returned empty. " +
                "Try a more specific question or check back in a few minutes.";
              for (const chunk of chunkString(text, 6)) {
                controller.enqueue(
                  encoder.encode(sseEvent("token", { text: chunk })),
                );
                await sleep(15);
              }
            }
          }
        }

        // Send final done event with sources + path
        if (sources.length > 0) {
          controller.enqueue(
            encoder.encode(sseEvent("sources", { sources })),
          );
        }
        controller.enqueue(
          encoder.encode(sseEvent("done", { path })),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        console.error("[/api/chat/stream] fatal:", err);
        controller.enqueue(
          encoder.encode(
            sseEvent("error", {
              message: err instanceof Error ? err.message : String(err),
            }),
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildGeminiPrompt(message: string, context: string): string {
  return `You are Atlas, an AI assistant that helps African builders and investors with site selection, market intelligence, and investment opportunities.

The user originally asked: ${context || "(no prior context)"}

They are now asking: ${message}

Your task:
- Answer in 2-4 short paragraphs.
- Be specific and grounded — don't fabricate data, prices, or sources.
- Keep the tone conversational and direct. No headers, no bullet lists unless the user explicitly asks.

Answer:`;
}
