"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

/**
 * Day 13 — Pricing page (client component).
 *
 * The buttons for Pro and Team now call /api/stripe/checkout
 * which creates a real Stripe Checkout session and redirects
 * the user to Stripe. Free stays as a link to the home page.
 *
 * If the user is not signed in, we redirect them to /sign-in
 * first, then back to /pricing after sign-in. This is the
 * standard pattern for paid SaaS — you can't pay without an
 * account because we need to know who to credit.
 *
 * If Stripe isn't configured (no STRIPE_SECRET_KEY), the
 * buttons fall back to /waitlist so David still captures
 * intent. The status banner at the top tells the user.
 */
export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-10 text-center">
        <h2 className="mb-3 text-3xl font-semibold tracking-tight text-atlas-text sm:text-4xl">
          Find the right plot in 30 seconds, not 6 weeks.
        </h2>
        <p className="mx-auto max-w-2xl text-sm text-atlas-muted">
          Free to start. Pro when you need real data. Team when
          you scale. All plans include the same Atlas intelligence
          engine — you pay for volume and integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PricingCard
          tier="Free"
          price="R0"
          cadence="forever"
          blurb="For trying Atlas out"
          cta={{ kind: "link", label: "Start asking", href: "/" }}
          features={[
            "5 questions per day",
            "23 African cities",
            "AI reasoning + curated stub",
            "Save up to 20 questions",
            "Pin and delete your history",
          ]}
          highlight={false}
        />

        <PricingCard
          tier="Pro"
          price="R250"
          cadence="per month"
          blurb="For land developers, property investors, and builders"
          cta={{ kind: "checkout", plan: "pro", label: "Subscribe to Pro" }}
          features={[
            "Unlimited questions",
            "All 4 data connectors (real-time)",
            "Real Google Places POI density",
            "Real StatsSA demographics",
            "Save + pin unlimited history",
            "Email support",
            "Cancel any time",
          ]}
          highlight
        />

        <PricingCard
          tier="Team"
          price="R2,500"
          cadence="per month"
          blurb="For property funds, agencies, and multi-user teams"
          cta={{ kind: "checkout", plan: "team", label: "Subscribe to Team" }}
          features={[
            "Everything in Pro",
            "5 seats included",
            "Shared team dashboard",
            "Custom verticals (yours, not ours)",
            "Priority support + onboarding",
            "Quarterly strategy review",
            "Invoice billing available",
          ]}
          highlight={false}
        />
      </div>

      <div className="mt-10 rounded-xl border border-atlas-border bg-atlas-surface p-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-atlas-accent">
          What every plan includes
        </h3>
        <ul className="grid grid-cols-1 gap-2 text-xs text-atlas-text sm:grid-cols-2">
          <li>· AI reasoning engine (Gemini + Tavily + Llama 3.3 70B + Qwen 2.5 72B + curated stub fallback)</li>
          <li>· Mapbox map with markers, popups, and auto-fit</li>
          <li>· Real-time ranking chart with hover tooltips</li>
          <li>· OpenStreetMap POI density data</li>
          <li>· Suburb demographic profiles (census data)</li>
          <li>· 23 African cities with location-aware data</li>
          <li>· Click-to-expand site cards with full AI reasoning</li>
          <li>· Dark theme + light theme + custom theme toggle</li>
        </ul>
      </div>

      <div className="mt-10 text-center text-xs text-atlas-muted">
        <p>
          Need something different?{" "}
          <Link href="/waitlist" className="text-atlas-accent hover:underline">
            Tell us what you need
          </Link>
          . We're a small team and we'll work with you on
          custom verticals, data sources, and pricing for larger
          teams.
        </p>
        <p className="mt-3">
          Atlas is built for African real estate. Prices in ZAR.
          International teams welcome — ~$14/mo Pro, ~$140/mo
          Team.
        </p>
      </div>
    </div>
  );
}

function PricingCard({
  tier,
  price,
  cadence,
  blurb,
  cta,
  features,
  highlight,
}: {
  tier: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: { kind: "link"; label: string; href: string } | { kind: "checkout"; plan: "pro" | "team"; label: string };
  features: string[];
  highlight: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        highlight
          ? "border-atlas-accent bg-atlas-surface shadow-lg shadow-atlas-accent/10"
          : "border-atlas-border bg-atlas-surface"
      }`}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-atlas-accent px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Most popular
          </span>
        </div>
      )}
      <h3 className="text-lg font-semibold text-atlas-text">{tier}</h3>
      <p className="mt-1 text-xs text-atlas-muted">{blurb}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-atlas-text">{price}</span>
        <span className="text-xs text-atlas-muted">/ {cadence}</span>
      </div>
      <PricingCta cta={cta} tier={tier} />
      <ul className="mt-5 space-y-2 text-xs text-atlas-muted">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-atlas-accent"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PricingCta({
  cta,
  tier,
}: {
  cta: { kind: "link"; label: string; href: string } | { kind: "checkout"; plan: "pro" | "team"; label: string };
  tier: string;
}) {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (cta.kind === "link") {
    return (
      <Link
        href={cta.href}
        className="mt-5 block rounded-md border border-atlas-border bg-atlas-bg px-4 py-2 text-center text-sm font-medium text-atlas-text transition-colors hover:border-atlas-accent"
      >
        {cta.label}
      </Link>
    );
  }

  // checkout kind
  async function onClick() {
    if (cta.kind !== "checkout") return; // Type guard; shouldn't happen
    if (!isSignedIn) {
      // Send them through sign-in first, then back here.
      router.push(`/sign-in?redirect_url=/pricing`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: cta.plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 503 = Stripe not configured yet. Fall back to waitlist.
        if (res.status === 503) {
          router.push(`/waitlist?plan=${cta.plan}&reason=stripe-not-configured`);
          return;
        }
        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=/pricing`);
          return;
        }
        setError(data.error || `Checkout failed (${res.status})`);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("No checkout URL returned");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="block w-full rounded-md bg-atlas-accent px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-atlas-accent2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Redirecting…" : cta.label}
      </button>
      {error && (
        <p className="mt-1 text-[10px] text-rose-400">{error}</p>
      )}
    </div>
  );
}
