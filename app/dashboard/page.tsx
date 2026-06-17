import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { AtlasLogo } from "@/components/AtlasLogo";

/**
 * Atlas Dashboard — user's question history.
 *
 * Day 8 polish: now uses the shared Sidebar so the chrome matches the
 * home page. The empty state is a proper illustration + CTA (not a
 * one-line "no questions yet" message). If user is not signed in, we
 * redirect to /sign-in — Clerk's dedicated sign-in route that we own
 * (app/sign-in/[[...sign-in]]/page.tsx).
 */

const VERTICAL_LABELS: Record<string, string> = {
  gas_station: "Gas station",
  restaurant: "Restaurant",
  warehouse: "Warehouse",
  retail_shop: "Retail shop",
  residential_land: "Residential land",
  commercial_land: "Commercial land",
  agricultural_land: "Agricultural land",
  industrial_land: "Industrial land",
  mixed_use_land: "Mixed-use land",
};

function humanVertical(value: string): string {
  if (value.startsWith("custom:")) {
    const id = value.slice("custom:".length);
    return id
      .split("_")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  }
  return VERTICAL_LABELS[value] ?? value;
}

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
    <div className="flex h-screen overflow-hidden bg-atlas-bg text-atlas-text">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-atlas-border px-6 py-4">
          <div className="flex items-center gap-3">
            <AtlasLogo size={24} />
            <h1 className="text-lg font-semibold tracking-tight text-atlas-text">
              Dashboard
            </h1>
            <span className="text-xs text-atlas-muted">
              · {questions.length} question{questions.length === 1 ? "" : "s"} on file
            </span>
          </div>
          <Link
            href="/"
            className="rounded-md bg-atlas-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-atlas-accent2"
          >
            + Ask Atlas
          </Link>
        </header>

        {/* Question list */}
        <section className="flex-1 px-6 py-6">
          <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
            Your last 20 questions
          </h2>
          {questions.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-xl border border-atlas-border bg-atlas-surface px-6 py-16 text-center">
              <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-atlas-accent/10">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-atlas-accent"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-atlas-text">
                No question history yet
              </h3>
              <p className="mb-6 text-sm text-atlas-muted">
                Ask Atlas anything — from site selection to land investment.
                Your questions will show up here so you can revisit them
                anytime.
              </p>
              <Link
                href="/"
                className="rounded-md bg-atlas-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-atlas-accent2"
              >
                Ask your first question
              </Link>
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
                      {humanVertical(q.vertical)}
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
                    href={`/result/${q.id}`}
                    className="text-xs text-atlas-accent hover:underline"
                  >
                    View response →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
