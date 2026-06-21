"use client";

/**
 * Day 28 — Result-page chat panel.
 *
 * Floating button bottom-right "Ask Atlas" → opens a slide-up
 * panel. User can:
 *   - Ask chat-style follow-ups ("why this?", "compare with Sandton")
 *   - Refine the query ("what about in Gauteng for 2000 sqm")
 *   - Apply refinements back to /api/ask → result page updates
 *
 * Data flow:
 *   - Chat messages → /api/chat (server route, Tavily+Gemini)
 *   - "Apply to results" button → router.push(/result/[newId])
 *   - All message state is local React state (no DB persistence
 *     yet — keep chat ephemeral so David can decide later if he
 *     wants it persisted)
 *
 * Mounting: rendered on every /result/[id] page via the page
 * component. Self-contained — no global state, no context.
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
}

interface ResultChatPanelProps {
  /** The original question that produced the current /result page. */
  questionContext: string;
  /** Current vertical (so refinements preserve it). */
  vertical: string;
  /** Existing ranked sites — used to give Atlas context for follow-ups. */
  rankedSites?: Array<{ name: string; suburb?: string }>;
}

export function ResultChatPanel({
  questionContext,
  vertical,
  rankedSites,
}: ResultChatPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          questionContext: buildContext(questionContext, rankedSites),
        }),
        cache: "no-store",
      });
      const data = await res.json();
      const atlasMsg: ChatMessage = {
        id: `atlas-${Date.now()}`,
        role: "atlas",
        text: data.answer ?? "I couldn't reach a research model right now.",
        sources: data.sources ?? [],
        refinedQuery: data.refinedQuery,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, atlasMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: `atlas-${Date.now()}`,
        role: "atlas",
        text:
          err instanceof Error
            ? `Couldn't reach the chat service: ${err.message}`
            : "Couldn't reach the chat service.",
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  const applyToResults = async (refinedQuery: string) => {
    setApplying(refinedQuery);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical,
          question: refinedQuery,
          model: "gemini-search",
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.id) {
        router.push(`/result/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to apply refinement:", err);
    } finally {
      setApplying(null);
    }
  };

  return (
    <>
      {/* Floating button (always visible) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Ask Atlas" : "Open Ask Atlas"}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full border border-atlas-accent bg-atlas-accent text-white shadow-lg transition hover:bg-atlas-accent/90"
      >
        {open ? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Slide-up panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Ask Atlas"
          className="fixed bottom-24 right-6 z-30 flex h-[32rem] w-[28rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-atlas-border bg-atlas-bg shadow-2xl"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-atlas-border bg-atlas-surface px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-atlas-text">
                Ask Atlas
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
                Tavily live + Gemini synthesis
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded text-atlas-muted hover:bg-atlas-bg hover:text-atlas-text"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-4"
          >
            {messages.length === 0 && (
              <div className="space-y-2 text-xs text-atlas-muted">
                <p>
                  Try asking follow-ups like:
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>&ldquo;Why did you pick {rankedSites?.[0]?.name ?? "this site"}?&rdquo;</li>
                  <li>&ldquo;What about in Sandton instead?&rdquo;</li>
                  <li>&ldquo;Compare with Cape Town schools&rdquo;</li>
                  <li>&ldquo;How much does a 2,000 sqm plot cost here?&rdquo;</li>
                </ul>
                <p className="pt-2">
                  Answers pull live data from Tavily and synthesize with Gemini.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                onApply={applyToResults}
                applying={applying === msg.refinedQuery}
              />
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-atlas-surface px-3 py-2 text-xs text-atlas-muted">
                  <span className="inline-block animate-pulse">
                    Atlas is searching and reasoning
                  </span>
                  <span className="ml-1 inline-flex gap-0.5">
                    <span className="animate-bounce">.</span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    >
                      .
                    </span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    >
                      .
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-atlas-border bg-atlas-surface p-3">
            <div className="flex gap-2">
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
                className="flex-1 rounded border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !input.trim()}
                className="rounded bg-atlas-accent px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-atlas-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-atlas-muted">
              Press Enter to send · Sources appear inline
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChatBubble({
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
        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? "bg-atlas-accent text-white"
            : "bg-atlas-surface text-atlas-text"
        }`}
      >
        <div className="whitespace-pre-wrap">{msg.text}</div>

        {/* Sources */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-atlas-border/40 pt-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-atlas-muted">
              Sources
            </div>
            <ul className="space-y-1">
              {msg.sources.slice(0, 4).map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-[10px] text-atlas-accent hover:underline"
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
        {!isUser && msg.refinedQuery && (
          <div className="mt-2 border-t border-atlas-border/40 pt-2">
            <button
              type="button"
              onClick={() => onApply(msg.refinedQuery!)}
              disabled={applying}
              className="inline-flex items-center gap-1.5 rounded border border-atlas-accent/60 bg-atlas-accent/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-atlas-accent transition hover:bg-atlas-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
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
  originalQuestion: string,
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
