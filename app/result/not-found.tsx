/**
 * Atlas result-not-found page.
 *
 * Rendered when a user navigates to /result/<id> but no question
 * with that ID exists in the database, OR when Prisma throws during
 * the fetch and the route calls notFound() to recover gracefully.
 *
 * Replaces Next.js's default "This page could not be found." with
 * actionable guidance: re-ask the question, check API health, or
 * copy the question ID for support.
 */

export default function ResultNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-atlas-bg px-6 py-12 text-atlas-text">
      <div className="w-full max-w-lg rounded-xl border border-atlas-border bg-atlas-surface p-8 shadow-lg">
        <h1 className="mb-2 text-2xl font-semibold">
          Result not found
        </h1>
        <p className="mb-4 text-sm text-atlas-muted">
          We couldn&apos;t load the Atlas result for this page. This
          usually means one of three things:
        </p>

        <ol className="mb-6 space-y-3 text-sm">
          <li className="flex gap-2">
            <span className="font-mono text-atlas-accent">1.</span>
            <span>
              <strong>The question was just asked</strong> but the
              redirect to the result page happened faster than the
              database write. <em>Refresh once</em> — usually fixes
              it.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-atlas-accent">2.</span>
            <span>
              <strong>The result was deleted</strong> (or never
              finished — check the home page history list to see
              if the question is there).
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-atlas-accent">3.</span>
            <span>
              <strong>Atlas is having a database hiccup</strong> —
              check <a className="underline" href="/api/atlas-debug">/api/atlas-debug</a>{" "}
              to see if Prisma is reachable.
            </span>
          </li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <a
            href="/"
            className="rounded-md bg-atlas-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2"
          >
            Ask a new question
          </a>
          <a
            href="/api/atlas-debug"
            className="rounded-md border border-atlas-border bg-atlas-surface2 px-4 py-2 text-sm font-medium text-atlas-text transition-colors hover:border-atlas-accent"
          >
            Check Atlas health
          </a>
        </div>

        <p className="mt-6 text-[11px] text-atlas-muted">
          If this keeps happening, paste the URL of this page in
          chat with us so we can look up the question ID.
        </p>
      </div>
    </main>
  );
}
