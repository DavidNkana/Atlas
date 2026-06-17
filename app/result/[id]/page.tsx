import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import ResultMapClient from "@/components/ResultMapClient";

/**
 * Day 4 commit 1: Result page route.
 *
 * Server Component. Reads the saved Question from Supabase, verifies the
 * caller is the owner, and hands the ranked_sites payload to a client
 * component that renders the Mapbox map.
 *
 * This commit ships the route + the empty map. Commit 3 adds markers,
 * popups, fitBounds, and a sidebar list.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RankedSite = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;
  lng?: number;
};

type ResponseBody = {
  status?: string;
  model?: { id: string; displayName: string; provider: string };
  vertical?: string;
  question?: string;
  echo?: string;
  ranked_sites?: RankedSite[];
};

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

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <header className="mb-6 flex items-center justify-between border-b border-atlas-border pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-atlas-accent">Atlas</span>{" "}
            <span className="text-atlas-muted text-sm font-normal">Result</span>
          </h1>
          <p className="mt-1 text-sm text-atlas-muted">{question.questionText}</p>
        </div>
        <a
          href="/"
          className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent hover:text-atlas-accent"
        >
          ← Back to prompt
        </a>
      </header>

      <section className="mb-6">
        <ResultMapClient rankedSites={rankedSites} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-atlas-muted">
          Raw response
        </h2>
        <pre className="overflow-x-auto rounded-md border border-atlas-border bg-atlas-bg p-4 text-xs text-atlas-text">
          {JSON.stringify(responseBody, null, 2)}
        </pre>
      </section>

      <footer className="mt-auto pt-12 text-center text-xs text-atlas-muted">
        <p>
          Atlas · Week 1 Day 4 · Mapbox result page · {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}