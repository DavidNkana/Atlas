"use client";

/**
 * Day 29 v1 — Full-screen streaming chat modal.
 *
 * Larger, centered, full-height. Uses the same chat UX as
 * ResultChatPanel but with:
 *   - w-[min(960px,95vw)] h-[min(720px,90vh)] centered
 *   - SSE-streamed response with typewriter animation
 *   - Same fallback chain (Gemini → Tavily → OpenRouter)
 *   - Apply-to-results button on every refined query
 *
 * Reachable from a button next to "+ New" in the top bar.
 * Also reachable from ResultChatPanel's "Open in full chat"
 * button (Day 29 v2 — Phase 2).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ChatSource {
  title: string;
  url: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "atlas";
  text: string;
  sources?: ChatSource[];
  refinedQuery?: string;
  ts: number;
  streaming?: boolean;
}

interface FullScreenChatProps {
  open: boolean;
  onClose: () => void;
  initialQuestion?: string;
  questionContext?: string;
  vertical?: string;
  rankedSites?: Array<{ name: string; suburb?: string }>;
}

interface SSEEvent {
  type: "sources" | "token" | "done" | "error";
  text?: string;
  sources?: ChatSource[];
  path?: string;
  message?: string;
}

export function FullScreenChat({
  open,
  onClose,
  initialQuestion,
  questionContext,
  vertical,
  rankedSites,
}: FullScreenChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send initial question on open (if provided)
  useEffect(() => {
    if (open && initialQuestion && messages.length === 0) {
      void send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuestion]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Abort in-flight request on close
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    if (!overrideText) setInput("");

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    // Add a streaming placeholder for the atlas reply
    const atlasId = `atlas-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: atlasId, role: "atlas", text: "", streaming: true, ts: Date.now() },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          questionContext: buildContext(questionContext, rankedSites),
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";
      let sources: ChatSource[] = [];
      let path: string | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE events are separated by \n\n
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventText of events) {
          if (!eventText.trim()) continue;
          // Each event line starts with "data: "
          const line = eventText
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!line) continue;
          const data = line.slice("data: ".length).trim();
          if (data === "[DONE]") {
            // Stream complete
            break;
          }
          try {
            const ev = JSON.parse(data) as SSEEvent;
            if (ev.type === "token" && ev.text) {
              accumulatedText += ev.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === atlasId
                    ? { ...m, text: accumulatedText }
                    : m,
                ),
              );
            } else if (ev.type === "sources" && ev.sources) {
              sources = ev.sources;
            } else if (ev.type === "done") {
              path = ev.path;
            } else if (ev.type === "error") {
              accumulatedText += `\n\n[error: ${ev.message}]`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === atlasId
                    ? { ...m, text: accumulatedText }
                    : m,
                ),
              );
            }
          } catch (parseErr) {
            // Skip malformed events
          }
        }
      }

      // Finalize: strip streaming flag, attach sources + refined query
      const refinedQuery = detectRefinedQuery(text, questionContext ?? "");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === atlasId
            ? {
                ...m,
                streaming: false,
                sources: sources.length > 0 ? sources : undefined,
                refinedQuery,
              }
            : m,
        ),
      );
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === atlasId
            ? {
                ...m,
                text: m.text || `Couldn't reach the chat service: ${errMsg}`,
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const applyToResults = async (refinedQuery: string) => {
    setApplying(refinedQuery);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical: vertical ?? "residential_land",
          question: refinedQuery,
          model: "gemini-search",
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.id) {
        // Day 29 fix — navigate to /result/[id]?chat=1 so the
        // page knows to keep the chat panel open with the new
        // result context, instead of landing on a generic
        // /result/[id] page that has no question context and
        // cascade falls back to "no data Lusaka".
        router.push(`/result/${data.id}?from=chat`);
        onClose();
      }
    } catch (err) {
      console.error("Failed to apply refinement:", err);
    } finally {
      setApplying(null);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Atlas Chat"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex w-full max-w-[960px] h-[min(720px,90vh)] flex-col overflow-hidden rounded-xl border border-atlas-border bg-atlas-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-atlas-border bg-atlas-surface px-6 py-4">
          <div>
            <div className="text-base font-semibold text-atlas-text">
              Atlas Chat
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
              Live research · Tavily + Gemini + OpenRouter fallback
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded text-atlas-muted hover:bg-atlas-bg hover:text-atlas-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="space-y-3 text-sm text-atlas-muted">
              <p className="text-atlas-text">
                Ask Atlas anything about land development, real estate, business
                intelligence, or investment opportunities across Africa.
              </p>
              <p className="text-xs">Try asking:</p>
              <ul className="ml-4 list-disc space-y-1 text-xs">
                <li>&ldquo;What about a 2,000 sqm plot in Sandton?&rdquo;</li>
                <li>&ldquo;Compare Lusaka vs Nairobi for a retail business&rdquo;</li>
                <li>&ldquo;What land-use rules apply to commercial in Cape Town?&rdquo;</li>
                <li>&ldquo;What are the current logistics costs from Durban port to Zambia?&rdquo;</li>
              </ul>
            </div>
          )}

          {messages.map((msg) => (
            <FullScreenChatBubble
              key={msg.id}
              msg={msg}
              onApply={applyToResults}
              applying={applying === msg.refinedQuery}
            />
          ))}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-atlas-border bg-atlas-surface p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask Atlas anything…"
              disabled={sending}
              className="flex-1 rounded border border-atlas-border bg-atlas-bg px-4 py-3 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              className="rounded bg-atlas-accent px-5 py-3 text-sm font-semibold uppercase tracking-wider text-white transition hover:bg-atlas-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
            Press Enter to send · Esc to close · Sources appear inline
          </div>
        </div>
      </div>
    </div>
  );
}

function FullScreenChatBubble({
  msg,
  onApply,
  applying,
}: {
  msg: ChatMessage;
  onApply: (refinedQuery: string) => void;
  applying: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-atlas-accent text-white"
            : "bg-atlas-surface text-atlas-text"
        }`}
      >
        <div className="whitespace-pre-wrap">
          {msg.text}
          {msg.streaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-atlas-text align-middle" />
          )}
        </div>

        {/* Sources */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-atlas-border/40 pt-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
              Sources ({msg.sources.length})
            </div>
            <ul className="space-y-1.5">
              {msg.sources.slice(0, 5).map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs text-atlas-accent hover:underline"
                    title={s.title}
                  >
                    [{i + 1}] {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Apply to results — only on atlas messages with refinedQuery */}
        {!isUser && msg.refinedQuery && !msg.streaming && (
          <div className="mt-3 border-t border-atlas-border/40 pt-3">
            <button
              type="button"
              onClick={() => onApply(msg.refinedQuery!)}
              disabled={applying}
              className="inline-flex items-center gap-1.5 rounded border border-atlas-accent/60 bg-atlas-accent/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? (
                "Applying…"
              ) : (
                <>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Apply to results
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function buildContext(
  originalQuestion?: string,
  rankedSites?: Array<{ name: string; suburb?: string }>,
): string {
  const parts: string[] = [];
  if (originalQuestion) parts.push(`Original question: ${originalQuestion}`);
  if (rankedSites && rankedSites.length > 0) {
    const siteList = rankedSites
      .slice(0, 5)
      .map((s) => `- ${s.name}${s.suburb ? ` (${s.suburb})` : ""}`)
      .join("\n");
    parts.push(`Top results:\n${siteList}`);
  }
  return parts.join("\n\n");
}

function detectRefinedQuery(
  message: string,
  context: string,
): string | undefined {
  // Heuristic: if the user mentions a new city, size, or specific
  // location keywords, treat it as a refined site query.
  const hasRefinementKeyword =
    /\b(gauteng|sandton|cape town|lusaka|johannesburg|durban|pretoria|nairobi|kampala|accra|lagos|abidjan|harare|maputo|gaborone|windhoek|kigali|2[0-9]{3}\s*(sqm|m2|square|m\xB2)|hectare|ha\b|commercial|residential|industrial|retail|warehouse)\b/i.test(
      message,
    );
  if (!hasRefinementKeyword) return undefined;
  // If the message already contains the original context, don't double-up
  if (!context) return message;
  const contextWords = new Set(
    context.toLowerCase().split(/\s+/).filter((w) => w.length > 4),
  );
  const messageWords = message.toLowerCase().split(/\s+/);
  const overlap = messageWords.filter((w) => contextWords.has(w)).length;
  if (overlap >= 3) return message;
  return `${message} (originally: ${context})`;
}
