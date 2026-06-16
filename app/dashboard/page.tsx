import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/**
 * Atlas Dashboard — user's question history.
 *
 * Server Component: queries Prisma directly, no client-side data fetching.
 *
 * Lists the signed-in user's last 20 questions, ordered by createdAt desc.
 * Each row shows vertical (as badge), question text (truncated to 80 chars),
 * createdAt as relative time, and a link to view the full JSON.
 *
 * If user is not signed in, redirect to /sign-in (Clerk's default page).
 */

const VERTICAL_LABELS: Record<string, string> = {
  gas_station: "Gas station",
  restaurant: "Restaurant",
  warehouse: "Warehouse",
  retail_shop: "Retail shop",
};

function relativeTime(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} mo ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} yr ago`;
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const questions = await prisma.question.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

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
              Dashboard
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
          >
            Ask Atlas
          </Link>
        </div>
      </header>

      {/* Question list */}
      <section>
        <h2 className="mb-4 text-sm font-medium text-atlas-muted">
          Your last 20 questions
        </h2>
        {questions.length === 0 ? (
          <div className="rounded-lg border border-atlas-border bg-atlas-surface p-8 text-center text-sm text-atlas-muted">
            No questions yet.{" "}
            <Link href="/" className="text-atlas-accent hover:underline">
              Ask Atlas
            </Link>{" "}
            to start.
          </div>
        ) : (
          <ul className="space-y-2">
            {questions.map((q) => (
              <li
                key={q.id}
                className="rounded-lg border border-atlas-border bg-atlas-surface p-4 transition-colors hover:border-atlas-accent"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="inline-flex items-center rounded-md border border-atlas-border bg-atlas-surface2 px-2 py-0.5 text-xs font-medium text-atlas-accent">
                    {VERTICAL_LABELS[q.vertical] ?? q.vertical}
                  </span>
                  <span className="text-xs text-atlas-muted">
                    {relativeTime(new Date(q.createdAt))}
                  </span>
                </div>
                <p className="mb-2 text-sm text-atlas-text">
                  {q.questionText.length > 80
                    ? q.questionText.slice(0, 80) + "…"
                    : q.questionText}
                </p>
                <Link
                  href={`/dashboard/${q.id}`}
                  className="text-xs text-atlas-accent hover:underline"
                >
                  View response →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-auto pt-12 text-center text-xs text-atlas-muted">
        <p>
          Atlas · Dashboard · {questions.length}{" "}
          question{questions.length === 1 ? "" : "s"} on file
        </p>
      </footer>
    </main>
  );
}
