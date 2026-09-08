import { AppShell } from "@/components/AppShell";
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
    <AppShell patterned>
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
