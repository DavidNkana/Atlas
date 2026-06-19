import { AppShell } from "@/components/AppShell";
import { AtlasLogo } from "@/components/AtlasLogo";
import Link from "next/link";
import PricingClient from "./PricingClient";

/**
 * Day 13 — Pricing page.
 *
 * Server component shell that wraps PricingClient (a client
 * component that handles the Stripe checkout button clicks).
 *
 * Three tiers: Free / Pro / Team. Pro and Team now trigger a
 * real Stripe Checkout session. If Stripe isn't configured
 * (no STRIPE_SECRET_KEY in Vercel env) the buttons fall back
 * to /waitlist with a reason so David still captures intent.
 */
export default function PricingPage() {
  return (
    <AppShell>
      <header className="flex items-center justify-between border-b border-atlas-border px-6 py-4">
        <div className="flex items-center gap-3">
          <AtlasLogo size={24} />
          <h1 className="text-lg font-semibold tracking-tight text-atlas-text">
            Pricing
          </h1>
        </div>
        <Link
          href="/"
          className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
        >
          ← Back
        </Link>
      </header>

      <PricingClient />

      <footer className="mt-auto px-6 py-6 text-center text-xs text-atlas-muted">
        <p>
          Atlas · {new Date().getFullYear()} · Built for land
          developers, property investors, and builders.
        </p>
      </footer>
    </AppShell>
  );
}
