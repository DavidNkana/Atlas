"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MODEL_INFO } from "@/lib/models/registry";
import type { ModelInfo } from "@/lib/models/types";
import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { ChatGPTThinking } from "@/components/ChatGPTThinking";
import { ModelIcon } from "@/components/ModelIcon";
import { suggestVertical } from "@/components/VerticalMismatchModal";
import { AuthGateModal } from "@/components/AuthGateModal";
import { QuestionGallery } from "@/components/QuestionGallery";
import { readPrefs, DEFAULT_PREFS, type AtlasPrefs } from "@/components/SettingsDrawer";
import { ATLAS_HOOK, ATLAS_SUBHOOK } from "@/lib/copy";

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

/**
 * Growth v1 — anonymous question quota.
 *
 * A signed-out visitor gets ONE free question so they can see a real
 * Atlas answer before being asked for anything. The counter lives in
 * localStorage (no server state, no cookie banner) and is incremented
 * only AFTER a successful submit, so a failed request never burns the
 * free credit. Signed-in users are unlimited and never read it.
 *
 * This is a UX gate, not a security control — /api/ask does its own
 * auth handling (defense in depth).
 */
const ANON_QUOTA_KEY = "atlas:anonQuestionsUsed";
const ANON_FREE_QUESTIONS = 1;

function readAnonUsed(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = Number(window.localStorage.getItem(ANON_QUOTA_KEY) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    // Private mode / storage disabled — fail open, don't gate.
    return 0;
  }
}

function writeAnonUsed(n: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANON_QUOTA_KEY, String(n));
  } catch {
    // Nothing we can do — the visitor just gets another free question.
  }
}

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
 * True for the 4 chip verticals. Anything else (a `custom:` token or
 * one of the land verticals suggestVertical() can auto-switch us to,
 * e.g. "residential_land") is rendered as its own pill so the chip
 * row never looks like nothing is selected.
 */
function isBuiltinVertical(value: string): boolean {
  return BUILTIN_VERTICALS.some((v) => v.value === value);
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
  // Day 12 v16: gemini-search shares the same GEMINI_API_KEY as
  // gemini-flash — just a different request format (with the
  // google_search grounding tool). They live or die together.
  if (modelId === "gemini-flash" || modelId === "gemini-search") {
    return process.env.NEXT_PUBLIC_HAS_GEMINI !== "false";
  }
  if (modelId === "llama-free" || modelId === "mistral-free") {
    return process.env.NEXT_PUBLIC_HAS_OPENROUTER !== "false";
  }
  // Day 12 v23: tavily needs both TAVILY_API_KEY and GEMINI_API_KEY.
  // perplexity needs PERPLEXITY_API_KEY. The server checks the actual
  // env var (via the model's isAvailable()), this is just a hint
  // to dim the picker.
  if (modelId === "tavily") {
    return (
      process.env.NEXT_PUBLIC_HAS_TAVILY !== "false" &&
      process.env.NEXT_PUBLIC_HAS_GEMINI !== "false"
    );
  }
  if (modelId === "perplexity") {
    return process.env.NEXT_PUBLIC_HAS_PERPLEXITY !== "false";
  }
  return false;
}

