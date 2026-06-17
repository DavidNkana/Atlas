"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MODEL_INFO, getAvailableModels } from "@/lib/models/registry";
import type { ModelInfo } from "@/lib/models/types";
import { Sidebar } from "@/components/Sidebar";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { ModelIcon } from "@/components/ModelIcon";
import { readPrefs, DEFAULT_PREFS, type AtlasPrefs } from "@/components/SettingsDrawer";

/**
 * Atlas — Home.
 *
 * The "command bar" entry point. Perplexity-style shell:
 *   - Left rail (Sidebar) with logo, +New, History, Settings, user
 *   - Center hero: "Hi {user.firstName}, I'm Atlas. What do you want to find?"
 *   - Row of vertical picker chips (above the bar) — click to set vertical
 *   - Command bar: question input + model picker dropdown (with icons +
 *     full names) + submit
 *   - Thinking loader while /api/ask is in-flight
 *
 * The "atlas:new" CustomEvent lets the Sidebar's +New button reset the
 * command bar without prop-drilling. The "atlas:prefs" event lets the
 * command bar react when Settings changes the default model.
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
  const [showThinkingLoader, setShowThinkingLoader] = useState<boolean>(
    DEFAULT_PREFS.showThinkingLoader
  );
  const [modelPickerOpen, setModelPickerOpen] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);

  // On mount: read user prefs, apply default model + vertical + showThinkingLoader
  useEffect(() => {
    const p = readPrefs();
    if (p.defaultModel) setModelId(p.defaultModel);
    if (p.defaultVertical) {
      const found = VERTICALS.find((v) => v.value === p.defaultVertical);
      if (found) setVertical(found.value);
    }
    setShowThinkingLoader(p.showThinkingLoader);
  }, []);

  // Listen for Settings changes
  useEffect(() => {
    function onPrefs(e: Event) {
      const ce = e as CustomEvent<AtlasPrefs>;
      if (ce.detail.defaultModel) setModelId(ce.detail.defaultModel);
      if (ce.detail.defaultVertical) {
        const found = VERTICALS.find((v) => v.value === ce.detail.defaultVertical);
        if (found) setVertical(found.value);
      }
      if (typeof ce.detail.showThinkingLoader === "boolean") {
        setShowThinkingLoader(ce.detail.showThinkingLoader);
      }
    }
    window.addEventListener("atlas:prefs", onPrefs);
    return () => window.removeEventListener("atlas:prefs", onPrefs);
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

  // Close model picker when clicking outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!modelPickerOpen) return;
      const target = e.target as Node;
      if (
        modelButtonRef.current &&
        !modelButtonRef.current.contains(target) &&
        !(target as HTMLElement).closest?.("[data-model-picker]")
      ) {
        setModelPickerOpen(false);
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("mousedown", onClick);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("mousedown", onClick);
      }
    };
  }, [modelPickerOpen]);

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
  const activeModelInfo: ModelInfo | undefined = MODEL_INFO.find(
    (m) => m.id === modelId
  );
  const availableModels = getAvailableModels();

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
            showThinkingLoader ? (
              <ThinkingLoader />
            ) : (
              <div className="flex items-center gap-2 text-sm text-atlas-muted">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-atlas-accent" />
                Atlas is thinking…
              </div>
            )
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

              <form onSubmit={onSubmit} className="w-full max-w-2xl">
                {/* Vertical picker as a row of chips ABOVE the command bar */}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
                    I&apos;m looking for
                  </span>
                  {VERTICALS.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => setVertical(v.value)}
                      className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                        vertical === v.value
                          ? "bg-atlas-accent text-white"
                          : "border border-atlas-border bg-atlas-surface text-atlas-muted hover:border-atlas-accent/50 hover:text-atlas-text"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                {/* Command bar */}
                <div className="rounded-xl border border-atlas-border bg-atlas-surface shadow-lg shadow-black/20 transition-colors focus-within:border-atlas-accent">
                  <div className="flex items-center gap-2 px-3 py-2">
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

                    {/* Model picker — proper dropdown with icons + full names */}
                    <div className="relative">
                      <button
                        ref={modelButtonRef}
                        type="button"
                        disabled={loading}
                        onClick={() => setModelPickerOpen((o) => !o)}
                        className="flex items-center gap-1.5 rounded-md bg-atlas-surface2 px-2 py-1.5 text-xs text-atlas-text transition-colors hover:bg-atlas-bg disabled:opacity-50"
                        aria-haspopup="listbox"
                        aria-expanded={modelPickerOpen}
                      >
                        {activeModelInfo && (
                          <ModelIcon info={activeModelInfo} size={16} />
                        )}
                        <span className="max-w-[140px] truncate">
                          {activeModelInfo?.displayName ?? "Model"}
                        </span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>

                      {modelPickerOpen && (
                        <div
                          data-model-picker
                          className="absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-lg border border-atlas-border bg-atlas-surface shadow-2xl shadow-black/40"
                        >
                          <div className="border-b border-atlas-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
                            Choose a model
                          </div>
                          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
                            {availableModels.map((m) => {
                              const isActive = m.info.id === modelId;
                              return (
                                <li key={m.info.id}>
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={isActive}
                                    onClick={() => {
                                      setModelId(m.info.id);
                                      setModelPickerOpen(false);
                                    }}
                                    className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                                      isActive
                                        ? "bg-atlas-accent/10"
                                        : "hover:bg-atlas-surface2"
                                    }`}
                                  >
                                    <ModelIcon info={m.info} size={24} />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-medium text-atlas-text">
                                          {m.info.displayName}
                                        </span>
                                        {m.info.free && (
                                          <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-semibold text-emerald-300">
                                            FREE
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-0.5 line-clamp-2 text-[10px] text-atlas-muted">
                                        {m.info.description}
                                      </p>
                                    </div>
                                    {isActive && (
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="mt-1 shrink-0 text-atlas-accent"
                                      >
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                      </svg>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>

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
