"use client";

/**
 * Day 29 v1 — Full-screen streaming chat modal.
 *
 * LCP-38 — David said "remove the apply to results button
 * entirely". The Apply button is gone. The chat is a research
 * conversation; if the user wants to re-run a result they
 * use the + New button on the result page header.
 *
 * LCP-36 — Perplexity-style:
 *   - Inline source markers ([1], [2]) + follow-up question
 *     chips at the bottom of every answer
 *   - Removed "Try asking" recommendations — chat opens empty
 *     with just a context-aware one-liner
 *   - History persists per questionContext (LCP-35)
 *
 * LCP-37 + LCP-38 — Short follow-up questions are grounded
 * in the full prior assistant answer via the server-side
 * buildFollowupTurn helper in /api/chat and /api/chat/stream.
 * The model literally sees the prior answer before the new
 * question and cannot lose the thread.
 *
 * Architecture: w-[min(960px,95vw)] h-[min(720px,90vh)] centered,
 * SSE-streamed response with typewriter animation, fallback chain
 * Gemini → Tavily → OpenRouter. Reachable from a button next to
 * "+ New" in the top bar.
 */

import { useEffect, useRef, useState } from "react";

interface ChatSource {
  title: string;
  url: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "atlas";
  text: string;
  sources?: ChatSource[];
  followups?: string[];
  ts: number;
  streaming?: boolean;
}

interface FullScreenChatProps {
  open: boolean;
  onClose: () => void;
  initialQuestion?: string;
  questionContext?: string;
}

interface SSEEvent {
  type: "sources" | "token" | "followups" | "done" | "error";
  text?: string;
  sources?: ChatSource[];
  questions?: string[];
  path?: string;
  message?: string;
}

