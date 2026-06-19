"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { ChatGPTThinking } from "@/components/ChatGPTThinking";

/**
 * Atlas — Home.
 *
 * Day 19 v3: Perplexity-shape shell.
 *   - Left rail (Sidebar) with logo, +New, History, user
 *   - Center hero with greeting
 *   - ONE command bar: question input + submit button
 *   - NO vertical picker, NO model picker, NO verdict selection.
 *
 * Every question goes to /api/chat (Tavily + Gemini, hidden behind
 * the scenes). The result page (/chat/[threadId]) is the Perplexity-
 * style answer with prose + sources + View Data button.
 *
 * The "atlas:new" CustomEvent still fires from the Sidebar's +New
 * button to reset the input.
 */

export default function HomePage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [question, setQuestion] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // On mount: focus the input so the user can type immediately.
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Reset the command bar when the Sidebar fires "atlas:new"
  useEffect(() => {
    function onNew() {
      setQuestion("");
      setError(null);
      setLoading(false);
      if (typeof window !== "undefined")
        window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("atlas:new", onNew);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("atlas:new", onNew);
      }
    };
  }, []);

  // Auto-focus the input on first mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Listen for "atlas:use-example" events from the OutOfScopeModal
  // so clicking an example in the modal fills the input.
  useEffect(() => {
    function onUseExample(e: Event) {
      const ce = e as CustomEvent<string>;
      if (typeof ce.detail === "string") {
        setQuestion(ce.detail);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("atlas:use-example", onUseExample);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("atlas:use-example", onUseExample);
      }
    };
  }, []);

  // Day 19 v3: model picker removed from home page. No more click-
  // outside listeners, no more flip-up logic. The only model picker
  // in the product is the View Data modal on /chat/[threadId].

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    // Day 19: ONE unified input box. Every question — whether
    // "Where in Sandton for a restaurant" or "Which province has the
    // fastest-growing middle class" — goes to /api/chat. Tavily +
    // Gemini handle the prose answer behind the scenes. The user
    // clicks "View data on map" at the end of the chat answer to
    // trigger the spatial view (/api/ask + /result/[id]) if they
    // want map + signals.
    //
    // No more out-of-scope gate. No more vertical mismatch gate.
    // No more model picker for chat. Per David's call.
    await submitToChat();
  }

  /**
   * Day 19: chat submission helper. ALWAYS sends to /api/chat
   * (Tavily + Gemini). On success navigates to /chat/[threadId].
   * On failure (e.g. Thread table doesn't exist yet, or Tavily
   * quota is hit), shows the error inline in the form so the user
   * can retry or rephrase. NO fallback to /api/ask — the chat
   * engine handles both spatial and conversational questions.
   *
   * Day 19 v3: accept an optional `text` arg so example-prompt
   * buttons can submit a pre-filled question without going through
   * the input state.
   */
  async function submitToChat(text?: string) {
    const q = (text ?? question).trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: q }),
      });
      const chatJson = await chatRes.json().catch(() => ({}));
      if (chatRes.ok && chatJson?.threadId) {
        router.push(`/chat/${chatJson.threadId}`);
        return;
      }
      const errMsg =
        typeof chatJson?.error === "string"
          ? chatJson.error
          : `Chat failed (HTTP ${chatRes.status}). Try again or check /api/chat/diagnostic.`;
      setError(errMsg);
      console.warn("[/] chat failed:", chatJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      console.warn("[/] chat threw:", e);
    } finally {
      setLoading(false);
    }
  }

  // Legacy /api/ask submitter. Still used by the example-prompt buttons
  // in the hero so users can see the spatial flow (map + signals) for
  // a known-good spatial query. The main input box no longer routes
  // through here — see submitToChat above.
  //
  // Day 19 v3: doSubmit also goes through /api/chat now. The example
  // prompt buttons in the hero use this to fill the input then
  // submit, so users always land in the Perplexity-shape chat.
  async function doSubmit(override?: { vertical?: string; question?: string }) {
    const q = (override?.question ?? question).trim();
    return submitToChat(q);
  }

  const firstName = isLoaded && user?.firstName ? user.firstName : "there";

  // Day 12 v4 follow-up v2: removed rotating placeholder entirely.
  // The rotating placeholder (added in 2884e29) made things WORSE
  // because users were reading the placeholder, mentally merging
  // it with the example chips below, and submitting blended
  // versions ("Nairobi industrial warehouse" when DB shows
  // "Durban logistics warehouse"). The placeholder is now a
  // neutral, non-city-specific hint. All city examples live
  // EXCLUSIVELY in the clickable chips below the input so it's
  // unambiguous what's a suggestion vs what's user-typed text.
  const placeholder = "Describe a site you need, in any city…";

  return (
    <AppShell>
      {/* Day 19 v3: top nav matches Perplexity (Discover / Finance /
          Health / Academic / Patents in their case; Atlas has Land /
          Pricing / For investors). */}
      <header className="flex items-center justify-end gap-3 px-6 py-3 text-xs text-atlas-muted">
          <a href="/land" className="hover:text-atlas-accent">
            Land
          </a>
          <a href="/pricing" className="hover:text-atlas-accent">
            Pricing
          </a>
          <a href="/demo" className="hover:text-atlas-accent">
            For investors
          </a>
        </header>

      {/* Center stage */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
          {loading ? (
            <ChatGPTThinking
              firstName={isLoaded ? user?.firstName ?? null : null}
              question={question}
            />
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="mb-2 text-4xl font-semibold tracking-tight text-atlas-text sm:text-5xl">
                  Hi {firstName}, I&apos;m Atlas.
                </h1>
                <p className="text-lg text-atlas-muted">
                  An AI Operating System for Decision Intelligence.
                </p>
                <p className="mt-2 text-xs text-atlas-muted">
                  Where should you build, open, or invest? Atlas reasons across
                   live signals — schools, transit, healthcare, road network,
                   competition, environmental risk, demographics, and listings —
                   to recommend the site that beats the alternatives.
                 </p>
                 {/* Day 18 v2: chat entry point. The hero now has two paths:
                     - Spatial (existing form below): "where in X should I build Y"
                     - Chat (this link): "which province/city is best for X",
                       "why is X good for Y", or any conversational question.
                      The classifier in lib/intent/classify.ts already routes
                      between the two. */}
                </div>

              <form onSubmit={onSubmit} className="w-full max-w-2xl">
                {/* Day 19 v3: Perplexity-shape form. ONE input box,
                    ONE submit button. No vertical chips, no model
                    picker, no verdict selection. Chat engine is
                    hidden behind the scenes (Tavily + Gemini). */}

                {/* Command bar */}
                <div className="rounded-xl border border-atlas-border bg-atlas-surface shadow-lg shadow-black/20 transition-colors focus-within:border-atlas-accent">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder={placeholder}
                      className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-atlas-text placeholder:text-atlas-muted focus:outline-none"
                      required
                      disabled={loading}
                    />

                    {/* Submit button */}
                    <button
                      type="submit"
                      disabled={loading || !question.trim()}
                      className="shrink-0 rounded-md bg-atlas-accent p-1.5 text-white transition-colors hover:bg-atlas-accent2 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Ask Atlas"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Quick-pick sample questions (when input is empty) */}
                {!loading && question.length === 0 && (
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <div className="text-[11px] uppercase tracking-wider text-atlas-muted">
                      Try a sample
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[
                        "Where in Sandton for vacant land?",
                        "Where in Lusaka for a logistics warehouse?",
                        "Where in Cape Town for a family restaurant?",
                        "Where in Nairobi for a school site?",
                      ].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setQuestion(q)}
                          className="rounded-full border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs text-atlas-muted transition-colors hover:border-atlas-accent hover:text-atlas-text"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {error}
                  </div>
                )}
              </form>
            </>
          )}
        </div>

        <footer className="px-6 py-4 text-center text-xs text-atlas-muted">
          <p>
            Atlas · Intelligence for African Real Estate ·{" "}
            {new Date().getFullYear()}
          </p>
        </footer>
    </AppShell>
  );
}
