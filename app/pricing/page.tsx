import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { AtlasLogo } from "@/components/AtlasLogo";
import Link from "next/link";

/**
 * Day 9 — Pricing page.
 *
 * Three tiers: Free / Pro / Team. No Stripe integration in v1 — the
 * "Get started" buttons route to the waitlist form (or, for Free,
 * to the home page so the user can start asking questions right
 * away). We use this page to (a) communicate the wedge and value,
 * and (b) capture intent via the waitlist so we can follow up
 * with paying customers when we wire Stripe in Day 12-15.
 *
 * Pricing is in ZAR (the primary market) with a USD conversion for
 * international design partners. We don't accept payment yet —
 * the buttons lead to the waitlist.
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
            {/* Free */}
            <PricingCard
              tier="Free"
              price="R0"
              cadence="forever"
              blurb="For trying Atlas out"
              cta={{ label: "Start asking", href: "/" }}
              features={[
                "5 questions per day",
                "23 African cities",
                "AI reasoning + curated stub",
                "Save up to 20 questions",
                "Pin and delete your history",
              ]}
              highlight={false}
            />

            {/* Pro */}
            <PricingCard
              tier="Pro"
              price="R250"
              cadence="per month"
              blurb="For land developers, property investors, and builders"
              cta={{ label: "Join the waitlist", href: "/waitlist?plan=pro" }}
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

            {/* Team */}
            <PricingCard
              tier="Team"
              price="R2,500"
              cadence="per month"
              blurb="For property funds, agencies, and multi-user teams"
              cta={{ label: "Join the waitlist", href: "/waitlist?plan=team" }}
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
              <li>· AI reasoning engine (Gemini 3.5 Flash + Llama 3.3 70B + Qwen 2.5 72B + curated stub fallback)</li>
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

        <footer className="mt-auto px-6 py-6 text-center text-xs text-atlas-muted">
          <p>
            Atlas · {new Date().getFullYear()} · Built for land
            developers, property investors, and builders.
          </p>
        </footer>
    </AppShell>
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
  cta: { label: string; href: string };
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
      <Link
        href={cta.href}
        className={`mt-5 block rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
          highlight
            ? "bg-atlas-accent text-white hover:bg-atlas-accent2"
            : "border border-atlas-border bg-atlas-bg text-atlas-text hover:border-atlas-accent"
        }`}
      >
        {cta.label}
      </Link>
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
