"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MODEL_INFO } from "@/lib/models/registry";
import { Sidebar } from "@/components/Sidebar";
import { ThinkingLoader } from "@/components/ThinkingLoader";

/**
 * Atlas — Home.
 *
 * The "command bar" entry point. Perplexity-style shell:
 *   - Left rail (Sidebar) with logo, +New, History, user
 *   - Center hero: "Hi {user.firstName}, I'm Atlas. What do you want to find?"
 *   - Command bar: vertical picker embedded left, model picker embedded
 *     right, question input in the middle, submit on Enter
 *   - Thinking loader while /api/ask is in-flight
 *
 * The "atlas:new" CustomEvent lets the Sidebar's +New button reset the
 * command bar without prop-drilling.
 */

const VERTICALS = [
  { value: "gas_station", label: "Gas station" },
  { value: "restaurant", label: "Restaurant" },
  { value: "warehouse", label: "Warehouse" },
  { value: "retail_shop", label: "Retail shop" },
] as const;

type Vertical = (typeof VERTICALS)[number]["value"];

export default function HomePage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [vertical, setVertical] = useState<Vertical>("gas_station");
  const [modelId, setModelId] = useState<string>(
    MODEL_INFO[0]?.id ?? "gemini-flash"
  );
  const [question, setQuestion] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset the command bar when the Sidebar fires "atlas:new"
  useEffect(() => {
    function onNew() {
      setQuestion("");
      setError(null);
      setLoading(false);
      // Scroll to top so the hero is visible.
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      // Focus the input
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical,
          question: question.trim(),
          model: modelId,
        }),
      });

      if (res.status === 401) {
        setError("Please sign in to ask questions");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || `Request failed: ${res.status}`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.id) {
        router.push("/result/" + data.id);
        return;
      }
      setError("Atlas returned no result id. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const firstName = isLoaded && user?.firstName ? user.firstName : "there";

  return (
    <div className="flex min-h-screen bg-atlas-bg text-atlas-text">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: top-right links */}
        <header className="flex items-center justify-end gap-3 px-6 py-3 text-xs text-atlas-muted">
          <a href="/land" className="hover:text-atlas-accent">
            Land
          </a>
          <a href="/demo" className="hover:text-atlas-accent">
            For investors
          </a>
        </header>

        {/* Center stage */}
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {loading ? (
            <ThinkingLoader />
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="mb-2 text-4xl font-semibold tracking-tight text-atlas-text sm:text-5xl">
                  Hi {firstName}, I&apos;m Atlas.
                </h1>
                <p className="text-lg text-atlas-muted">
                  What do you want to find?
                </p>
                <p className="mt-2 text-xs text-atlas-muted">
                  Atlas blends multiple data sources, models, and live signals
                  into one answer.
                </p>
              </div>

              <form
                onSubmit={onSubmit}
                className="w-full max-w-2xl"
              >
                <div className="rounded-xl border border-atlas-border bg-atlas-surface shadow-lg shadow-black/20 transition-colors focus-within:border-atlas-accent">
                  <div className="flex items-center gap-2 px-3 py-2">
                    {/* Vertical picker embedded left */}
                    <select
                      aria-label="Vertical"
                      value={vertical}
                      onChange={(e) => setVertical(e.target.value as Vertical)}
                      className="shrink-0 rounded-md bg-atlas-surface2 px-2 py-1.5 text-xs text-atlas-text focus:outline-none"
                    >
                      {VERTICALS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>

                    {/* Question input */}
                    <input
                      ref={inputRef}
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Where in Sandton for a gas station?"
                      className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-atlas-text placeholder:text-atlas-muted focus:outline-none"
                      required
                      disabled={loading}
                    />

                    {/* Model picker embedded right */}
                    <select
                      aria-label="Model"
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      disabled={loading}
                      className="shrink-0 rounded-md bg-atlas-surface2 px-2 py-1.5 text-xs text-atlas-text focus:outline-none"
                    >
                      {MODEL_INFO.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.free ? "⚡ " : ""}
                          {m.displayName.split(" ")[0]}
                        </option>
                      ))}
                    </select>

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
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      "Where in Sandton for a gas station?",
                      "Where in Pretoria for a restaurant?",
                      "Where in Lusaka for a warehouse?",
                      "Where in Cape Town for retail?",
                    ].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuestion(q)}
                        className="rounded-full border border-atlas-border bg-atlas-surface px-3 py-1 text-xs text-atlas-muted transition-colors hover:border-atlas-accent hover:text-atlas-text"
                      >
                        {q}
                      </button>
                    ))}
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
      </main>
    </div>
  );
}
