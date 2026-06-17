import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import ResultMapClient from "@/components/ResultMapClient";
import { Sidebar } from "@/components/Sidebar";

/**
 * Day 4 commit 1 + Day 5 commit 4:
 * - Server Component. Reads the saved Question from Supabase, verifies the
 *   caller is the owner, and hands the ranked_sites payload to a client
 *   component that renders the Mapbox map.
 * - Day 5 commit 4: also render a "Connectors" badge row showing which
 *   connectors ran and their status (e.g. "overpass · 12 signals · ok"),
 *   plus an amber banner when connectorsError is set.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Signal = {
  id: string;
  source: string;
  type: string;
  label: string;
  value: number;
  weight: number;
  fetchedAt: string;
};

type ScoreFactor = {
  name: string;
  weight: number;
  contribution: number;
  evidence: string;
};

type ScoreBreakdown = {
  siteId: string;
  baseScore: number;
  signalScore: number;
  confidence: number;
  factors: ScoreFactor[];
};

type RankedSite = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;
  lng?: number;
  signals?: Signal[];
  scoreBreakdown?: ScoreBreakdown;
};

type ConnectorRun = {
  id: string;
  status: "ok" | "error" | "timeout";
  signalCount: number;
};

type PlanStep = {
  connectorId: string;
  input: Record<string, unknown>;
  reason: string;
};

type Plan = {
  vertical: string;
  location: { lat: number; lng: number; label?: string };
  steps: PlanStep[];
};

type ResponseBody = {
  status?: string;
  model?: {
    id: string;
    displayName: string;
    provider: string;
    modelError?: string;
    fallbackUsed?: boolean;
  };
  vertical?: string;
  question?: string;
  echo?: string;
  ranked_sites?: RankedSite[];
  plan?: Plan;
  connectorsRun?: ConnectorRun[];
  connectorsError?: string;
  // Day 6 — city-aware stub metadata surfaced for the banner.
  city?: string;
  country?: string;
  stubReason?: string;
};

function statusBorder(status: string): string {
  if (status === "ok") return "border-emerald-900 bg-emerald-500/10 text-emerald-400";
  if (status === "timeout") return "border-amber-900 bg-amber-500/10 text-amber-400";
  return "border-rose-900 bg-rose-500/10 text-rose-400";
}

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question || question.userId !== userId) {
    notFound();
  }

  const responseBody = (question.responseJson ?? {}) as ResponseBody;
  const rankedSites = Array.isArray(responseBody.ranked_sites)
    ? responseBody.ranked_sites
    : [];
  const connectorsRun = Array.isArray(responseBody.connectorsRun)
    ? responseBody.connectorsRun
    : [];
  const connectorsError = responseBody.connectorsError;
  const plan = responseBody.plan;
  // Day 6 — stub_demo banner surfaces the detected city + reason.
  const responseStatus = responseBody.status;
  const stubCity = responseBody.city;
  const stubCountry = responseBody.country;
  const stubReason = responseBody.stubReason;

  return (
    <div className="flex min-h-screen items-start bg-atlas-bg text-atlas-text">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-atlas-border px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-atlas-text">
              Result
            </h1>
            <p className="mt-0.5 truncate text-sm text-atlas-muted">
              {question.questionText}
            </p>
          </div>
          <a
            href="/"
            className="shrink-0 rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
          >
            ← New
          </a>
        </header>

        <div className="flex-1 px-6 py-6">

        {responseBody.model?.modelError && (
          <div
            role="alert"
            data-testid="atlas-model-error"
            className="mb-6 rounded-md border border-amber-900 bg-atlas-surface px-4 py-3 text-xs text-amber-400"
          >
            <strong className="font-semibold text-amber-300">
              Model warning:
            </strong>{" "}
            <span className="text-amber-400">
              {responseBody.model.modelError}
            </span>
          </div>
        )}

        {responseStatus === "stub_demo" && (
          <div
            role="alert"
            data-testid="atlas-stub-demo-banner"
            className="mb-6 rounded-md border border-amber-800 bg-amber-950 px-4 py-3 text-xs text-amber-200"
          >
            <strong className="font-semibold text-amber-100">
              Demo placeholder
              {stubCity ? ` — ${stubCity}${stubCountry ? `, ${stubCountry}` : ""}` : ""}:
            </strong>{" "}
            <span className="text-amber-200">
              {stubReason ??
                "AI models are currently overloaded. This is a city-specific demo placeholder. Try a real model in a few minutes."}
            </span>
          </div>
        )}

        {connectorsError && (
          <div
            role="alert"
            data-testid="atlas-connectors-error"
            className="mb-6 rounded-md border border-amber-900 bg-amber-500/10 px-4 py-3 text-xs text-amber-400"
          >
            <strong className="font-semibold text-amber-300">
              Signal data missing:
            </strong>{" "}
            <span className="text-amber-400">
              {connectorsError}. The map and scores below are based purely on
              the AI ranking — no POI density or other live signals could be
              fetched to confirm the score. Try again in a few seconds.
            </span>
          </div>
        )}

        {connectorsRun.length > 0 && (
          <section
            className="mb-6 rounded-md border border-atlas-border bg-atlas-surface p-4"
            data-testid="atlas-connectors-row"
          >
            <h2 className="mb-2 text-xs font-medium text-atlas-text">Connectors</h2>
            <div className="flex flex-wrap gap-2">
              {connectorsRun.map((c) => (
                <span
                  key={c.id}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${statusBorder(
                    c.status,
                  )}`}
                >
                  <span className="font-medium">{c.id}</span>
                  <span className="text-atlas-muted">·</span>
                  <span>{c.signalCount} signals</span>
                  <span className="text-atlas-muted">·</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide">
                    {c.status}
                  </span>
                </span>
              ))}
              {plan && (
                <span className="inline-flex items-center gap-1 rounded-full border border-atlas-border bg-atlas-surface2 px-2.5 py-1 text-[11px] text-atlas-muted">
                  plan · {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"} · {plan.vertical}
                </span>
              )}
            </div>
          </section>
        )}

        <section className="mb-6">
          <ResultMapClient
            rankedSites={rankedSites}
            status={responseStatus}
            city={stubCity}
            country={stubCountry}
            stubReason={stubReason}
          />
        </section>

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-atlas-text">
              Ranked sites
            </h2>
            <span className="text-[10px] uppercase tracking-wider text-atlas-muted">
              {rankedSites.length} site{rankedSites.length === 1 ? "" : "s"}
            </span>
          </div>
          <ol className="space-y-2">
            {rankedSites.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-atlas-border bg-atlas-surface p-4"
              >
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-atlas-accent/10 text-xs font-semibold text-atlas-accent">
                      {s.rank}
                    </span>
                    <h3 className="text-sm font-medium text-atlas-text">
                      {s.name}
                    </h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px]">
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-emerald-300">
                      score {s.score?.toFixed?.(2) ?? "—"}
                    </span>
                    <span className="rounded bg-atlas-surface2 px-1.5 py-0.5 font-mono text-atlas-muted">
                      conf {s.confidence?.toFixed?.(2) ?? "—"}
                    </span>
                  </div>
                </div>
                {s.rationale && (
                  <p className="ml-8 text-xs leading-relaxed text-atlas-muted">
                    {s.rationale}
                  </p>
                )}
                {s.lat != null && s.lng != null && (
                  <p className="ml-8 mt-1 font-mono text-[10px] text-atlas-muted">
                    {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-auto pt-12 text-center text-xs text-atlas-muted">
          <p>
            Atlas · {new Date().getFullYear()}
          </p>
        </footer>
        </div>
      </main>
    </div>
  );
}