export default function HomePage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [vertical, setVertical] = useState<Vertical>("gas_station");
  const [modelId, setModelId] = useState<string>(
    MODEL_INFO[0]?.id ?? "tavily"
  );
  const [question, setQuestion] = useState<string>("");
  const [attachments, setAttachments] = useState<{ base64: string; mime: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Bugfix: previously the textarea only auto-resized inside its
  // own onChange handler. That meant any time `question` was set
  // programmatically — clicking an old history row, paste, autofill,
  // drag-drop, etc. — the textarea height stayed at the previous
  // value. Run resizeTextarea via useLayoutEffect on every `question`
  // change so programmatic updates also expand the box correctly.
  const resizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };
  useLayoutEffect(() => {
    resizeTextarea(inputRef.current);
  }, [question]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return;
    if (attachments.length >= 3) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments((prev) => [...prev, { base64: reader.result as string, mime: file.type, name: file.name }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showThinkingLoader, setShowThinkingLoader] = useState<boolean>(
    DEFAULT_PREFS.showThinkingLoader
  );
  const [modelPickerOpen, setModelPickerOpen] = useState<boolean>(false);
  // Model picker flips up if there isn't enough space below the
  // button. We measure on open.
  const [modelPickerFlipUp, setModelPickerFlipUp] = useState<boolean>(false);
  const [authGateOpen, setAuthGateOpen] = useState<boolean>(false);
  // Anon free-question counter, mirrored from localStorage for the
  // "1 of 1 free questions used" hint. Read on mount (never during
  // render) so server and first client paint agree.
  const [anonUsed, setAnonUsed] = useState<number>(0);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const [customInputOpen, setCustomInputOpen] = useState<boolean>(false);
  const [customInputValue, setCustomInputValue] = useState<string>("");
  const [customError, setCustomError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const [listening, setListening] = useState(false);

  /** Speech-to-text via Web Speech API */
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-ZA';
    setListening(true);
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setQuestion((prev) => prev ? `${prev} ${transcript}` : transcript);
      setListening(false);
      inputRef.current?.focus();
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  }, []);

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

  // On mount: read user prefs, apply default model + showThinkingLoader
  useEffect(() => {
    const p = readPrefs();
    if (p.defaultModel) setModelId(p.defaultModel);
    setShowThinkingLoader(p.showThinkingLoader);
  }, []);

  // On mount (and whenever history changes): sync the anon quota
  // counter from localStorage.
  useEffect(() => {
    setAnonUsed(readAnonUsed());
    function onChanged() {
      setAnonUsed(readAnonUsed());
    }
    window.addEventListener("atlas:history-changed", onChanged);
    return () => window.removeEventListener("atlas:history-changed", onChanged);
  }, []);

  // Day 21: Onboarding gate. Authed users who haven't completed the
  // 4-question profile form get redirected to /onboarding. Skips
  // silently if /api/profile fails (e.g. DB column not yet added —
  // we fail open to avoid breaking the home page for existing users).
  useEffect(() => {
    if (!isLoaded || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.profile && data.profile.onboardingComplete === false) {
          router.push("/onboarding");
        }
      } catch {
        // Fail open — never block the home page on a profile fetch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, router]);

  // Listen for Settings changes
  useEffect(() => {
    function onPrefs(e: Event) {
      const ce = e as CustomEvent<AtlasPrefs>;
      if (ce.detail.defaultModel) setModelId(ce.detail.defaultModel);
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

    // Growth v1 — anon gate. A signed-out visitor gets ONE free
    // question; on the second attempt we show the AuthGateModal
    // BEFORE spending a request. Signed-in users skip this entirely.
    const used = readAnonUsed();
    if (!user && used >= ANON_FREE_QUESTIONS) {
      setAnonUsed(used);
      setAuthGateOpen(true);
      return;
    }

    // Growth v1 — the out-of-scope gate is gone. Blocking a submit on
    // a keyword list punished valid questions the list didn't know
    // about; a weak answer is a better failure mode than a wall.

    // Vertical mismatch is now non-blocking: if the question clearly
    // points at another vertical we silently switch to it and carry
    // on. No modal, no decision to make. Custom verticals are
    // user-defined, so we never second-guess those.
    let effectiveVertical: Vertical = vertical;
    if (!isCustomVertical(vertical)) {
      const suggested = suggestVertical(question.trim(), vertical);
      if (suggested) {
        effectiveVertical = suggested as Vertical;
        setVertical(effectiveVertical);
      }
    }

    setLoading(true);
    setError(null);

    // Pass the vertical explicitly — setVertical() above won't have
    // landed in this closure yet.
    await doSubmit({ vertical: effectiveVertical });
  }

  // The actual request. Kept separate from onSubmit so the optional
  // `override` argument can pass fresh values that should be used
  // INSTEAD of the closed-over state — needed by the non-blocking
  // vertical auto-switch, where setVertical() hasn't landed in this
  // closure yet. Passing the new values explicitly avoids a
  // stale-state submit.
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
          ...(attachments.length > 0 ? { 
            images: attachments.map(a => ({ base64: a.base64, mime: a.mime })) 
          } : {}),
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
        // Growth v1: burn the anon free question only now that we
        // know the answer exists. A failed submit costs nothing.
        if (!user) {
          const next = readAnonUsed() + 1;
          writeAnonUsed(next);
          setAnonUsed(next);
        }
        // Notify sidebar/history to refresh — new result is ready
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("atlas:history-changed"));
        }
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

  // Prevent Clerk hydration flicker — don't render until auth is loaded
  if (!isLoaded) return null;

  return (
    <AppShell>
      <AuthGateModal
        open={authGateOpen}
        onClose={() => setAuthGateOpen(false)}
      />

      {/* Top bar: top-right links */}
      <header className="flex items-center justify-between gap-3 px-6 py-3 text-xs text-atlas-muted">
          <div className="flex items-center gap-3">
            {/* Explore Crypto button removed */}
          </div>
          <div className="flex items-center gap-3">
            <a href="/demo" className="hover:text-atlas-accent">
              Demo
            </a>
            <a href="/news" className="hover:text-atlas-accent">News</a>
            <a href="/pricing" className="hover:text-atlas-accent">
              Pricing
            </a>
            <a href="/investors" className="hover:text-atlas-accent">
              Investors
            </a>
            <a
              href="/calculator"
              className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-atlas-accent px-2.5 py-1 font-medium text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)] transition-colors hover:bg-atlas-accent2"
              title="Free property investment calculator — Bond, Buy-to-Let, ROI, Transfer Costs"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <line x1="8" y1="7" x2="16" y2="7" />
                <line x1="8" y1="11" x2="9.5" y2="11" />
                <line x1="12" y1="11" x2="13.5" y2="11" />
                <line x1="15" y1="11" x2="16" y2="11" />
                <line x1="8" y1="14" x2="9.5" y2="14" />
                <line x1="12" y1="14" x2="13.5" y2="14" />
                <line x1="15" y1="14" x2="16" y2="14" />
                <line x1="8" y1="17" x2="9.5" y2="17" />
                <line x1="12" y1="17" x2="13.5" y2="17" />
                <line x1="15" y1="17" x2="16" y2="17" />
              </svg>
              Calculator
            </a>
          </div>
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
              {/* Anon landing hero — the value prop a signed-out
                  visitor needs before they'll type anything. Hidden
                  the moment they're signed in (they already know). */}
              {!user && (
                <div className="mb-6 flex max-w-2xl flex-col items-center text-center">
                  {/* ⚑ HOOK COPY — swap ATLAS_HOOK in lib/copy.ts */}
                  <h2 className="text-2xl font-bold tracking-tight text-atlas-text sm:text-3xl">
                    {ATLAS_HOOK}
                  </h2>
                  <p className="mt-2 text-sm text-atlas-muted">
                    {ATLAS_SUBHOOK}
                  </p>
                  {/* Offer pill. Once the free question is spent the
                      quota pill under the command bar says so — no
                      need to repeat it here. */}
                  {anonUsed < ANON_FREE_QUESTIONS && (
                    <span className="mt-3 rounded-full border border-atlas-accent/40 bg-atlas-accent/10 px-3 py-1 text-[11px] font-medium text-atlas-accent">
                      1 free question · no card
                    </span>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                    {[
                      "🇿🇦 SA-only data",
                      "Live signals (OSM, Google Places, Tavily)",
                      "Citation-grade answers",
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-atlas-border bg-atlas-surface px-2.5 py-0.5 text-[10px] text-atlas-muted"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-8 text-center">
                <h1 className="mb-2 text-4xl font-semibold tracking-tight text-atlas-text sm:text-5xl">
                  Hi {firstName}, I&apos;m Atlas.
                </h1>
                <p className="text-lg text-atlas-muted">
                  An AI Operating System for builders and investors.
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
                  {/* Active non-builtin vertical pill — a custom
                      token OR a land vertical we auto-switched to. */}
                  {!isBuiltinVertical(vertical) && (
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
                  {isBuiltinVertical(vertical) && (
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

                {/* Attachment previews */}
                {attachments.length > 0 && (
                  <div className="mb-2 flex gap-2">
                    {attachments.map((a, i) => (
                      <div key={i} className="relative group rounded-lg border border-atlas-border bg-atlas-surface2 overflow-hidden" style={{ width: 80, height: 80 }}>
                        {a.mime.startsWith('image/') ? (
                          <img src={a.base64} alt={a.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-atlas-muted text-[10px] p-1 text-center">
                            {a.name.slice(-4)}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Command bar */}
                <div className="rounded-xl border border-atlas-border bg-atlas-surface shadow-lg shadow-black/20 transition-colors focus-within:border-atlas-accent">
                  <div className="flex items-end gap-2 px-3 py-2">
                    <textarea
                      ref={inputRef}
                      value={question}
                      onChange={(e) => {
                        setQuestion(e.target.value);
                        resizeTextarea(e.target);
                      }}
                      placeholder={placeholder}
                      rows={1}
                      className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-2 py-1.5 text-sm text-atlas-text placeholder:text-atlas-muted focus:outline-none"
                      required
                      disabled={loading}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          // Trigger submit
                          const form = e.currentTarget.closest('form');
                          if (form) form.requestSubmit();
                        }
                      }}
                    />

                    {/* Attachment button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={handleFile}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      className={`flex-shrink-0 rounded-md p-1.5 transition-colors ${
                        attachments.length > 0 ? 'bg-atlas-accent/20 text-atlas-accent' : 'text-atlas-muted hover:bg-atlas-surface2 hover:text-atlas-text'
                      }`}
                      title={attachments.length > 0 ? `${attachments.length} file(s) attached` : 'Attach image or file'}
                      aria-label="Attach file"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </button>

                    {/* Mic button — speech to text */}
                    <button
                      type="button"
                      onClick={startListening}
                      disabled={loading || listening}
                      className={`flex-shrink-0 rounded-md p-1.5 transition-colors ${
                        listening
                          ? 'animate-pulse bg-red-500/20 text-red-400'
                          : 'text-atlas-muted hover:bg-atlas-surface2 hover:text-atlas-text'
                      }`}
                      title={listening ? 'Listening...' : 'Voice input'}
                      aria-label="Voice input"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                    </button>

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

                {/* Quota hint — only after the free question is spent,
                    and only for signed-out visitors. Stated once, quietly. */}
                {!user && anonUsed >= ANON_FREE_QUESTIONS && (
                  <div className="mt-2 flex justify-center">
                    <span className="rounded-full border border-atlas-border bg-atlas-surface px-2.5 py-0.5 text-[10px] text-atlas-muted">
                      1 of 1 free questions used ·{" "}
                      <a href="/sign-up" className="text-atlas-accent hover:underline">
                        create a free account
                      </a>
                    </span>
                  </div>
                )}

                {/* Question gallery — 20 SA-only prompts, grouped by
                    vertical. Replaces the old 4 mixed-country chips. */}
                {!loading && question.length === 0 && (
                  <QuestionGallery
                    onPick={(pick) => {
                      setQuestion(pick.question);
                      setVertical(pick.vertical as Vertical);
                      setError(null);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                  />
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
// Tue Jun 30 09:39:16 AM UTC 2026
