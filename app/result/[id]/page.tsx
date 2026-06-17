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
            Atlas · Week 1 Day 4 · Mapbox result page · {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
}