"use client";

/**
 * Day 28 — Result-page chat panel.
 *
 * LCP-36 — major UI upgrade:
 *   - Apply to results on EVERY atlas message (not only refined)
 *   - Perplexity-style: inline source markers ([1], [2]) + follow-up
 *     question chips at the bottom of every answer
 *   - Removed "Try asking" recommendations — chat opens empty with
 *     just a context-aware one-liner
 *   - History is in-memory only (the full-screen chat persists to
 *     localStorage, this panel doesn't because it's transient and
 *     dismissable from the result page)
 *   - Server now sends applyQuery on every response; we use it as
 *     the apply target instead of the old refinedQuery heuristic
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
  // LCP-36 — applyQuery is set on every atlas response. The
  // apply button uses this. Default = questionContext.
  applyQuery?: string;
  followups?: string[];
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

  // LCP-36 — listen for follow-up chip clicks. The chip
  // dispatches 'atlas:chat:followup' on window; we then call
  // send() to inject it as a new user message.
  useEffect(() => {
    if (!open) return;
    function onFollowup(e: Event) {
      const ce = e as CustomEvent<{ question: string }>;
      const q = ce.detail?.question?.trim();
      if (q) {
        setTimeout(() => void send(q), 50);
      }
    }
    window.addEventListener("atlas:chat:followup", onFollowup);
    return () => window.removeEventListener("atlas:chat:followup", onFollowup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sending, messages]);

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

    // LCP-36 — send history so follow-ups like 'why that?' are
    // grounded in the prior conversation. Snapshot BEFORE
    // adding the new user message.
    const historySnapshot = messages
      .slice(-20)
      .map((m) => ({ role: m.role, text: m.text }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          questionContext: buildContext(questionContext, rankedSites),
          history: historySnapshot,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      // LCP-36 — applyQuery and followups come from the server
      // on every response. The apply button uses applyQuery;
      // the related chips render followups.
      const atlasMsg: ChatMessage = {
        id: `atlas-${Date.now()}`,
        role: "atlas",
        text: data.answer ?? "I couldn't reach a research model right now.",
        sources: data.sources ?? [],
        applyQuery: data.applyQuery ?? questionContext ?? text,
        followups: data.followups,
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
        applyQuery: questionContext ?? text,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  const applyToResults = async (applyQuery: string) => {
    setApplying(applyQuery);
    try {
      // Day 29 v2 — David reported "we clicked apply to result
      // and go defaulted to a no data Lusaka". Root cause was
      // the cascade running detectCity() on ONLY the refined
      // query (e.g. "what about in Joburg") which, combined
      // with all upstream models failing, fell through to
      // curatedStub with no Joburg match → Lusaka fallback.
      //
      // Fix: build a composite question that keeps the
      // original context as the primary city signal. The
      // refined query comes first so the AI sees it as the
      // new question, but the original question is included
      // for city detection.
      const composedQuestion =
        questionContext && applyQuery !== questionContext
          ? `${applyQuery} (originally: ${questionContext})`
          : applyQuery;
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical,
          question: composedQuestion,
          model: "gemini-search",
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.id) {
        router.push(`/result/${data.id}?from=chat`);
      }
    } catch (err) {
      console.error("Failed to apply:", err);
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
                Live research · sources cited inline
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
            {/* LCP-36 — Removed "Try asking" recommendations.
                Empty state is now a single context-aware line. */}
            {messages.length === 0 && (
              <div className="space-y-2 text-xs text-atlas-muted">
                <p className="text-atlas-text">
                  Ask Atlas a follow-up about this result — sources appear inline with the answer.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                onApply={applyToResults}
                applying={applying === msg.applyQuery}
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
              Press Enter to send · Sources cited inline
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
  onApply: (applyQuery: string) => void;
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
        {/* LCP-36 — render body with inline source markers
            turned into clickable chips. Perplexity pattern. */}
        <div className="whitespace-pre-wrap">
          {renderWithSourceMarkers(msg.text, msg.sources)}
        </div>

        {/* Sources */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-atlas-border/40 pt-2">
            <div className="font-mono text-[9px] uppercase tracking-wider text-atlas-muted">
              Sources ({msg.sources.length})
            </div>
            <ul className="space-y-1">
              {msg.sources.slice(0, 4).map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-1 text-[10px] text-atlas-accent hover:underline"
                    title={s.title}
                  >
                    <span className="font-mono text-atlas-muted">[{i + 1}]</span>
                    <span className="truncate">{s.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* LCP-36 — Apply to results on EVERY atlas message. */}
        {!isUser && msg.applyQuery && (
          <div className="mt-2 border-t border-atlas-border/40 pt-2">
            <button
              type="button"
              onClick={() => onApply(msg.applyQuery!)}
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

        {/* LCP-36 — Perplexity-style follow-up question chips. */}
        {!isUser && msg.followups && msg.followups.length > 0 && (
          <div className="mt-2 border-t border-atlas-border/40 pt-2">
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-atlas-muted">
              Related
            </div>
            <div className="flex flex-wrap gap-1">
              {msg.followups.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    // Bubble the click via the parent's send by
                    // dispatching a custom event the panel
                    // listens for. The send function adds the
                    // text as a new user message and calls
                    // /api/chat.
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("atlas:chat:followup", {
                          detail: { question: q },
                        }),
                      );
                    }
                  }}
                  className="rounded-full border border-atlas-border bg-atlas-bg/50 px-2.5 py-0.5 text-[10px] text-atlas-text transition hover:border-atlas-accent/60 hover:bg-atlas-accent/10 hover:text-atlas-accent"
                >
                  {q}
                </button>
              ))}
            </div>
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

/**
 * LCP-36 — render body text with [1], [2] source markers
 * turned into inline links.
 */
function renderWithSourceMarkers(
  text: string,
  sources?: ChatSource[],
): React.ReactNode[] {
  if (!text) return [];
  const sourcePattern = /\[(\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = sourcePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const sourceNum = parseInt(match[1], 10);
    const source = sources?.[sourceNum - 1];
    if (source) {
      parts.push(
        <a
          key={`src-${key++}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-3.5 min-w-[1rem] items-center justify-center rounded bg-atlas-accent/20 px-1 align-middle font-mono text-[9px] text-atlas-accent hover:bg-atlas-accent/30"
          title={source.title}
        >
          [{sourceNum}]
        </a>,
      );
    } else {
      parts.push(`[${sourceNum}]`);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
