"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { AtlasLogo } from "@/components/AtlasLogo";
import Link from "next/link";

/**
 * Day 9 — Waitlist form.
 *
 * Captures design-partner leads. The form POSTs to /api/waitlist
 * which writes to Supabase. We read the `plan` URL parameter
 * client-side from window.location.search so the page can be
 * statically pre-rendered (avoids Next.js's useSearchParams +
 * Suspense requirement for client components).
 *
 * After submit we show a confirmation state with the user's email
 * and a "what happens next" panel. We don't redirect — the user
 * can keep exploring the product.
 */
const VERTICALS = [
  { value: "residential_land", label: "Residential land" },
  { value: "commercial_land", label: "Commercial land" },
  { value: "agricultural_land", label: "Agricultural land" },
  { value: "industrial_land", label: "Industrial land" },
  { value: "mixed_use_land", label: "Mixed-use land" },
  { value: "gas_station", label: "Gas station" },
  { value: "restaurant", label: "Restaurant" },
  { value: "warehouse", label: "Warehouse" },
  { value: "retail_shop", label: "Retail" },
  { value: "other", label: "Other" },
];

const USER_TYPES = [
  { value: "land_developer", label: "Land developer" },
  { value: "property_investor", label: "Property investor / REIT" },
  { value: "residential_builder", label: "Residential builder" },
  { value: "agent", label: "Real estate agent" },
  { value: "consultant", label: "Site-selection consultant" },
  { value: "other", label: "Other" },
];

function readPlan(): "free" | "pro" | "team" {
  if (typeof window === "undefined") return "free";
  const p = new URLSearchParams(window.location.search).get("plan");
  return p === "team" || p === "pro" ? p : "free";
}

export default function WaitlistPage() {
  const plan = readPlan();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState("residential_land");
  const [userType, setUserType] = useState("land_developer");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          vertical,
          plan,
          userType,
          message: message.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Request failed: ${res.status}`);
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen bg-atlas-bg text-atlas-text">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <header className="flex items-center gap-3 border-b border-atlas-border px-6 py-4">
            <AtlasLogo size={24} />
            <h1 className="text-lg font-semibold tracking-tight text-atlas-text">
              You&apos;re on the list
            </h1>
          </header>
          <div className="mx-auto w-full max-w-md px-6 py-12">
            <div className="rounded-2xl border border-atlas-border bg-atlas-surface p-8 text-center">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-400"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-semibold text-atlas-text">
                Thanks, {name || "there"}!
              </h2>
              <p className="mb-6 text-sm text-atlas-muted">
                We saved your interest for the{" "}
                <span className="font-medium text-atlas-text">{plan.toUpperCase()}</span>{" "}
                plan. We&apos;ll email you at <span className="font-medium text-atlas-text">{email}</span>{" "}
                when early access opens.
              </p>
              <div className="mb-6 rounded-md border border-atlas-border bg-atlas-bg p-3 text-left text-xs text-atlas-muted">
                <p className="mb-1 font-semibold text-atlas-text">What happens next</p>
                <ul className="space-y-1">
                  <li>· We review early access requests weekly</li>
                  <li>· You&apos;ll get an email with setup + a 1-on-1 call if you want</li>
                  <li>· First 5 design partners get 3 months free in exchange for feedback</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link
                  href="/"
                  className="rounded-md bg-atlas-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2"
                >
                  Try Atlas now
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-md border border-atlas-border bg-atlas-bg px-4 py-2 text-sm font-medium text-atlas-text transition-colors hover:border-atlas-accent"
                >
                  See pricing
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-atlas-bg text-atlas-text">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex items-center justify-between border-b border-atlas-border px-6 py-4">
          <div className="flex items-center gap-3">
            <AtlasLogo size={24} />
            <h1 className="text-lg font-semibold tracking-tight text-atlas-text">
              Join the waitlist
            </h1>
            <span className="rounded bg-atlas-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-atlas-accent">
              {plan}
            </span>
          </div>
          <Link
            href="/pricing"
            className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
          >
            ← Pricing
          </Link>
        </header>

        <div className="mx-auto w-full max-w-lg px-6 py-10">
          <div className="mb-6">
            <h2 className="mb-2 text-2xl font-semibold tracking-tight text-atlas-text">
              Help us build Atlas for {plan === "free" ? "everyone" : plan === "pro" ? "land developers like you" : "teams like yours"}.
            </h2>
            <p className="text-sm text-atlas-muted">
              Tell us a bit about you. We use this to prioritise
              design partners and to follow up with relevant use
              cases. We don&apos;t share your email.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-atlas-border bg-atlas-surface p-6"
          >
            <div className="space-y-4">
              <Field label="Email" required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none"
                />
              </Field>

              <Field label="Name (optional)">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none"
                />
              </Field>

              <Field label="I am a" required>
                <select
                  value={userType}
                  onChange={(e) => setUserType(e.target.value)}
                  className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text focus:border-atlas-accent focus:outline-none"
                >
                  {USER_TYPES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="I'm looking for land for" required>
                <select
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                  className="w-full rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text focus:border-atlas-accent focus:outline-none"
                >
                  {VERTICALS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Anything else? (optional)">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What are you trying to find? What's missing from the product today?"
                  rows={3}
                  maxLength={500}
                  className="w-full resize-none rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-muted focus:border-atlas-accent focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-atlas-muted">
                  {message.length}/500
                </p>
              </Field>
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="mt-5 w-full rounded-md bg-atlas-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Joining…" : `Join the ${plan} waitlist`}
            </button>
            <p className="mt-3 text-center text-[10px] text-atlas-muted">
              By joining you agree to receive one email from us. No
              spam, no sharing, unsubscribe any time.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
        {label}
        {required && <span className="ml-1 text-atlas-accent">*</span>}
      </label>
      {children}
    </div>
  );
}
