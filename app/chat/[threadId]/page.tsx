"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  question?: string | null;
  intent?: string | null;
  sources?: Array<{ title?: string; url: string }>;
  spatialQuestionId?: string | null;
  spatialModel?: string | null;
  createdAt: string;
}

interface ThreadData {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

const SPATIAL_MODEL_OPTIONS = [
  { id: "gemini-search", label: "Gemini Search", description: "Google Search grounding (rate-limited today)" },
  { id: "gemini-flash", label: "Gemini 2.0 Flash", description: "Direct Gemini, no search engine" },
  { id: "llama-free", label: "Llama 3.3 70B (free)", description: "OpenRouter free tier" },
  { id: "curated-stub", label: "Atlas curated (offline)", description: "Real coordinates, no LLM" },
];

/**
 * Day 18 — /chat/[threadId] — Perplexity-style threaded chat.
 *
 * Scrollable thread of user + assistant messages. Assistant messages
 * have:
 *   - prose answer
 *   - "Sources (N)" with clickable citations
 *   - "View data" button → opens a modal with model picker → calls
 *     /api/messages/[id]/view-data → on success navigates to
 *     /result/[questionId]
 *
 * Follow-up input at the bottom calls /api/chat with the threadId
 * so the conversation continues in the same thread.
 */
export default function ChatThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [data, setData] = useState<ThreadData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [followup, setFollowup] = useState("");
  const [sending, setSending] = useState(false);
  const [viewDataOpenFor, setViewDataOpenFor] = useState<string | null>(null);
  const [viewDataModel, setViewDataModel] = useState("gemini-search");
  const [viewDataLoading, setViewDataLoading] = useState(false);
  const [viewDataError, setViewDataError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    params.then((p) => setThreadId(p.threadId));
  }, [params]);

  useEffect(() => {
    if (!isLoaded || !threadId) return;
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=/chat/${threadId}`);
      return;
    }
    refresh();
  }, [isLoaded, isSignedIn, threadId, router]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive.
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages?.length]);

  async function refresh() {
    if (!threadId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/threads/${threadId}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function sendFollowup(e: React.FormEvent) {
    e.preventDefault();
    if (!followup.trim() || sending || !threadId) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, content: followup.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setFollowup("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function runViewData(messageId: string) {
    setViewDataLoading(true);
    setViewDataError(null);
    try {
      const res = await fetch(`/api/messages/${messageId}/view-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: viewDataModel }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      router.push(`/result/${j.questionId}`);
    } catch (e) {
      setViewDataError(e instanceof Error ? e.message : String(e));
      setViewDataLoading(false);
    }
  }

  if (loading || !isLoaded || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-atlas-bg text-atlas-muted">
        {error ? error : "Loading chat…"}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-atlas-bg text-atlas-text">
      <header className="flex shrink-0 items-center justify-between border-b border-atlas-border bg-atlas-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-xs text-atlas-muted hover:text-atlas-accent">
            ← Dashboard
          </a>
          <h1 className="truncate text-sm font-semibold">{data.title}</h1>
        </div>
        <a
          href="/chat/new"
          className="rounded-md border border-atlas-border bg-atlas-bg px-3 py-1 text-xs text-atlas-text hover:border-atlas-accent"
        >
          + New chat
        </a>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {data.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-atlas-accent px-4 py-3 text-sm text-white">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[90%] space-y-3 rounded-2xl rounded-tl-sm border border-atlas-border bg-atlas-surface px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-atlas-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-atlas-accent">
                      Atlas
                    </span>
                    {m.intent && (
                      <span className="rounded-full border border-atlas-border bg-atlas-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-atlas-muted">
                        {m.intent}
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {m.content}
                  </div>

                  {m.sources && m.sources.length > 0 && (
                    <details className="rounded-lg border border-atlas-border bg-atlas-bg p-3">
                      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-atlas-muted">
                        Sources ({m.sources.length})
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {m.sources.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <span className="mt-0.5 font-mono text-[10px] text-atlas-muted">[{i + 1}]</span>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-atlas-text hover:text-atlas-accent"
                            >
                              {s.title ?? s.url}
                              <span className="ml-1 text-[10px] text-atlas-muted">↗</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {/* View Data button — opens model picker modal */}
                  {m.question && (
                    <div className="border-t border-atlas-border pt-3">
                      {m.spatialQuestionId ? (
                        <a
                          href={`/result/${m.spatialQuestionId}`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-atlas-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-atlas-accent2"
                        >
                          View spatial data ({m.spatialModel?.replace(/-/g, " ")}) ↗
                        </a>
                      ) : (
                        <button
                          onClick={() => {
                            setViewDataOpenFor(m.id);
                            setViewDataError(null);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-atlas-accent/40 bg-atlas-accent/10 px-3 py-1.5 text-xs font-medium text-atlas-accent hover:bg-atlas-accent/20"
                          data-testid="view-data-button"
                        >
                          View data on map
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      {/* Follow-up input */}
      <div className="shrink-0 border-t border-atlas-border bg-atlas-surface px-4 py-3">
        <form onSubmit={sendFollowup} className="mx-auto flex max-w-3xl gap-2">
          <input
            value={followup}
            onChange={(e) => setFollowup(e.target.value)}
            placeholder="Ask a follow-up…"
            disabled={sending}
            className="flex-1 rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!followup.trim() || sending}
            className="rounded-md bg-atlas-accent px-4 py-2 text-sm font-medium text-white hover:bg-atlas-accent2 disabled:opacity-50"
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>

      {/* View Data modal — model picker */}
      {viewDataOpenFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !viewDataLoading && setViewDataOpenFor(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-atlas-border bg-atlas-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">View data on map</h2>
            <p className="mt-1 text-xs text-atlas-muted">
              Atlas will run the spatial engine with the model you pick,
              then open the result page with map, sites, and live signals.
            </p>
            <div className="mt-4 space-y-2">
              {SPATIAL_MODEL_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors ${
                    viewDataModel === opt.id
                      ? "border-atlas-accent bg-atlas-accent/10"
                      : "border-atlas-border bg-atlas-bg hover:border-atlas-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="spatial-model"
                    value={opt.id}
                    checked={viewDataModel === opt.id}
                    onChange={() => setViewDataModel(opt.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[11px] text-atlas-muted">{opt.description}</div>
                  </div>
                </label>
              ))}
            </div>
            {viewDataError && (
              <div className="mt-3 rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-200">
                {viewDataError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setViewDataOpenFor(null)}
                disabled={viewDataLoading}
                className="rounded-md border border-atlas-border bg-atlas-bg px-3 py-1.5 text-xs text-atlas-text hover:border-atlas-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => viewDataOpenFor && runViewData(viewDataOpenFor)}
                disabled={viewDataLoading}
                className="rounded-md bg-atlas-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-atlas-accent2 disabled:opacity-50"
              >
                {viewDataLoading ? "Loading…" : "Open spatial view ↗"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
