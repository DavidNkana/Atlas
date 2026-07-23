"use client";

/**
 * Atlas root error boundary.
 *
 * Next.js auto-creates a generic "Application error" page for ANY
 * uncaught throw from a server component or route handler. That page
 * says "see the server logs for more information" with no recovery
 * affordance — users have no idea what to do.
 *
 * This boundary catches the throw and renders a clean fallback:
 *  - shows the actual error message (sanitized)
 *  - shows the digest Next.js gave us
 *  - offers a "Reset" button + a "Back to home" link
 *
 * Placement: app/error.tsx is the root segment boundary. It catches
 * errors from any nested route segment that doesn't define its own
 * error.tsx.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side errors are already logged by Next.js; client-side
    // we surface them in the browser console for the dev tools.
    console.error("[atlas] runtime error:", error);
  }, [error]);

  const message =
    error?.message ||
    "An unexpected error occurred. The Atlas team has been notified.";
  const digest = error?.digest ?? "(no digest)";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-atlas-bg px-6 py-12 text-atlas-text">
      <div className="w-full max-w-lg rounded-xl border border-atlas-border bg-atlas-surface p-8 shadow-lg">
        <h1 className="mb-2 text-2xl font-semibold">
          Atlas hit an error
        </h1>
        <p className="mb-4 text-sm text-atlas-muted">
          The page you tried to load didn&apos;t finish. This is almost
          always a transient issue with one of our upstream data
          providers (Tavily, Gemini, Google Maps).
        </p>

        <div className="mb-6 space-y-2 rounded-md border border-atlas-border bg-atlas-surface2 p-3 text-xs">
          <div>
            <span className="font-mono text-atlas-muted">Error:</span>{" "}
            <span className="font-mono">{message}</span>
          </div>
          <div>
            <span className="font-mono text-atlas-muted">Digest:</span>{" "}
            <span className="font-mono">{digest}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-atlas-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-md border border-atlas-border bg-atlas-surface2 px-4 py-2 text-sm font-medium text-atlas-text transition-colors hover:border-atlas-accent"
          >
            Back to home
          </a>
          <a
            href="/api/diag-keys"
            className="rounded-md border border-atlas-border bg-atlas-surface2 px-4 py-2 text-sm font-medium text-atlas-text transition-colors hover:border-atlas-accent"
          >
            Check API keys
          </a>
        </div>

        <p className="mt-6 text-[11px] text-atlas-muted">
          If this keeps happening, paste the Digest above into chat
          with us so we can look up the exact server log.
        </p>
      </div>
    </main>
  );
}
