import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import ResultMapClient from "@/components/ResultMapClient";

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
        <header className="mb-6 flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
              <span className="text-indigo-400">Atlas</span>{" "}
              <span className="text-zinc-400 text-sm font-normal">Result</span>
            </h1>
            <p className="mt-1 text-sm text-zinc-300">
              {question.questionText}
            </p>
          </div>
          <a
            href="/"
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:border-indigo-500 hover:text-indigo-400"
          >
            ← Back to prompt
          </a>
        </header>

        {responseBody.model?.modelError && (
          <div
            role="alert"
            data-testid="atlas-model-error"
            className="mb-6 rounded-md border border-amber-900 bg-zinc-900 px-4 py-3 text-xs text-amber-400"
          >
            <strong className="font-semibold text-amber-300">
              Model warning:
            </strong>{" "}
            <span className="text-amber-400">
              {responseBody.model.modelError}
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
            className="mb-6 rounded-md border border-zinc-800 bg-zinc-900 p-4"
            data-testid="atlas-connectors-row"
          >
            <h2 className="mb-2 text-xs font-medium text-zinc-100">Connectors</h2>
            <div className="flex flex-wrap gap-2">
              {connectorsRun.map((c) => (
                <span
                  key={c.id}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${statusBorder(
                    c.status,
                  )}`}
                >
                  <span className="font-medium">{c.id}</span>
                  <span className="text-zinc-400">·</span>
                  <span>{c.signalCount} signals</span>
                  <span className="text-zinc-400">·</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide">
                    {c.status}
                  </span>
                </span>
              ))}
              {plan && (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300">
                  plan · {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"} · {plan.vertical}
                </span>
              )}
            </div>
          </section>
        )}

        <section className="mb-6">
          <ResultMapClient rankedSites={rankedSites} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-100">
            Raw response
          </h2>
          <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-100">
            {JSON.stringify(responseBody, null, 2)}
          </pre>
        </section>

        <footer className="mt-auto pt-12 text-center text-xs text-zinc-400">
          <p>
            Atlas · Week 1 Day 5 · Connectors + scoring · {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
}
