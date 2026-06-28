"use client";

import { AppShell } from "@/components/AppShell";
import { AtlasLogo } from "@/components/AtlasLogo";
import Link from "next/link";

export default function InvestorsPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        {/* Header */}
        <header className="mb-10 flex items-center justify-between border-b border-atlas-border pb-4">
          <div className="flex items-center gap-3">
            <AtlasLogo size={28} />
            <h1 className="text-xl font-semibold tracking-tight text-atlas-text">
              Atlas &middot; Investors
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs text-atlas-text hover:border-atlas-accent"
          >
            ← Back
          </Link>
        </header>

        {/* One-Pager */}
        <section className="space-y-8 text-sm leading-relaxed text-atlas-text">
          {/* Summary */}
          <div>
            <h2 className="mb-3 text-2xl font-semibold tracking-tight">
              Atlas — Africa's site selection engine.
            </h2>
            <p className="text-atlas-muted">
              Atlas answers the hardest question in African real estate:{" "}
              <em>where</em>. Where to build a gas station in Sandton. Where to
              find farmland in Lusaka. Where to open a restaurant in Nairobi.
            </p>
          </div>

          {/* Problem */}
          <div>
            <h3 className="mb-2 text-lg font-semibold">The Problem</h3>
            <p className="text-atlas-muted">
              African developers and investors spend 6–12 weeks on site selection.
              They drive around, call agents, read municipal plans, and guess.
              There is no Zillow for commercial land in Africa. There is no
              single source of truth for "where should I build this."
            </p>
          </div>

          {/* Solution */}
          <div>
            <h3 className="mb-2 text-lg font-semibold">Our Solution</h3>
            <p className="text-atlas-muted">
              Atlas is an AI-powered command bar. Type a question like
              "Where in Cape Town for a family restaurant?" and Atlas returns
              5 ranked sites — with real coordinates, real census data, real
              competitor maps, and full AI reasoning. It blends 10 data
              connectors (Overpass, Google Places, StatsSA, schools, transit,
              healthcare) with AI models (Gemini, OpenRouter Nemotron, curated
              stub) into one answer in under 60 seconds.
            </p>
          </div>

          {/* Traction */}
          <div>
            <h3 className="mb-2 text-lg font-semibold">Traction</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Cities", value: "12" },
                { label: "Verticals", value: "10" },
                { label: "Hand-curated sites", value: "350+" },
                { label: "Signal connectors", value: "10" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-atlas-border bg-atlas-surface2 p-4 text-center">
                  <div className="text-2xl font-bold text-atlas-accent">{s.value}</div>
                  <div className="mt-1 text-xs text-atlas-muted">{s.label}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-atlas-muted">
              Real usage from developers testing the product. Voice input, image
              attachment, auto-expanding prompts, and a curated stub fallback
              that works offline — Atlas is production-ready.
            </p>
          </div>

          {/* Market */}
          <div>
            <h3 className="mb-2 text-lg font-semibold">Market</h3>
            <p className="text-atlas-muted">
              African commercial real estate is a $1.7 trillion market growing at
              6.5% annually. Every new Shoprite, TotalEnergies, or residential
              estate needs site selection. Atlas serves the developers, investors,
              and builders who make those decisions — starting in South Africa and
              Zambia, expanding across the continent.
            </p>
          </div>

          {/* Business Model */}
          <div>
            <h3 className="mb-2 text-lg font-semibold">Business Model</h3>
            <p className="text-atlas-muted">
              Free tier for discovery. R250/month Pro for unlimited questions,
              all connectors, and saved history. R2,500/month Team for property
              funds and multi-user agencies. PayFast + Stripe for billing
              (SA-native + international).
            </p>
          </div>

          {/* The Ask */}
          <div className="rounded-xl border-2 border-atlas-accent bg-atlas-accent/5 p-6">
            <h3 className="mb-3 text-lg font-bold text-atlas-accent">We're Raising $250,000</h3>
            <p className="text-atlas-muted">
              To hire a founding engineer, add 50+ African cities to the curated
              catalog, pay for AI API credits (Gemini, OpenRouter), and launch
              a mobile app. At $250k, we have 18 months of runway to reach
              1,000 paying users and prove the model.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              {[
                { label: "Raise", value: "$250K" },
                { label: "Runway", value: "18 months" },
                { label: "Target", value: "1,000 paid" },
                { label: "Stage", value: "Pre-seed" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-atlas-surface2 p-3 text-center">
                  <div className="font-bold text-atlas-text">{s.value}</div>
                  <div className="mt-0.5 text-atlas-muted">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 text-center">
              <a
                href="mailto:david@naudecore.com"
                className="inline-flex items-center gap-2 rounded-md bg-atlas-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-atlas-accent2 transition-colors"
              >
                Contact David Nkana
              </a>
            </div>
          </div>

          {/* Team */}
          <div>
            <h3 className="mb-2 text-lg font-semibold">Team</h3>
            <p className="text-atlas-muted">
              <strong>David Nkana</strong> — Founder & CEO. Zambian builder and
              developer. Built Atlas from the ground up with AI tooling.
              Previously at Naudé Core Ventures.
            </p>
          </div>
        </section>

        <footer className="mt-16 border-t border-atlas-border pt-6 text-center text-xs text-atlas-muted">
          <p>Atlas · {new Date().getFullYear()} · Built for African developers and investors.</p>
        </footer>
      </div>
    </AppShell>
  );
}
