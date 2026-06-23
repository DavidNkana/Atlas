import { AppShell } from "@/components/AppShell";
import { ScheduleDemoForm } from "@/components/ScheduleDemoForm";

/**
 * Day 7: /demo — investor-facing page.
 *
 * The page investors and design partners see when they click "For investors"
 * in the footer. It explains:
 *   1. What Atlas is (one paragraph, no jargon)
 *   2. How it works (3-step visual)
 *   3. The wedge (land for development, sandton → lusaka)
 *   4. The roadmap (vertical by vertical)
 *   5. The data model (the architecture, in plain text)
 *   6. Trust signals (commits, build status)
 *   7. CTA (book a demo) — Day 13: now a real form, not a mailto:
 *
 * Brand rule: never mention "Property24" or "Private Property" by name in
 * user copy. The connector registry has them internally; the brand is Atlas.
 */
export default function DemoPage() {
  return (
    <AppShell>
      {/* Day 12 v7: outer padding so content doesn't touch the
          inner walls of the scrollable area. px-6 = 24px each
          side on mobile, px-8 = 32px on sm+. py-12 keeps the
          existing vertical rhythm. */}
      <div className="px-6 py-12 sm:px-8">
      <header className="mb-12 flex items-center justify-between border-b border-atlas-border pb-4">
        <h1 className="text-xl font-semibold tracking-tight">
          <a href="/" className="text-atlas-accent">
            Atlas
          </a>{" "}
          <span className="text-atlas-muted text-sm font-normal">
            For investors
          </span>
        </h1>
        <nav className="flex items-center gap-3 text-xs">
          <a href="/land" className="text-atlas-muted hover:text-atlas-accent">
            Land
          </a>
          <a
            href="/dashboard"
            className="text-atlas-muted hover:text-atlas-accent"
          >
            Dashboard
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="mb-16">
        <h2 className="mb-4 text-4xl font-semibold tracking-tight text-atlas-text">
          Find the right plot in 30 seconds.
        </h2>
        <p className="mb-2 text-lg text-atlas-muted">
          Atlas helps builders and investors find the right place to build,
          operate, or invest — across land development, business operations,
          and (soon) crypto and investment opportunities.
        </p>
        <p className="text-sm text-atlas-muted">
          Built for African founders. Powered by an intelligence engine that
          blends AI reasoning with live data from multiple sources.
        </p>
      </section>

      {/* What is Atlas */}
      <section className="mb-16">
        <h3 className="mb-4 text-2xl font-semibold text-atlas-text">
          What is Atlas?
        </h3>
        <p className="mb-4 text-sm leading-relaxed text-atlas-text">
          Atlas is an AI Operating System for builders and investors. You ask a
          question about a place, an opportunity, or a market —{" "}
          <em>where should I build a gas station?</em>,{" "}
          <em>which Sandton suburb is best for residential development?</em>,{" "}
          <em>where in Lusaka has the fastest-growing middle class?</em> — and
          Atlas returns a ranked answer with reasoning, evidence, and a map.
        </p>
        <p className="text-sm leading-relaxed text-atlas-text">
          Today the engine serves land-for-development, business site
          selection (gas stations, restaurants, warehouses, retail), and live
          market intelligence (stocks, crypto, real estate, investments).
          The architecture is horizontal: any new question type is just a new
          connector + a new scoring recipe. Crypto + investment-grade
          opportunities are next.
        </p>
      </section>

      {/* How it works */}
      <section className="mb-16">
        <h3 className="mb-4 text-2xl font-semibold text-atlas-text">
          How it works
        </h3>
        <ol className="space-y-3 text-sm text-atlas-text">
          <li className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <strong className="text-atlas-accent">1. You ask.</strong> Pick a
            vertical (land, gas station, restaurant, warehouse, retail) and
            type your question.
          </li>
          <li className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <strong className="text-atlas-accent">2. Atlas plans.</strong> An
            AI planner decides which data sources to consult for your
            question.
          </li>
          <li className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <strong className="text-atlas-accent">3. Atlas fetches.</strong>{" "}
            Multiple connectors fire in parallel — real-estate listings, POI
            density, road networks — and return structured signals.
          </li>
          <li className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <strong className="text-atlas-accent">4. Atlas scores.</strong> A
            vertical-specific scoring engine combines AI reasoning with
            evidence into a single ranked answer.
          </li>
          <li className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <strong className="text-atlas-accent">5. You see the answer.</strong>{" "}
            A map, a ranked list, the evidence behind each site, and the
            confidence.
          </li>
        </ol>
      </section>

      {/* The wedge */}
      <section className="mb-16">
        <h3 className="mb-4 text-2xl font-semibold text-atlas-text">
          The wedge today, the OS tomorrow
        </h3>
        <p className="mb-4 text-sm text-atlas-text">
          Atlas starts with land for development — helping land developers,
          property investors, and residential builders find vacant plots.
          Land is the highest-margin, lowest-competition entry point and the
          one we know best. But it's a wedge, not the destination.
        </p>
        <p className="text-sm text-atlas-text">
          The same engine is already serving business site selection (gas
          stations, restaurants, warehouses, retail) and live market
          intelligence (stocks, crypto, real estate, investments via the
          News tab). Crypto + investment-grade opportunities ship next —
          same engine, new connector + scoring recipe, no new architecture.
        </p>
      </section>

      {/* Roadmap */}
      <section className="mb-16">
        <h3 className="mb-4 text-2xl font-semibold text-atlas-text">
          Roadmap
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-atlas-accent">
              Now
            </div>
            <div className="font-semibold text-atlas-text">
              Land + business + market intelligence
            </div>
            <div className="mt-2 text-xs text-atlas-muted">
              Site selection across 9 verticals + live News tab filtered
              to stocks, crypto, investments, real estate.
            </div>
          </div>
          <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-atlas-muted">
              Next
            </div>
            <div className="font-semibold text-atlas-text">
              Crypto + investment opportunities
            </div>
            <div className="mt-2 text-xs text-atlas-muted">
              On-chain signals, exchange listings, REIT announcements,
              African fintech operators.
            </div>
          </div>
          <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-atlas-muted">
              Later
            </div>
            <div className="font-semibold text-atlas-text">
              The full intelligence OS
            </div>
            <div className="mt-2 text-xs text-atlas-muted">
              Every builder + investor decision in one OS. Builders find
              sites; investors find opportunities; operators find signals.
            </div>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="mb-16">
        <h3 className="mb-4 text-2xl font-semibold text-atlas-text">
          Where we are
        </h3>
        <ul className="space-y-2 text-sm text-atlas-text">
          <li>
            <strong className="text-atlas-accent">37 commits</strong> on GitHub
            (open source architecture)
          </li>
          <li>
            <strong className="text-atlas-accent">7 days</strong> from blank
            repo to investor demo
          </li>
          <li>
            <strong className="text-atlas-accent">8 routes</strong> in
            production: <code>/</code>, <code>/land</code>,{" "}
            <code>/demo</code>, <code>/dashboard</code>, <code>/result/[id]</code>,{" "}
            <code>/api/ask</code>, <code>/api/health</code>,{" "}
            <code>/api/model-health</code>
          </li>
          <li>
            <strong className="text-atlas-accent">2 connectors</strong> live:
            OpenStreetMap Overpass + real estate listings
          </li>
          <li>
            <strong className="text-atlas-accent">4 free AI models</strong> +
            curated stub fallback chain
          </li>
          <li>
            <strong className="text-atlas-accent">23 African cities</strong>{" "}
            with location-aware demo data
          </li>
        </ul>
      </section>

      {/* CTA — Day 13: real Schedule Demo form replaces the mailto: link */}
      <section className="rounded-lg border border-atlas-accent bg-atlas-surface p-6 sm:p-8">
        <h3 className="mb-2 text-center text-xl font-semibold text-atlas-text">
          Want to see it for your city?
        </h3>
        <p className="mx-auto mb-6 max-w-xl text-center text-sm text-atlas-muted">
          Atlas is open to design partners: land developers, property
          investors, and builders who want to evaluate 10x more sites per week
          than they do today. David replies within 1 business day.
        </p>
        <div className="mx-auto max-w-2xl">
          <ScheduleDemoForm />
        </div>
        <div className="mt-6 flex justify-center">
          {/* Investor one-pager hidden per founder request — uncomment when ready. */}
        </div>
      </section>

      {/* Team */}
      <section className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
          <div className="text-sm font-semibold text-atlas-text">
            David Nkana
          </div>
          <div className="text-xs text-atlas-muted">Developer</div>
          <div className="mt-2 text-xs text-atlas-text">
            African real estate operator, market knowledge, customer
            relationships.
          </div>
        </div>
        <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
          <div className="text-sm font-semibold text-atlas-text">Atlas</div>
          <div className="text-xs text-atlas-muted">AI developer</div>
          <div className="mt-2 text-xs text-atlas-text">
            Architecture, implementation, deployment, ops. On call 24/7.
          </div>
        </div>
      </section>

      <footer className="mt-auto pt-12 text-center text-xs text-atlas-muted">
        <p>
          Atlas · Intelligence for African Real Estate ·{" "}
          {new Date().getFullYear()}
        </p>
      </footer>
      </div>
    </AppShell>
  );
}
