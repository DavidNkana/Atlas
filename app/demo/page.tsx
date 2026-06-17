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
 *   7. CTA (book a demo)
 *
 * Brand rule: never mention "Property24" or "Private Property" by name in
 * user copy. The connector registry has them internally; the brand is Atlas.
 */
export default function DemoPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-12">
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
          Atlas helps land developers, property investors, and builders find
          the right piece of land in 30 seconds instead of 6 weeks.
        </p>
        <p className="text-sm text-atlas-muted">
          Built for African real estate. Powered by an intelligence engine
          that blends AI reasoning with live data from multiple sources.
        </p>
      </section>

      {/* What is Atlas */}
      <section className="mb-16">
        <h3 className="mb-4 text-2xl font-semibold text-atlas-text">
          What is Atlas?
        </h3>
        <p className="mb-4 text-sm leading-relaxed text-atlas-text">
          Atlas is an AI-powered intelligence engine. You ask a question about
          a place — <em>where should I build a gas station?</em>,{" "}
          <em>where in Sandton is best for residential development?</em> — and
          Atlas returns a ranked answer with reasoning, evidence, and a map.
        </p>
        <p className="text-sm leading-relaxed text-atlas-text">
          Today the same engine serves land-for-development questions, gas
          station site selection, restaurant expansion, warehouse location, and
          retail. The architecture is horizontal: any new question type is just
          a new connector + a new scoring recipe.
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
          The wedge: land for development
        </h3>
        <p className="mb-4 text-sm text-atlas-text">
          Atlas starts with one focused wedge: helping land developers,
          property investors, and residential builders find vacant plots and
          development land. This is the highest-margin, lowest-competition
          segment of African real estate, and the one we know best.
        </p>
        <p className="text-sm text-atlas-text">
          Once land is solid, the same engine extends to gas station site
          selection, restaurant expansion, warehouse location, and retail —
          each is a different connector + scoring recipe, no new architecture.
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
              Month 1
            </div>
            <div className="font-semibold text-atlas-text">Land wedge</div>
            <div className="mt-2 text-xs text-atlas-muted">
              Real estate listings + AI + scoring. Live in production.
            </div>
          </div>
          <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-atlas-muted">
              Month 2-3
            </div>
            <div className="font-semibold text-atlas-text">
              Gas station site selection
            </div>
            <div className="mt-2 text-xs text-atlas-muted">
              Google Places + traffic + demographics.
            </div>
          </div>
          <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-atlas-muted">
              Month 4-6
            </div>
            <div className="font-semibold text-atlas-text">
              Restaurant, warehouse, retail
            </div>
            <div className="mt-2 text-xs text-atlas-muted">
              Vertical-specific scoring. Customer-driven roadmap.
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

      {/* CTA */}
      <section className="rounded-lg border border-atlas-accent bg-atlas-surface p-8 text-center">
        <h3 className="mb-3 text-xl font-semibold text-atlas-text">
          Want to see it for your city?
        </h3>
        <p className="mb-6 text-sm text-atlas-muted">
          Atlas is open to design partners: land developers, property
          investors, and builders who want to evaluate 10x more sites per week
          than they do today.
        </p>
        <a
          href="mailto:chris@atlas.local?subject=Atlas%20demo%20request"
          className="inline-block rounded-md bg-atlas-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2"
        >
          Get a demo
        </a>
      </section>

      {/* Team */}
      <section className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
          <div className="text-sm font-semibold text-atlas-text">
            Chris Naudé
          </div>
          <div className="text-xs text-atlas-muted">Founder</div>
          <div className="mt-2 text-xs text-atlas-text">
            African real estate operator, market knowledge, customer
            relationships.
          </div>
        </div>
        <div className="rounded-md border border-atlas-border bg-atlas-surface p-4">
          <div className="text-sm font-semibold text-atlas-text">Atlas</div>
          <div className="text-xs text-atlas-muted">AI co-founder</div>
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
    </main>
  );
}
