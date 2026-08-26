"use client";

/**
 * Atlas — Auth gate modal.
 *
 * Shown when an unauthenticated visitor tries to submit the ask
 * prompt. We don't send the question to /api/ask (the backend would
 * reject it with 401 + "Sign in required"); we show this friendly
 * modal first so the user knows exactly why their submit didn't go
 * through, and what to do about it.
 *
 * Two outbound paths:
 *   - "Create account" -> /sign-up (Clerk-hosted)
 *   - "Or, request a demo" -> /demo (existing ScheduleDemoForm)
 *
 * The user's question stays in the textarea when they close this
 * modal. We deliberately do NOT round-trip the question via URL
 * or sessionStorage — most users type again faster than that
 * infrastructure would be reliable.
 *
 * Smiley face: inline animated SVG, not a Lottie file. Atlas's
 * design language is already 100% inline SVG (see ConfirmDialog,
 * RankedSiteCard, Sidebar) so adding a Lottie dep would be visually
 * inconsistent and add ~30KB. The CSS animation here is two
 * keyframes (gentle bounce + occasional blink) — same "alive"
 * feel as a Lottie at 1/100th the cost.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AuthGateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  // Esc closes the modal — same pattern as ConfirmDialog.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-auth-gate-title"
    >
      {/* Backdrop — click to close */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-sm rounded-2xl border border-atlas-border bg-atlas-surface p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — top right, mirrors the existing modal pattern */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-atlas-muted transition hover:bg-atlas-bg hover:text-atlas-text"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Animated smiley face — centered, eye blink + gentle bounce.
            Pure SVG + CSS keyframes defined inline (Tailwind arbitrary
            values) so we don't need a separate stylesheet. */}
        <div className="mb-4 flex justify-center">
          <div className="atlas-smiley-bounce">
            <svg
              width="88"
              height="88"
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              className="atlas-smiley-blink"
              aria-hidden="true"
            >
              {/* Face circle */}
              <circle cx="50" cy="50" r="42" fill="#FACC15" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="#CA8A04" strokeWidth="2.5" />
              {/* Cheek blush — small soft pink circles */}
              <circle cx="32" cy="60" r="5" fill="#FB7185" opacity="0.45" />
              <circle cx="68" cy="60" r="5" fill="#FB7185" opacity="0.45" />
              {/* Eyes — two filled circles, animate to flat lines via CSS */}
              <circle cx="38" cy="46" r="4.5" fill="#1F2937" className="atlas-eye-left" />
              <circle cx="62" cy="46" r="4.5" fill="#1F2937" className="atlas-eye-right" />
              {/* Smile — a curved path */}
              <path
                d="M 34 62 Q 50 76 66 62"
                fill="none"
                stroke="#1F2937"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Title + body */}
        <h2
          id="atlas-auth-gate-title"
          className="mb-2 text-center text-base font-semibold text-atlas-text"
        >
          Sign in to ask Atlas
        </h2>
        <p className="mb-5 text-center text-xs leading-relaxed text-atlas-muted">
          You&apos;ll need a free account to chat with Atlas. We&apos;ll
          keep your question history and saved sites safe. Already have
          one?{" "}
          <a
            href="/sign-in"
            className="font-medium text-atlas-accent hover:underline"
          >
            Sign in
          </a>
          .
        </p>

        {/* Primary: create account */}
        <button
          type="button"
          onClick={() => router.push("/sign-up")}
          className="w-full rounded-md bg-atlas-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-atlas-accent2"
        >
          Create free account
        </button>

        {/* Divider with copy */}
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-atlas-border/60" />
          <span className="text-[10px] uppercase tracking-wider text-atlas-muted">
            or
          </span>
          <div className="h-px flex-1 bg-atlas-border/60" />
        </div>

        {/* Secondary: request a demo — routes to existing /demo page
            with the inline ScheduleDemoForm. */}
        <button
          type="button"
          onClick={() => router.push("/demo")}
          className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-xs font-medium text-atlas-text transition hover:border-atlas-accent"
        >
          Request a demo instead
        </button>

        <p className="mt-4 text-center text-[10px] text-atlas-muted">
          Atlas is in private beta. Demo requests get a reply within 24h.
        </p>
      </div>
    </div>
  );
}
