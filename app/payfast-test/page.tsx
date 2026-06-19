"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

type PayfastTestResponse = {
  timestamp: string;
  configured: boolean;
  isSandbox: boolean;
  baseUrl: string;
  merchantIdPrefix: string | null;
  envPresent: Record<string, boolean>;
  plan: string;
  checkoutUrlPreview: string | null;
  buildError: string | null;
  instructions: string;
};

/**
 * Day 15 v2 — /payfast-test (admin-only by URL)
 *
 * Friendly UI wrapper around /api/payfast/test. Shows:
 * - Whether PayFast is configured (big green/red status badge)
 * - Sandbox vs production mode
 * - The 4 env var presence flags
 * - A button to copy the preview checkout URL to clipboard
 * - Step-by-step setup instructions if not configured
 *
 * Why this exists: David needs a way to verify the PayFast
 * wiring from a browser without curling. The diagnostic endpoint
 * is the source of truth; this page just renders it nicely.
 *
 * Auth: requires sign-in (same as the API endpoint).
 */
export default function PayfastTestPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [data, setData] = useState<PayfastTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setError("Sign in to view this page");
      setLoading(false);
      return;
    }
    fetch("/api/payfast/test", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setData(j);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-atlas-bg text-atlas-muted">
        Loading PayFast diagnostics…
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

  return (
    <div className="min-h-screen bg-atlas-bg p-6 text-atlas-text">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <a
            href="/admin"
            className="text-xs text-atlas-muted hover:text-atlas-accent"
          >
            ← back to /admin
          </a>
          <h1 className="mt-2 text-2xl font-semibold">PayFast wiring check</h1>
          <p className="mt-1 text-sm text-atlas-muted">
            Verifies the env vars + signature builder end-to-end without
            making a real payment. Run this after pasting credentials into
            Vercel.
          </p>
        </div>

        {/* Status badge */}
        <div
          className={`rounded-xl border p-4 ${
            data.configured
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                data.configured ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span className="text-sm font-semibold">
              {data.configured
                ? `PayFast is ${data.isSandbox ? "SANDBOX" : "LIVE"} and ready`
                : "PayFast is NOT configured"}
            </span>
          </div>
          {data.merchantIdPrefix && (
            <div className="mt-2 text-xs text-atlas-muted">
              Merchant ID: {data.merchantIdPrefix}… · Base URL: {data.baseUrl}
            </div>
          )}
        </div>

        {/* Env var presence matrix */}
        <div className="rounded-xl border border-atlas-border bg-atlas-surface p-4">
          <h2 className="text-sm font-semibold">Environment variables</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {Object.entries(data.envPresent).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-md border border-atlas-border bg-atlas-bg px-3 py-2"
              >
                <span className="font-mono text-atlas-muted">{k}</span>
                <span
                  className={
                    v ? "text-emerald-400" : "text-amber-400"
                  }
                >
                  {v ? "✓ set" : "✗ missing"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Preview checkout URL */}
        {data.checkoutUrlPreview && (
          <div className="rounded-xl border border-atlas-border bg-atlas-surface p-4">
            <h2 className="text-sm font-semibold">
              Preview checkout URL ({data.plan})
            </h2>
            <p className="mt-1 text-xs text-atlas-muted">
              Open this in a new tab to test the PayFast hosted checkout
              page. In sandbox mode, use the test card
              <span className="mx-1 rounded bg-atlas-bg px-1 py-0.5 font-mono">
                4000000000000002
              </span>
              with any future expiry + any CVV.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={data.checkoutUrlPreview}
                className="flex-1 truncate rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 font-mono text-xs text-atlas-muted"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(data.checkoutUrlPreview!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="rounded-md bg-atlas-accent px-4 py-2 text-xs font-medium text-white hover:bg-atlas-accent2"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <a
                href={data.checkoutUrlPreview}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-atlas-border bg-atlas-bg px-4 py-2 text-xs font-medium text-atlas-text hover:border-atlas-accent"
              >
                Open ↗
              </a>
            </div>
          </div>
        )}

        {data.buildError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300">
            Signature build error: {data.buildError}
          </div>
        )}

        {/* Setup instructions */}
        <div className="rounded-xl border border-atlas-border bg-atlas-surface p-4">
          <h2 className="text-sm font-semibold">Setup notes</h2>
          <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-atlas-muted">
            {data.instructions}
          </pre>
        </div>
      </div>
    </div>
  );
}
