"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

interface ChatResponse {
  id: string;
  primaryEngine: "tavily_plus_gemini" | "gemini_search" | "curated";
  answer?: string;
  sources?: Array<{ title?: string; url: string }>;
  ranked_sites?: Array<{
    rank: number;
    name: string;
    suburb?: string;
    score: number;
    rationale: string;
    lat?: number;
    lng?: number;
    payload?: { sourceUrls?: string[]; attribution?: string };
  }>;
  matchedPatterns?: {
    spatial: string[];
    conversational: string[];
  };
}

/**
 * Day 17 v6 — /chat/[id] — Conversational Intelligence view.
 *
 * For queries the intent classifier routes to "conversational":
 * - "Which province has the fastest-growing middle class?"
 * - "Which African city is best for expanding my fintech?"
 * - "Why Lusaka for a stadium?"
 * - "What is Atlas?"
 *
 * Shows the prose answer at the top + Tavily sources as clickable
 * citations + a smaller "Spatial view available — switch to map"
 * tab if Atlas also ran the spatial engine in parallel.
 *
 * Engine B (Tavily + Gemini) handles these. The result page
 * (spatial engine) still ran in parallel and is available via
 * the "Switch to map view" tab.
 */
export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const [chatId, setChatId] = useState<string | null>(null);
  const { isSignedIn, isLoaded } = useUser();
  const [data, setData] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => setChatId(p.id));
  }, [params]);

  useEffect(() => {
    if (!isLoaded || !chatId) return;
    if (!isSignedIn) {
      setError("Sign in to view this conversation");
      setLoading(false);
      return;
    }
    fetch(`/api/questions/${chatId}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        const rb = j?.responseBody ?? j;
        setData({
          id: chatId,
          primaryEngine: rb?.primaryEngine ?? "tavily_plus_gemini",
          answer: rb?.answer,
          sources: rb?.sources,
          ranked_sites: rb?.ranked_sites,
          matchedPatterns: rb?.matchedPatterns,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, chatId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-atlas-bg text-atlas-muted">
        Loading conversation…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-atlas-bg">
        <div className="rounded-xl border border-atlas-border bg-atlas-surface p-6 text-center text-sm text-atlas-muted">
          {error}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const sources = data.sources ?? [];
  const sites = data.ranked_sites ?? [];

  return (
    <div className="min-h-screen bg-atlas-bg p-6 text-atlas-text">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-baseline justify-between">
          <a
            href={chatId ? `/result/${chatId}` : "/dashboard"}
            className="text-xs text-atlas-muted hover:text-atlas-accent"
          >
            ← Switch to map view
          </a>
          <span className="rounded-full border border-atlas-border bg-atlas-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-atlas-muted">
            {data.primaryEngine.replace(/_/g, " ")}
          </span>
        </div>

        <div>
          <span className="rounded-full bg-atlas-accent/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-atlas-accent">
            Intelligence answer
          </span>
          <h1 className="mt-3 text-2xl font-semibold leading-tight">
            {data.answer ?? "Atlas couldn't reach a research model for this question."}
          </h1>
          {data.matchedPatterns?.conversational &&
            data.matchedPatterns.conversational.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1 text-[10px]">
                <span className="text-atlas-muted">intent:</span>
                {data.matchedPatterns.conversational.slice(0, 4).map((p, i) => (
                  <span
                    key={i}
                    className="rounded border border-atlas-border bg-atlas-surface2 px-1.5 py-0.5 font-mono text-atlas-muted"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
        </div>

        {sources.length > 0 && (
          <section className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-atlas-muted">
              Sources ({sources.length})
            </h2>
            <ul className="space-y-2">
              {sources.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-[10px] font-mono text-atlas-muted">[{i + 1}]</span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-atlas-text hover:text-atlas-accent"
                  >
                    {s.title ?? s.url}
                    <span className="ml-1 text-[10px] text-atlas-muted">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sites.length > 0 && (
          <section className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-atlas-muted">
              Places mentioned ({sites.length})
            </h2>
            <ul className="space-y-3">
              {sites.slice(0, 5).map((s, i) => (
                <li key={i} className="rounded-lg border border-atlas-border bg-atlas-bg p-3">
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium">
                      {s.name}
                      {s.suburb ? (
                        <span className="ml-2 text-[11px] text-atlas-muted">
                          · {s.suburb}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[10px] font-mono text-atlas-muted">
                      score {s.score.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-atlas-muted">
                    {s.rationale}
                  </p>
                  {s.payload?.sourceUrls && s.payload.sourceUrls.length > 0 && (
                    <div className="mt-2 text-[10px]">
                      <span className="text-atlas-muted">cited in: </span>
                      {s.payload.sourceUrls.slice(0, 2).map((u, j) => {
                        try {
                          const host = new URL(u).hostname.replace(/^www\./, "");
                          return (
                            <a
                              key={j}
                              href={u}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mr-2 text-atlas-accent hover:underline"
                            >
                              {host}
                            </a>
                          );
                        } catch {
                          return null;
                        }
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="rounded-xl border border-atlas-border bg-atlas-surface p-4 text-[11px] text-atlas-muted">
          <strong className="text-atlas-text">How this answer was made:</strong>{" "}
          Atlas searched the web with Tavily, then asked Gemini 2.0 Flash
          to read those sources and reason about your question. Every
          fact cited above links back to a real web source. The
          spatial view (map + ranked sites + 10 live signals) ran in
          parallel — switch tabs to compare.
        </div>
      </div>
    </div>
  );
}
