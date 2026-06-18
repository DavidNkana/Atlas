"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LAND_VERTICALS, LAND_SAMPLE_QUESTIONS } from "@/lib/land/verticals";
import type { LandVertical } from "@/lib/land/verticals";
import { AppShell } from "@/components/AppShell";

/**
 * Day 7: /land front door — focused page for land developers, property
 * investors, and residential builders.
 *
 * The pitch: "Find the right plot in 30 seconds, not 6 weeks."
 *
 * Sub-vertical: land for development. NOT commercial property, NOT
 * residential investment. This is a focused product, not a generic
 * AI tool.
 */
export default function LandPage() {
  const router = useRouter();
  const [vertical, setVertical] = useState<LandVertical>("residential_land");
  const [question, setQuestion] = useState<string>(
    LAND_SAMPLE_QUESTIONS[0]
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical,
          question: question.trim(),
          model: "curated-stub",
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

  return (
    <AppShell>
      <header className="mb-8 flex items-center justify-between border-b border-atlas-border pb-4">
        <h1 className="text-xl font-semibold tracking-tight">
          <a href="/" className="text-atlas-accent">
            Atlas
          </a>{" "}
          <span className="text-atlas-muted text-sm font-normal">Land</span>
        </h1>
        <nav className="flex items-center gap-3 text-xs">
          <a href="/demo" className="text-atlas-muted hover:text-atlas-accent">
            For investors
          </a>
          <a
            href="/dashboard"
            className="text-atlas-muted hover:text-atlas-accent"
          >
            Dashboard
          </a>
        </nav>
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-3xl font-semibold tracking-tight text-atlas-text">
          Find the right plot in 30 seconds.
        </h2>
        <p className="mb-1 text-sm text-atlas-muted">
          Atlas blends multiple data sources to answer land, residential,
          commercial, and investment questions in 30 seconds.
        </p>
        <p className="text-xs text-atlas-muted">
          Built for land developers, property investors, and residential builders.
        </p>
      </section>

      <section className="rounded-lg border border-atlas-border bg-atlas-surface p-6">
        <h3 className="mb-4 text-sm font-medium text-atlas-muted">
          What kind of land are you looking for?
        </h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="vertical"
              className="mb-1 block text-xs font-medium text-atlas-muted"
            >
              Land type
            </label>
            <select
              id="vertical"
              value={vertical}
              onChange={(e) => setVertical(e.target.value as LandVertical)}
              className="w-full rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-sm text-atlas-text focus:border-atlas-accent focus:outline-none"
            >
              {LAND_VERTICALS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label} — {v.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="question"
              className="mb-1 block text-xs font-medium text-atlas-muted"
            >
              Your question
            </label>
            <input
              id="question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Where in Sandton for vacant land for development?"
              className="w-full rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="w-full rounded-md bg-atlas-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Atlas is thinking…" : "Ask Atlas"}
          </button>
        </form>
        {error && (
          <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-muted">
          Try a sample question
        </h3>
        <ul className="space-y-2">
          {LAND_SAMPLE_QUESTIONS.map((q, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setQuestion(q);
                  setVertical(LAND_VERTICALS[i % LAND_VERTICALS.length].value);
                }}
                className="w-full rounded-md border border-atlas-border bg-atlas-surface px-4 py-3 text-left text-sm text-atlas-text transition-colors hover:border-atlas-accent hover:text-atlas-accent"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto pt-12 text-center text-xs text-atlas-muted">
        <p>Atlas · Land · {new Date().getFullYear()}</p>
      </footer>
    </AppShell>
  );
}
