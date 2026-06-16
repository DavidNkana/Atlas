"use client";

import { useState } from "react";

/**
 * Day 1: G4 prompt box.
 *
 * The user picks a vertical (gas station / restaurant / warehouse / retail),
 * types a question, and clicks Submit. The form POSTs to /api/ask.
 *
 * Day 3 will wire the response into a real MiniMax call.
 * Day 4 will render the response on a Mapbox map.
 * Day 5 will fire a real connector.
 *
 * For now: the response is a stub JSON rendered in a <pre> block. The page is
 * ugly on purpose — the goal of Day 1 is to prove the deploy pipeline.
 */

const VERTICALS = [
  { value: "gas_station", label: "Gas station" },
  { value: "restaurant", label: "Restaurant" },
  { value: "warehouse", label: "Warehouse" },
  { value: "retail_shop", label: "Retail shop" },
] as const;

type Vertical = (typeof VERTICALS)[number]["value"];

type AskResponse = {
  status: string;
  vertical: string;
  question: string;
  echo: string;
  ranked_sites: Array<{
    rank: number;
    name: string;
    score: number;
    confidence: number;
    rationale: string;
  }>;
};

export default function HomePage() {
  const [vertical, setVertical] = useState<Vertical>("gas_station");
  const [question, setQuestion] = useState<string>("Where in Sandton?");
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vertical, question }),
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data: AskResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16">
      {/* Wordmark */}
      <header className="mb-12 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-atlas-accent text-base font-bold text-white">
          A
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Atlas</h1>
          <p className="text-xs text-atlas-muted">An AI-powered Intelligence Engine</p>
        </div>
      </header>

      {/* Prompt box */}
      <section className="rounded-lg border border-atlas-border bg-atlas-surface p-6">
        <h2 className="mb-1 text-sm font-medium text-atlas-muted">
          What would you like to research?
        </h2>
        <p className="mb-5 text-xs text-atlas-muted">
          Day 1 stub — the deploy pipeline is alive. Day 3 wires MiniMax. Day 5 wires real connectors.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="vertical"
              className="mb-1 block text-xs font-medium text-atlas-muted"
            >
              Vertical
            </label>
            <select
              id="vertical"
              value={vertical}
              onChange={(e) => setVertical(e.target.value as Vertical)}
              className="w-full rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-sm text-atlas-text focus:border-atlas-accent focus:outline-none"
            >
              {VERTICALS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="question"
              className="mb-1 block text-xs font-medium text-atlas-muted"
            >
              Question
            </label>
            <input
              id="question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Where in Sandton?"
              className="w-full rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="w-full rounded-md bg-atlas-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Asking Atlas…" : "Ask Atlas"}
          </button>
        </form>
      </section>

      {/* Response */}
      {(response || error) && (
        <section className="mt-6 rounded-lg border border-atlas-border bg-atlas-surface p-6">
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {response && (
            <>
              <h3 className="mb-3 text-sm font-medium text-atlas-muted">
                Response
              </h3>
              <pre className="overflow-x-auto rounded-md border border-atlas-border bg-atlas-bg p-4 text-xs text-atlas-text">
                {JSON.stringify(response, null, 2)}
              </pre>
            </>
          )}
        </section>
      )}

      {/* Footer */}
      <footer className="mt-auto pt-12 text-center text-xs text-atlas-muted">
        <p>
          Atlas · Week 1 Day 1 · Pipeline live · {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
