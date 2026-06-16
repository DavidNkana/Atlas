import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/**
 * Atlas Dashboard — single question detail view.
 *
 * Server Component: looks up a Question by id, scoped to the signed-in user.
 * If not found OR not owned by the signed-in user, 404.
 *
 * Renders the full responseJson in a <pre> block.
 */

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    return notFound();
  }

  const { id } = await params;

  const question = await prisma.question.findFirst({
    where: { id, userId },
  });

  if (!question) {
    return notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between border-b border-atlas-border pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            <Link href="/" className="text-atlas-accent">
              Atlas
            </Link>{" "}
            <span className="text-atlas-muted text-sm font-normal">
              Question detail
            </span>
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
        >
          ← Back to dashboard
        </Link>
      </header>

      {/* Question */}
      <section className="mb-6 rounded-lg border border-atlas-border bg-atlas-surface p-6">
        <div className="mb-3 flex items-center gap-3">
          <span className="inline-flex items-center rounded-md border border-atlas-border bg-atlas-surface2 px-2 py-0.5 text-xs font-medium text-atlas-accent">
            {question.vertical}
          </span>
          <span className="text-xs text-atlas-muted">
            {new Date(question.createdAt).toISOString()}
          </span>
        </div>
        <p className="text-sm text-atlas-text">{question.questionText}</p>
      </section>

      {/* Response JSON */}
      <section className="rounded-lg border border-atlas-border bg-atlas-surface p-6">
        <h2 className="mb-3 text-sm font-medium text-atlas-muted">
          Response
        </h2>
        <pre className="overflow-x-auto rounded-md border border-atlas-border bg-atlas-bg p-4 text-xs text-atlas-text">
          {JSON.stringify(question.responseJson, null, 2)}
        </pre>
      </section>

      {/* Footer */}
      <footer className="mt-auto pt-12 text-center text-xs text-atlas-muted">
        <p>Atlas · Question {question.id}</p>
      </footer>
    </main>
  );
}
