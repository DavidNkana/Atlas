import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { AtlasLogo } from "@/components/AtlasLogo";

/**
 * Day 9 — Admin dashboard.
 *
 * Chris's internal view of Atlas traction. Shows:
 *   - Signups: total + recent
 *   - Waitlist: total, by plan, by vertical, latest 20 signups
 *   - Questions: total asked, last 7 days, top verticals
 *
 * Auth: requires sign-in. We accept ANY signed-in user as admin
 * for v1 — Chris is the only one with access in practice. Day 30+
 * we'll add a proper role check via Clerk publicMetadata.
 */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Pull all the data in parallel.
  const [
    totalQuestions,
    questionsLast7d,
    questionsByVertical,
    totalUsers,
    waitlistTotal,
    waitlistByPlan,
    waitlistByVertical,
    recentSignups,
    recentQuestions,
  ] = await Promise.all([
    prisma.question.count(),
    prisma.question.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.question.groupBy({
      by: ["vertical"],
      _count: { _all: true },
      orderBy: { _count: { vertical: "desc" } },
    }),
    // Distinct userId count from Question table. Users without
    // questions are not counted (they didn't engage). Day 30+ will
    // move to a proper User table.
    prisma.question
      .findMany({ select: { userId: true }, distinct: ["userId"] })
      .then((rows) => rows.length),
    prisma.waitlistSignup.count(),
    prisma.waitlistSignup.groupBy({
      by: ["plan"],
      _count: { _all: true },
    }),
    prisma.waitlistSignup.groupBy({
      by: ["vertical"],
      _count: { _all: true },
    }),
    prisma.waitlistSignup.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        email: true,
        name: true,
        vertical: true,
        plan: true,
        userType: true,
        message: true,
        createdAt: true,
      },
    }),
    prisma.question.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        userId: true,
        vertical: true,
        questionText: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="flex min-h-screen bg-atlas-bg text-atlas-text">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex items-center justify-between border-b border-atlas-border px-6 py-4">
          <div className="flex items-center gap-3">
            <AtlasLogo size={24} />
            <h1 className="text-lg font-semibold tracking-tight text-atlas-text">
              Admin
            </h1>
            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
              Internal
            </span>
          </div>
          <p className="text-[10px] text-atlas-muted">
            Refreshes on every page load
          </p>
        </header>

        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          {/* KPI row */}
          <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Total questions" value={totalQuestions} />
            <Kpi label="Last 7 days" value={questionsLast7d} />
            <Kpi label="Engaged users" value={totalUsers} />
            <Kpi
              label="Waitlist signups"
              value={waitlistTotal}
              accent
            />
          </section>

          {/* Waitlist breakdown */}
          <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-atlas-muted">
                Waitlist by plan
              </h2>
              <div className="space-y-2">
                {waitlistByPlan.length === 0 ? (
                  <p className="text-xs text-atlas-muted">No signups yet</p>
                ) : (
                  waitlistByPlan.map((row) => (
                    <div
                      key={row.plan}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-atlas-text">{row.plan}</span>
                      <span className="font-mono text-atlas-muted">
                        {row._count._all}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-atlas-border bg-atlas-surface p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-atlas-muted">
                Waitlist by vertical
              </h2>
              <div className="space-y-2">
                {waitlistByVertical.length === 0 ? (
                  <p className="text-xs text-atlas-muted">No signups yet</p>
                ) : (
                  waitlistByVertical.map((row) => (
                    <div
                      key={row.vertical}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate text-atlas-text">
                        {row.vertical}
                      </span>
                      <span className="font-mono text-atlas-muted">
                        {row._count._all}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Questions breakdown */}
          <section className="mb-8 rounded-xl border border-atlas-border bg-atlas-surface p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-atlas-muted">
              Questions by vertical
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {questionsByVertical.length === 0 ? (
                <p className="text-xs text-atlas-muted">No questions yet</p>
              ) : (
                questionsByVertical.map((row) => (
                  <div
                    key={row.vertical}
                    className="flex items-center justify-between rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm"
                  >
                    <span className="truncate text-atlas-text">
                      {row.vertical}
                    </span>
                    <span className="font-mono text-atlas-muted">
                      {row._count._all}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Recent waitlist signups */}
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-atlas-muted">
              Recent waitlist signups
            </h2>
            <div className="overflow-hidden rounded-xl border border-atlas-border bg-atlas-surface">
              {recentSignups.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-atlas-muted">
                  No signups yet. Share /pricing or /waitlist to drive traffic.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-atlas-border text-[10px] uppercase tracking-wider text-atlas-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Email
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Plan</th>
                      <th className="px-3 py-2 text-left font-medium">Vertical</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSignups.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-atlas-border last:border-0"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-atlas-text">
                          {s.email}
                        </td>
                        <td className="px-3 py-2 text-xs text-atlas-text">
                          {s.name || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-atlas-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-atlas-accent">
                            {s.plan}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-atlas-muted">
                          {s.vertical}
                        </td>
                        <td className="px-3 py-2 text-xs text-atlas-muted">
                          {s.userType || "—"}
                        </td>
                        <td className="px-3 py-2 text-[10px] text-atlas-muted">
                          {relativeTime(s.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Recent questions */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-atlas-muted">
              Recent questions
            </h2>
            <div className="space-y-1.5">
              {recentQuestions.length === 0 ? (
                <p className="rounded-xl border border-atlas-border bg-atlas-surface px-4 py-6 text-center text-sm text-atlas-muted">
                  No questions yet.
                </p>
              ) : (
                recentQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-atlas-border bg-atlas-surface px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-atlas-text">
                      {q.questionText}
                    </span>
                    <span className="shrink-0 rounded bg-atlas-surface2 px-1.5 py-0.5 text-[10px] font-medium text-atlas-muted">
                      {q.vertical}
                    </span>
                    <span className="shrink-0 text-[10px] text-atlas-muted">
                      {relativeTime(q.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <footer className="mt-auto px-6 py-6 text-center text-xs text-atlas-muted">
          <p>
            Atlas · {new Date().getFullYear()} · Internal admin view
          </p>
        </footer>
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-atlas-accent bg-atlas-accent/10"
          : "border-atlas-border bg-atlas-surface"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-3xl font-semibold ${
          accent ? "text-atlas-accent" : "text-atlas-text"
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function relativeTime(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}
