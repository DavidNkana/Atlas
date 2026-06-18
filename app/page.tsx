"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MODEL_INFO } from "@/lib/models/registry";
import type { ModelInfo } from "@/lib/models/types";
import { Sidebar } from "@/components/Sidebar";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { ChatGPTThinking } from "@/components/ChatGPTThinking";
import { ModelIcon } from "@/components/ModelIcon";
import { OutOfScopeModal, useOutOfScopeGate } from "@/components/OutOfScopeModal";
import { VerticalMismatchModal, suggestVertical } from "@/components/VerticalMismatchModal";
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

const BUILTIN_VERTICALS = [
  { value: "gas_station", label: "Gas station" },
  { value: "restaurant", label: "Restaurant" },
  { value: "warehouse", label: "Warehouse" },
  { value: "retail_shop", label: "Retail shop" },
] as const;

type BuiltinVertical = (typeof BUILTIN_VERTICALS)[number]["value"];
type Vertical = BuiltinVertical | `custom:${string}`;

const MAX_CUSTOM_VERTICAL_LEN = 40;
const CUSTOM_VERTICAL_RE = /^[a-z][a-z0-9_]{1,39}$/;

function customVerticalLabel(value: string): string {
  // "custom:residential_land" -> "Residential land"
  const id = value.replace(/^custom:/, "");
  return id
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function isCustomVertical(value: string): value is `custom:${string}` {
  return value.startsWith("custom:");
}

/**
 * A model is "available" when its required env var is set on the server.
 * The stub is always available. The picker uses this to dim models that
 * won't actually answer the question — but the user can still pick them
 * and the fallback chain in route.ts will move on to the next model.
 *
 * Implementation: we read NEXT_PUBLIC_HAS_GEMINI / NEXT_PUBLIC_HAS_OPENROUTER
 * which are boolean-ish public env vars the operator sets in Vercel. The
 * real key check happens server-side in the model's isAvailable(). This
 * way the picker can show "API key needed" without leaking the actual
 * key value to the browser.
 *
 * If the operator hasn't set these yet, the picker assumes both are
 * available — the call will fail gracefully and fall back to stub. The
 * dim style is just a hint, not a hard block.
 */
function isModelAvailable(modelId: string): boolean {
  if (modelId === "curated-stub") return true;
  if (modelId === "gemini-flash") {
    return process.env.NEXT_PUBLIC_HAS_GEMINI !== "false";
  }
  if (modelId === "llama-free" || modelId === "mistral-free") {
    return process.env.NEXT_PUBLIC_HAS_OPENROUTER !== "false";
  }
  return false;
}

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
  // Model picker flips up if there isn't enough space below the
  // button. We measure on open.
  const [modelPickerFlipUp, setModelPickerFlipUp] = useState<boolean>(false);
  const [mismatchOpen, setMismatchOpen] = useState<boolean>(false);
  const [mismatchData, setMismatchData] = useState<{
    question: string;
    current: string;
    suggested: string;
  } | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const outOfScope = useOutOfScopeGate();
  const [customInputOpen, setCustomInputOpen] = useState<boolean>(false);
  const [customInputValue, setCustomInputValue] = useState<string>("");
  const [customError, setCustomError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Commit the custom vertical input. Validates the format (lowercase
   * snake_case, 2-40 chars) and switches the active vertical to the
   * new custom value. The API route treats `custom:...` as an opaque
   * token and the stub generator falls back to generic town-centre
   * templates.
   */
  function commitCustomVertical() {
    const raw = customInputValue.trim().toLowerCase().replace(/\s+/g, "_");
    if (!raw) {
      setCustomError("Enter a name");
      return;
    }
    if (raw.length > MAX_CUSTOM_VERTICAL_LEN) {
      setCustomError(`Max ${MAX_CUSTOM_VERTICAL_LEN} characters`);
      return;
    }
    if (!CUSTOM_VERTICAL_RE.test(raw)) {
      setCustomError("Use lowercase letters, numbers, underscores. Start with a letter.");
      return;
    }
    const id: `custom:${string}` = `custom:${raw}`;
    setVertical(id);
    setCustomInputValue("");
    setCustomError(null);
    setCustomInputOpen(false);
  }

  // On mount: read user prefs, apply default model + vertical + showThinkingLoader
  useEffect(() => {
    const p = readPrefs();
    if (p.defaultModel) setModelId(p.defaultModel);
    if (p.defaultVertical) {
      const found = BUILTIN_VERTICALS.find((v) => v.value === p.defaultVertical);
      if (found) setVertical(found.value as BuiltinVertical);
    }
    setShowThinkingLoader(p.showThinkingLoader);
  }, []);

  // Listen for Settings changes
  useEffect(() => {
    function onPrefs(e: Event) {
      const ce = e as CustomEvent<AtlasPrefs>;
      if (ce.detail.defaultModel) setModelId(ce.detail.defaultModel);
      if (ce.detail.defaultVertical) {
        const found = BUILTIN_VERTICALS.find((v) => v.value === ce.detail.defaultVertical);
        if (found) setVertical(found.value as BuiltinVertical);
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

  // When the model picker opens, measure the space below the
  // button. If there isn't room for the dropdown (we need ~320px),
  // flip it above the button. This keeps the popup fully visible
  // even when the user is scrolled near the bottom of the page.
  useEffect(() => {
    if (!modelPickerOpen) return;
    if (typeof window === "undefined") return;
    if (!modelButtonRef.current) return;
    const rect = modelButtonRef.current.getBoundingClientRect();
    const DROPDOWN_HEIGHT = 320;
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const shouldFlip = spaceBelow < DROPDOWN_HEIGHT && spaceAbove > spaceBelow;
    setModelPickerFlipUp(shouldFlip);
  }, [modelPickerOpen]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    // Out-of-scope prompt gate. If the question doesn't look like a
    // location intelligence question, show the modal and don't submit.
    if (outOfScope.checkQuestion(question.trim())) {
      return;
    }

    // Vertical mismatch gate. If the question clearly points to a
    // different vertical than the one selected, show the warning
    // modal and let the user decide. Custom verticals are user-defined
    // so we skip the check for those.
    if (!vertical.startsWith("custom:")) {
      const suggested = suggestVertical(question.trim(), vertical);
      if (suggested) {
        setMismatchData({
          question: question.trim(),
          current: vertical,
          suggested,
        });
        setMismatchOpen(true);
        return;
      }
    }

    setLoading(true);
    setError(null);

    await doSubmit();
  }

  // Extracted so the "Ask anyway" override on the vertical-mismatch
  // modal can also call it after the user dismisses the warning.
  //
  // Optional `override` argument lets the caller pass fresh values
  // that should be used INSTEAD of the closed-over state. This
  // matters for the "Switch to {suggested}" one-click flow: when
  // the user clicks Switch we update state, but the closure inside
  // this same handler still has the OLD values. Passing the new
  // values explicitly here avoids a stale-state submit and a
  // potential auth race that we were seeing.
  async function doSubmit(override?: { vertical?: string; question?: string }) {
    const v = override?.vertical ?? vertical;
    const q = (override?.question ?? question).trim();

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical: v,
          question: q,
          model: modelId,
        }),
      });

      // Day 9: read the JSON body FIRST so we can show the actual
      // server error message. Previously this block showed a hard-
      // coded "Please sign in to ask questions" for ANY 401 — but
      // the route returns 401 for validation errors too (missing
      // vertical, unsupported vertical, etc.) and the user saw the
      // wrong message. Now we only show "Please sign in" if the
      // server explicitly says the auth failed.
      if (res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === "Sign in required") {
          setError("Please sign in to ask questions");
        } else {
          setError(errData.error || `Request failed: ${res.status}`);
        }
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
    <div className="flex h-screen overflow-hidden bg-atlas-bg text-atlas-text">
      <Sidebar />

      <outOfScope.Modal />

      {mismatchOpen && mismatchData && (
        <VerticalMismatchModal
          question={mismatchData.question}
          currentVertical={mismatchData.current}
          onClose={() => {
            setMismatchOpen(false);
            setMismatchData(null);
          }}
          onUseExample={(newVertical, exampleQuestion) => {
            // Day 12 v6: do NOT auto-submit on example click. The
            // previous behaviour (added in Day 9 hotfix v2 to work
            // around an auth race that has since been fixed in
            // Day 9 v4) was: clicking an example chip replaces the
            // user's typed question with the example text AND
            // immediately submits. The auth race is gone — the
            // 401s were from auth() vs getAuth() in the route
            // handler, not from a double-submit.
            //
            // The auto-submit was causing data loss: David typed
            // "Where in Nairobi for an industrial warehouse",
            // the mismatch modal opened (because residential_land
            // was selected and "industrial" hit industrial_land),
            // he clicked an example to "dismiss" the modal, and
            // the example "Where in Durban for a logistics
            // warehouse?" was submitted instead. His Nairobi was
            // silently replaced by Durban.
            //
            // New behaviour: clicking an example fills the input
            // with the example, sets the new vertical, closes the
            // modal, and lets the user edit + click Ask themselves.
            // The user always sees the question that's about to be
            // submitted because they see it in the input.
            setVertical(newVertical as any);
            setQuestion(exampleQuestion);
            setMismatchOpen(false);
            setMismatchData(null);
            setError(null);
            // Focus the question input so the user can edit
            // (e.g. swap "Durban" for "Nairobi") and submit.
            setTimeout(() => {
              const input = document.getElementById("atlas-question-input");
              if (input) {
                input.focus();
                // Place cursor at the end so they can keep typing.
                const len = (input as HTMLInputElement).value.length;
                (input as HTMLInputElement).setSelectionRange(len, len);
              }
            }, 50);
          }}
          onUseCustom={() => {
            setVertical("custom:hospital" as any); // placeholder, opens input
            setCustomInputOpen(true);
            setTimeout(() => customInputRef.current?.focus(), 100);
            setMismatchOpen(false);
            setMismatchData(null);
          }}
          onOverride={() => {
            setMismatchOpen(false);
            setMismatchData(null);
            // Fire the actual submit now
            void doSubmit();
          }}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Top bar: top-right links */}
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
            showThinkingLoader ? (
              <ChatGPTThinking
                firstName={isLoaded ? user?.firstName ?? null : null}
                question={question}
                vertical={vertical}
              />
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
                  {BUILTIN_VERTICALS.map((v) => (
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
                  {/* Active custom vertical pill (if any) */}
                  {isCustomVertical(vertical) && (
                    <button
                      type="button"
                      onClick={() => setCustomInputOpen(true)}
                      className="rounded-full bg-atlas-accent px-2.5 py-0.5 text-xs text-white"
                      title="Custom vertical — click to change"
                    >
                      {customVerticalLabel(vertical)}
                    </button>
                  )}
                  {/* + Custom button — opens an inline input */}
                  {!isCustomVertical(vertical) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomInputOpen((o) => !o);
                        // Focus the input next tick
                        setTimeout(() => customInputRef.current?.focus(), 50);
                      }}
                      className={`rounded-full border border-dashed px-2.5 py-0.5 text-xs transition-colors ${
                        customInputOpen
                          ? "border-atlas-accent text-atlas-text"
                          : "border-atlas-border text-atlas-muted hover:border-atlas-accent/50 hover:text-atlas-text"
                      }`}
                    >
                      + Custom
                    </button>
                  )}
                </div>

                {/* Inline custom vertical input */}
                {customInputOpen && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-atlas-border bg-atlas-surface px-2 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
                      Custom vertical
                    </span>
                    <input
                      ref={customInputRef}
                      type="text"
                      value={customInputValue}
                      onChange={(e) => {
                        setCustomInputValue(e.target.value);
                        setCustomError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitCustomVertical();
                        } else if (e.key === "Escape") {
                          setCustomInputOpen(false);
                          setCustomInputValue("");
                          setCustomError(null);
                        }
                      }}
                      placeholder="e.g. residential_land"
                      maxLength={MAX_CUSTOM_VERTICAL_LEN}
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded bg-atlas-bg px-2 py-1 text-xs text-atlas-text placeholder:text-atlas-muted focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={commitCustomVertical}
                      className="rounded bg-atlas-accent px-2 py-1 text-xs text-white transition-colors hover:bg-atlas-accent2"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomInputOpen(false);
                        setCustomInputValue("");
                        setCustomError(null);
                      }}
                      className="rounded px-2 py-1 text-xs text-atlas-muted transition-colors hover:text-atlas-text"
                    >
                      Cancel
                    </button>
                    {customError && (
                      <span className="basis-full text-[10px] text-red-300">
                        {customError}
                      </span>
                    )}
                  </div>
                )}

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
                          className={`absolute right-0 z-30 w-72 overflow-hidden rounded-lg border border-atlas-border bg-atlas-surface shadow-2xl shadow-black/40 ${
                            modelPickerFlipUp
                              ? "bottom-full mb-1"
                              : "top-full mt-1"
                          }`}
                        >
                          <div className="border-b border-atlas-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
                            Choose a model
                          </div>
                          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
                            {MODEL_INFO.map((info) => {
                              const isActive = info.id === modelId;
                              // We show ALL models so the user can see what's
                              // available. Unavailable models are dimmed and
                              // the picker falls through to the next model at
                              // call time (see lib/models/route.ts fallback chain).
                              const isAvailable = isModelAvailable(info.id);
                              return (
                                <li key={info.id}>
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={isActive}
                                    aria-disabled={!isAvailable}
                                    onClick={() => {
                                      setModelId(info.id);
                                      setModelPickerOpen(false);
                                    }}
                                    className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                                      isActive
                                        ? "bg-atlas-accent/10"
                                        : isAvailable
                                        ? "hover:bg-atlas-surface2"
                                        : "opacity-50 hover:bg-atlas-surface2"
                                    }`}
                                  >
                                    <ModelIcon info={info} size={24} />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-medium text-atlas-text">
                                          {info.displayName}
                                        </span>
                                        {info.free && (
                                          <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-semibold text-emerald-300">
                                            FREE
                                          </span>
                                        )}
                                        {!isAvailable && (
                                          <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold text-amber-300">
                                            API KEY NEEDED
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-0.5 line-clamp-2 text-[10px] text-atlas-muted">
                                        {info.description}
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
      </main>
    </div>
  );
}
