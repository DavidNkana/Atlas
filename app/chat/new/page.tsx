"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

/**
 * Day 18 — /chat/new — Start a new Perplexity-style chat.
 *
 * Single text input. On submit, POSTs to /api/chat (which always
 * uses Tavily + Gemini as the chat engine). On success, navigates
 * to /chat/[threadId] where the assistant's response is already
 * rendered as the first message.
 */
export default function ChatNewPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in?redirect_url=/chat/new");
    }
  }, [isLoaded, isSignedIn, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push(`/chat/${data.threadId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-atlas-bg p-6 text-atlas-text">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Ask Atlas anything.
          </h1>
          <p className="mt-2 text-sm text-atlas-muted">
            Conversational research backed by live web sources. Click
            "View data" on any answer to see it as a map with signals.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Which African city is best for expanding my fintech?"
            rows={4}
            autoFocus
            disabled={submitting}
            className="w-full resize-none rounded-xl border border-atlas-border bg-atlas-surface p-4 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-atlas-muted">
              Powered by Tavily web search + Gemini 2.0 Flash reasoning.
            </div>
            <button
              type="submit"
              disabled={!content.trim() || submitting}
              className="rounded-md bg-atlas-accent px-4 py-2 text-sm font-medium text-white hover:bg-atlas-accent2 disabled:opacity-50"
            >
              {submitting ? "Thinking…" : "Ask Atlas"}
            </button>
          </div>
          {error && (
            <div className="rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-200">
              {error}
            </div>
          )}
        </form>

        <div className="grid gap-2 sm:grid-cols-2">
          {[
            "Which province has the fastest-growing middle class?",
            "Which African city is best for a fintech expansion?",
            "Why Lusaka for a stadium?",
            "What is Atlas?",
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setContent(q)}
              className="rounded-lg border border-atlas-border bg-atlas-surface px-3 py-2 text-left text-xs text-atlas-muted hover:border-atlas-accent hover:text-atlas-text"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