export function FullScreenChat({
  open,
  onClose,
  initialQuestion,
  questionContext,
}: FullScreenChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // LCP-35 — per-question history key. The questionContext
  // (or "default" when no context) is the session ID. Reopening
  // the chat with the same questionContext restores the
  // conversation. Different questions get different keys so
  // each result page has its own chat thread.
  const historyKey = questionContext
    ? `atlas:chat:${questionContext.slice(0, 80)}`
    : "atlas:chat:default";

  // LCP-35 — hydrate messages from localStorage on mount.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(historyKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      }
    } catch {
      // Silent — corrupted history is treated as empty
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, historyKey]);

  // LCP-35 — persist messages to localStorage as they change.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      const persistable = messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        sources: m.sources,
        followups: m.followups,
        ts: m.ts,
      }));
      window.localStorage.setItem(historyKey, JSON.stringify(persistable));
    } catch {
      // Silent — localStorage may be full or disabled
    }
  }, [messages, hydrated, historyKey]);

  // LCP-35 — clear history when questionContext changes
  useEffect(() => {
    if (!hydrated) return;
    setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  // LCP-36 — listen for follow-up chip clicks dispatched by
  // the FollowupChip component. The chip dispatches
  // 'atlas:chat:followup' on window with the question detail.
  // We then call send() to inject it as a user message.
  useEffect(() => {
    if (!open) return;
    function onFollowup(e: Event) {
      const ce = e as CustomEvent<{ question: string }>;
      const q = ce.detail?.question?.trim();
      if (q) {
        // Defer slightly so the chip click animation completes
        // and the chat scrolls into view.
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

    // Add a streaming placeholder for the atlas reply
    const atlasId = `atlas-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: atlasId, role: "atlas", text: "", streaming: true, ts: Date.now() },
    ]);

    // LCP-35 — snapshot history BEFORE adding the new user
    // message. The server already gets the current message in
    // body.message, so we send the prior turns only.
    const historySnapshot = messages
      .filter((m) => !m.streaming)
      .slice(-20) // up to 10 turns
      .map((m) => ({ role: m.role, text: m.text }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          questionContext: questionContext ?? "",
          history: historySnapshot,
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
      let followups: string[] = [];
      let path: string | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventText of events) {
          if (!eventText.trim()) continue;
          const line = eventText
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!line) continue;
          const data = line.slice("data: ".length).trim();
          if (data === "[DONE]") break;
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
            } else if (ev.type === "followups" && ev.questions) {
              followups = ev.questions;
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
          } catch {
            // Skip malformed events
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === atlasId
            ? {
                ...m,
                streaming: false,
                sources: sources.length > 0 ? sources : undefined,
                followups: followups.length > 0 ? followups : undefined,
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
              Live research · sources cited inline
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
          {/* LCP-36 — Removed "Try asking" recommendations. The
              empty state is now a single context-aware line. */}
          {messages.length === 0 && (
            <div className="space-y-2 text-sm text-atlas-muted">
              <p className="text-atlas-text">
                {questionContext
                  ? "Ask Atlas a follow-up about this result — sources will appear inline with the answer."
                  : "Ask Atlas anything about land, property, business intelligence, or investment opportunities across Africa. Sources appear inline."}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <FullScreenChatBubble key={msg.id} msg={msg} />
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
            Press Enter to send · Esc to close · Sources cited inline
          </div>
        </div>
      </div>
    </div>
  );
}

function FullScreenChatBubble({ msg }: { msg: ChatMessage }) {
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
        {/* LCP-36 — render the body with inline source markers
            [1], [2] rendered as small chips that link to the
            source URL. This is the Perplexity pattern. */}
        <div className="whitespace-pre-wrap">
          {renderWithSourceMarkers(msg.text, msg.sources)}
          {msg.streaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-atlas-text align-middle" />
          )}
        </div>

        {/* LCP-36 — Perplexity-style: compact source list under
            the answer with the actual URLs. The inline markers
            above are the quick reference; this is the full
            citation block. */}
        {!isUser && msg.sources && msg.sources.length > 0 && !msg.streaming && (
          <div className="mt-3 space-y-1.5 border-t border-atlas-border/40 pt-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
              Sources ({msg.sources.length})
            </div>
            <ul className="space-y-1">
              {msg.sources.slice(0, 5).map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-1.5 text-xs text-atlas-accent hover:underline"
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

        {/* LCP-38 — David: "remove the apply to results button
            entirely". The Apply button is gone. The chat is
            a research conversation; if the user wants to
            re-run a result they use the + New or Chat button
            on the result page header, not the chat. */}

        {/* LCP-36 — Perplexity-style follow-up question chips.
            Clicking a chip sends that question as the next
            user message — the chat continues the conversation
            naturally. */}
        {!isUser && msg.followups && msg.followups.length > 0 && !msg.streaming && (
          <div className="mt-3 border-t border-atlas-border/40 pt-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
              Related
            </div>
            <div className="flex flex-wrap gap-1.5">
              {msg.followups.map((q, i) => (
                <FollowupChip key={i} question={q} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FollowupChip({ question }: { question: string }) {
  // The chip uses a custom event so the parent can pick it up
  // and submit it. The FullScreenChat component listens for
  // `atlas:chat:followup` on window and calls `send(q)`.
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("atlas:chat:followup", { detail: { question } }),
          );
        }
      }}
      className="rounded-full border border-atlas-border bg-atlas-bg/50 px-3 py-1 text-xs text-atlas-text transition hover:border-atlas-accent/60 hover:bg-atlas-accent/10 hover:text-atlas-accent"
    >
      {question}
    </button>
  );
}

/**
 * LCP-36 — Render body text with [1], [2] source markers
 * turned into inline links. The marker pattern is matched
 * against msg.sources; any un-matched markers (e.g. the
 * server referenced [6] but only 5 sources) are rendered as
 * plain superscripts so the user can see they exist.
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
          className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-atlas-accent/20 px-1 align-middle font-mono text-[10px] text-atlas-accent hover:bg-atlas-accent/30"
          title={source.title}
        >
          [{sourceNum}]
        </a>,
      );
    } else {
      // Source out of range — render as plain text
      parts.push(`[${sourceNum}]`);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
