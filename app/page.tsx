"use client";

import { useState } from "react";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";
import { MODEL_INFO } from "@/lib/models/registry";

/**
 * Day 3: G4 prompt box + Clerk auth UI in header + model picker.
 *
 * The user picks a model + vertical, types a question, and clicks Submit.
 * The form POSTs to /api/ask with { model, vertical, question }.
 *
 * If signed out: header shows Sign in / Sign up buttons (top-right).
 * If signed in: header shows UserButton (top-right) and Dashboard link.
 *
 * Day 4 will render the response on a Mapbox map.
 * Day 5 will fire a real connector.
 */

const VERTICALS = [
  { value: "gas_station", label: "Gas station" },
  { value: "restaurant", label: "Restaurant" },
  { value: "warehouse", label: "Warehouse" },
  { value: "retail_shop", label: "Retail shop" },
] as const;

type Vertical = (typeof VERTICALS)[number]["value"];

type AskResponse = {
  id?: string;
  status: string;
  model?: {
    id: string;
    displayName: string;
    provider: string;
    free: boolean;
    fallbackUsed: boolean;
  };
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
  const [modelId, setModelId] = useState<string>(MODEL_INFO[0]?.id ?? "gemini-flash");
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
        body: JSON.stringify({ vertical, question: question.trim(), model: modelId }),
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

      const data: AskResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-8">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between border-b border-atlas-border pb-4">
        <h1 className="text-xl font-semibold tracking-tight">
          <span className="text-atlas-accent">Atlas</span>{" "}
          <span className="text-atlas-muted text-sm font-normal">
            Intelligence Engine
          </span>
        </h1>
        <div className="flex items-center gap-3">
          <SignedIn>
            <a
              href="/dashboard"
              className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent hover:text-atlas-accent"
            >
              Dashboard
            </a>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-md bg-atlas-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-atlas-accent2"
              >
                Sign up
              </button>
            </SignUpButton>
          </SignedOut>
        </div>
      </header>

      {/* Prompt box (G4) */}
      <section className="rounded-lg border border-atlas-border bg-atlas-surface p-6">
        <h2 className="mb-4 text-sm font-medium text-atlas-muted">
          Ask Atlas
        </h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="model"
              className="mb-1 block text-xs font-medium text-atlas-muted"
            >
              Model
            </label>
            <select
              id="model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full rounded-md border border-atlas-border bg-atlas-surface2 px-3 py-2 text-sm text-atlas-text focus:border-atlas-accent focus:outline-none"
            >
              {MODEL_INFO.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} · {m.provider}{" "}
                  <span className="text-atlas-muted">
                    {m.free ? "(free)" : "(paid)"}
                  </span>
                </option>
              ))}
            </select>
          </div>
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
          Atlas · Week 1 Day 3 · Model registry live · {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
