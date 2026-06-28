import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ResultMapClient from "@/components/ResultMapClient";
import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { RankedSiteCard } from "@/components/RankedSiteCard";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { RankingChart } from "@/components/RankingChart";
import { ListingsOverlay } from "@/components/ListingsOverlay";
import { ResultChatPanel } from "@/components/ResultChatPanel";
import { ResultChatButton } from "@/components/ResultChatButton";
import { ResultExportButton } from "@/components/ResultExportButton";
import { detectCity } from "@/lib/stub/detect";
import { REAL_SITE_CATALOG } from "@/lib/stub/real-sites";
import { SUBURB_PROFILES } from "@/lib/demographics/suburbs";

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
    attemptedChain?: string[];
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
  // Day 12 v16 — research answer + citations from Gemini Search.
  answer?: string;
  sources?: Array<{ title?: string; url: string }>;
  // Day 17 v6 — intent classification for routing to /chat/[id].
  intent?: "spatial" | "conversational";
  intentScore?: {
    spatial: number;
    conversational: number;
  };
  matchedPatterns?: {
    spatial: string[];
    conversational: string[];
  };
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
  // Day 22 v15: extract top-level Tavily live listings from the
  // persisted response body. These power the "From SA property
  // portals" subsection in ListingsOverlay. Falls back to any
  // listings attached to ranked sites (legacy path).
  const tavilyListingsForOverlay: Array<any> = Array.isArray(
    (responseBody as any).liveListings,
  )
    ? (responseBody as any).liveListings
    : rankedSites.flatMap((s: any) => (s as any).liveListings ?? []);

  // Day 10+ Path 4: fetch the user's own plots AND other users'
  // published plots in the same area. Day 11 cross-user: the API
  // returns { owner, market, cityFilter, suburbFilter }. The
  // server has already done the privacy filtering (market plots
  // only get public fields unless revealContact is true).
  //
  // We do this via Prisma directly instead of a server-side
  // fetch so we don't have to forward the auth cookie (server
  // components run in the same Node process as the API routes).
  //
  // Day 12 v3: the owner query used to filter by questionId
  // (only show plots the user added WHILE on this exact
  // question). That was wrong: a user adds 10 plots over a
  // week across 5 searches, then comes back to a new search
  // and sees ZERO listings because none are linked to the new
  // questionId. The right behaviour: show ALL of the user's
  // own plots in the owner section regardless of which
  // question they were added on.
  //
  // Day 12 v4: but the owner query was then UNFILTERED by
  // city, so a Sandton listing showed on a Nairobi search.
  // That's confusing — the header says "Nairobi" but the
  // card is for Sandton. The fix: filter by city so the
  // section only shows listings relevant to this question's
  // detected city. A user with cross-city listings can still
  // see them all in their /dashboard watchlist.
  const detectedCity = detectCity(question.questionText ?? "");
  const cityFilter = detectedCity?.name ?? null;

  // Day 12 v11: pick a Street View anchor that matches the
  // query vertical. The plain city-centre fallback was
  // showing users the CBD / downtown — useless for a
  // "build a home" query because you can't build a
  // house in the financial district. We now bias the
  // anchor toward a suburb that fits the vertical:
  //   - residential_land → first suburb with houses
  //     (dominantDwellingType=house) or any "suburban" zone
  //   - commercial_land / mixed_use_land → CBD or "suburban"
  //   - industrial_land / warehouse → "industrial" or
  //     "suburban"
  //   - agricultural_land → "peri-urban"
  //   - restaurant / gas_station / retail_shop → CBD or
  //     "suburban" (foot traffic matters)
  //   - civic_land → first available
  //   - fallback → city centre
  const questionVertical = question.vertical ?? "";
  function pickStreetViewAnchor(): { lat: number; lng: number } | undefined {
    if (!detectedCity) return undefined;
    const suburbs = SUBURB_PROFILES[detectedCity.id] ?? [];
    if (suburbs.length === 0) {
      return { lat: detectedCity.lat, lng: detectedCity.lng };
    }
    const pickByZone = (...zones: Array<"CBD" | "suburban" | "peri-urban" | "industrial">) =>
      suburbs.find((s) => zones.includes(s.economicZone));
    let chosen: { lat: number; lng: number } | undefined;
    if (
      questionVertical === "residential_land" ||
      questionVertical === "agricultural_land"
    ) {
      // House-dominant suburb first, then suburban, then peri-urban
      chosen =
        suburbs.find((s) => s.dominantDwellingType === "house") ??
        pickByZone("suburban", "peri-urban") ??
        suburbs[0];
    } else if (questionVertical === "commercial_land" || questionVertical === "mixed_use_land") {
      chosen = pickByZone("CBD", "suburban") ?? suburbs[0];
    } else if (
      questionVertical === "industrial_land" ||
      questionVertical === "warehouse"
    ) {
      chosen = pickByZone("industrial", "suburban") ?? suburbs[0];
    } else if (questionVertical === "restaurant" || questionVertical === "retail_shop" || questionVertical === "gas_station") {
      chosen = pickByZone("CBD", "suburban") ?? suburbs[0];
    } else if (questionVertical === "civic_land") {
      chosen = suburbs[0];
    }
    if (!chosen) {
      return { lat: detectedCity.lat, lng: detectedCity.lng };
    }
    return { lat: chosen.lat, lng: chosen.lng };
  }
  const streetViewAnchor = pickStreetViewAnchor();

  const ownerWhere: any = { userId };
  if (cityFilter) {
    ownerWhere.city = { equals: cityFilter, mode: "insensitive" };
  }
  const ownerPlotsRaw = await prisma.plot.findMany({
    where: ownerWhere,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const ownerPlots = ownerPlotsRaw.map((p) => ({
    id: p.id,
    suburb: p.suburb,
    city: p.city,
    sizeM2: p.sizeM2,
    priceAmount: p.priceAmount != null ? Number(p.priceAmount) : null,
    currency: p.currency,
    listingType: p.listingType,
    agentName: p.agentName,
    sourceUrl: p.sourceUrl,
    lat: p.lat,
    lng: p.lng,
    publishToMarket: p.publishToMarket,
    revealContact: p.revealContact,
    notes: p.notes,
    ownership: "owner" as const,
  }));

  // Cross-user market: published plots from other users in the
  // same city as the question. Privacy: strip fields the owner
  // hasn't shared. Same logic as the API route's
  // serializeForMarket — kept here to avoid a server-side fetch
  // round-trip.
  let marketPlots: Array<any> = [];
  if (cityFilter) {
    const marketRaw = await prisma.plot.findMany({
      where: {
        publishToMarket: true,
        city: { equals: cityFilter, mode: "insensitive" },
        userId: { not: userId },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    marketPlots = marketRaw.map((p) => {
      const showContact = !!p.revealContact;
      return {
        id: p.id,
        suburb: p.suburb,
        city: p.city,
        sizeM2: p.sizeM2,
        priceAmount: p.priceAmount != null ? Number(p.priceAmount) : null,
        currency: p.currency,
        listingType: p.listingType,
        agentName: showContact ? p.agentName : null,
        sourceUrl: showContact ? p.sourceUrl : null,
        lat: p.lat,
        lng: p.lng,
        ownership: "market" as const,
      };
    });
  }

  // Combined view for the map client: owner + market, each
  // reduced to the fields the map needs (lat/lng for the marker,
  // popup fields for the click).
  const plotsForMap = [...ownerPlots, ...marketPlots].map((p) => ({
    id: p.id,
    suburb: p.suburb,
    city: p.city,
    sizeM2: p.sizeM2,
    priceAmount: p.priceAmount,
    currency: p.currency,
    listingType: p.listingType,
    agentName: p.agentName,
    sourceUrl: p.sourceUrl,
    lat: p.lat,
    lng: p.lng,
  }));
  // Day 22 v2: derive catalog listings from REAL_SITE_CATALOG for the
  // detected city + vertical. Each entry becomes a yellow marker so
  // every map has a baseline density of listings even with zero
  // user-submitted Plots. Suburb color tint makes schools/healthcare/
  // transit/roads/competitors visually distinguishable on the map.
  // We cap at 25 per map to keep it readable.
  const catalogListingsForMap: Array<{
    name: string;
    suburb?: string;
    lat: number;
    lng: number;
    category: string;
    priceRange?: string;
    color: string;
  }> = [];
  if (detectedCity) {
    const verticalKey = questionVertical || "residential_land";
    const cityCatalog: any = (REAL_SITE_CATALOG as any)[detectedCity.id] ?? {};
    const verticalEntries: any[] = cityCatalog[verticalKey] ?? [];
    for (const entry of verticalEntries.slice(0, 25)) {
      if (
        typeof entry?.lat !== "number" ||
        typeof entry?.lng !== "number"
      ) {
        continue;
      }
      catalogListingsForMap.push({
        name: entry.name,
        suburb: entry.suburb,
        lat: entry.lat,
        lng: entry.lng,
        category: verticalKey,
        priceRange: entry.priceRange,
        // All catalog listings get the default yellow. Day 22 v3
        // can tint by entry.competition presence etc.
        color: "#eab308",
      });
    }
  }
  const connectorsError = responseBody.connectorsError;
  const plan = responseBody.plan;
  // Day 6 — stub_demo banner surfaces the detected city + reason.
  const responseStatus = responseBody.status;
  const stubCity = responseBody.city;
  const stubCountry = responseBody.country;
  const stubReason = responseBody.stubReason;

  return (
    <AppShell>
      <header className="flex items-center justify-between gap-3 border-b border-atlas-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-atlas-text">
                Result
              </h1>
              {question.vertical && (
                <span className="rounded-full bg-atlas-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-atlas-accent">
                  {question.vertical.replace(/_/g, " ").replace("custom:", "")}
                </span>
              )}
              {stubCity && (
                <span className="rounded-full bg-atlas-surface2 px-2 py-0.5 text-[10px] font-medium text-atlas-muted">
                  {stubCity}{stubCountry ? `, ${stubCountry}` : ""}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-atlas-muted">
              {question.questionText}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ResultExportButton
              resultId={id}
              data={{
                question: question.questionText,
                vertical: question.vertical,
                city: stubCity,
                country: stubCountry,
                model: responseBody?.model?.displayName,
                echo: responseBody?.echo,
                rankedSites,
                plan,
                answer: responseBody?.answer,
                sources: responseBody?.sources,
              }}
            />
            {/* Day 30 + LCP-34 — Chat button is a client component
                because server components can't carry onClick
                handlers or window references. ResultChatButton
                dispatches the same 'atlas:openChat' CustomEvent
                so AppShell's singleton FullScreenChat mounts. */}
            <ResultChatButton
              question={question.questionText}
              vertical={question.vertical}
              rankedSites={rankedSites.map((s) => ({
                name: s.name,
                suburb: (s as any).suburb,
              }))}
            />
            <a
              href="/"
              className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
            >
              ← New
            </a>
          </div>
        </header>

        <div className="flex-1 px-6 py-6">

        {/* Model warning banner — only when NOT in stub_demo mode.
            In stub_demo mode, the stub banner below already says
            "AI models are currently overloaded" and the detailed
            model errors are noise on top of that one clear message.

            Day 22 v18: when Gemini cascade falls through, detect
            Vertex-format key + quota errors and surface actionable
            guidance instead of a raw error string. */}
        {responseBody.model?.modelError && responseStatus !== "stub_demo" && (
          (() => {
            const errText: string = responseBody.model.modelError ?? "";
            const isQuota =
              /quota|limit: 0|free_tier/i.test(errText) ||
              /AQ\.Ab8RN6/i.test(process.env.NEXT_PUBLIC_GEMINI_KEY_HINT ?? "");
            const isVertexKey =
              /AQ\.[A-Za-z0-9_-]{20,}/.test(errText) === false &&
              responseBody.model?.attemptedChain?.includes("gemini-search");
            return (
              <div
                role="alert"
                data-testid="atlas-model-error"
                className={`mb-6 rounded-md border px-4 py-3 text-xs ${
                  isQuota
                    ? "border-rose-900 bg-atlas-surface text-rose-300"
                    : "border-amber-900 bg-atlas-surface text-amber-400"
                }`}
              >
                {isQuota ? (
                  <>
                    <strong className="font-semibold">
                      Gemini API key issue detected
                    </strong>
                    <p className="mt-2 text-rose-200">
                      Atlas's reasoning engine returned a quota error or
                      Vertex-format key. The result below is from the
                      curated-stub fallback (example data) — not a real
                      answer to your question.
                    </p>
                    <p className="mt-2 text-rose-200">
                      <strong>Fix in 2 minutes:</strong> Open{" "}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-rose-100"
                      >
                        aistudio.google.com/apikey
                      </a>{" "}
                      and create a key (starts with <code>AIzaSy</code>).
                      Paste it into Vercel as{" "}
                      <code>GEMINI_API_KEY</code> and redeploy.
                    </p>
                    <details className="mt-2 text-rose-200">
                      <summary className="cursor-pointer text-rose-300">
                        Show technical details
                      </summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-rose-300">
                        {errText}
                      </pre>
                    </details>
                  </>
                ) : (
                  <>
                    <strong className="font-semibold text-amber-300">
                      Model warning:
                    </strong>{" "}
                    <span className="text-amber-400">{errText}</span>
                  </>
                )}
              </div>
            );
          })()
        )}

        {/* Day 12 v16 — Research answer from Gemini Search.
            Renders a prose summary + citation list when the active
            model returned them. This is the "Perplexity-style" answer
            that makes Gemini Search worth picking over plain Gemini
            Flash. The section is hidden when the active model didn't
            produce an answer (most models). */}
        {responseBody.answer && (
          <section
            data-testid="atlas-research-answer"
            className="mb-6 rounded-md border border-emerald-900 bg-emerald-500/5 p-4"
          >
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              Research answer
            </h2>
            <p className="text-sm leading-relaxed text-atlas-text">
              {responseBody.answer}
            </p>
            {responseBody.sources && responseBody.sources.length > 0 && (
              <div className="mt-3">
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
                  Sources
                </h3>
                <ul className="space-y-1">
                  {responseBody.sources.map((s, i) => (
                    <li key={`${i}-${s.url}`} className="text-xs">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-emerald-400 underline-offset-2 transition-colors hover:text-emerald-300 hover:underline"
                      >
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Demo placeholder banner — fires when Atlas answered with
            the curated stub (all real AIs were down or unavailable).
            Day 16 v2: when connectors ALSO succeeded (LLM failed but
            signals were pulled), show a "hybrid" version of the banner
            that highlights the live signal count + which sources fired.
            This addresses developer feedback "I want to see 18 signals
            not 1" — even in degraded mode, the badge tells the truth. */}
        {responseStatus === "stub_demo" && (() => {
          const liveConnectorCount = connectorsRun.filter(
            (c) => c.status === "ok" && c.signalCount > 0,
          ).length;
          const totalSignals = connectorsRun.reduce(
            (sum, c) => sum + c.signalCount,
            0,
          );
          const liveSources = connectorsRun
            .filter((c) => c.status === "ok" && c.signalCount > 0)
            .map((c) => c.id);
          const isHybrid = liveConnectorCount > 0;
          return (
            <div
              role="alert"
              data-testid="atlas-stub-demo-banner"
              className={`mb-6 rounded-md border px-4 py-3 text-xs ${
                isHybrid
                  ? "border-emerald-800 bg-emerald-950 text-emerald-100"
                  : "border-amber-800 bg-amber-950 text-amber-200"
              }`}
            >
              <strong
                className={`font-semibold ${
                  isHybrid ? "text-emerald-50" : "text-amber-100"
                }`}
              >
                {isHybrid ? "Hybrid result" : "Demo placeholder"}
                {stubCity
                  ? ` — ${stubCity}${stubCountry ? `, ${stubCountry}` : ""}`
                  : ""}
                :
              </strong>{" "}
              <span>
                {stubReason ??
                  "Atlas couldn't reach a research model right now. Pick a different model in the picker to retry."}
              </span>
              {isHybrid && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold">
                    ✓ {totalSignals} live signals from {liveConnectorCount} of{" "}
                    {connectorsRun.length} sources:
                  </span>
                  <span className="font-mono text-emerald-300">
                    {liveSources.join(", ")}
                  </span>
                </div>
              )}
            </div>
          );
        })()}

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
            <div className="mb-3 flex items-baseline justify-between">
              <div className="flex items-baseline gap-3">
                <h2 className="text-xs font-medium text-atlas-text">Decision Intelligence</h2>
                {/* Day 17 v6: surface the intent classification so the
                    user sees which view Atlas picked as primary.
                    Clicking the link switches to the alternate view. */}
                {responseBody.intent === "conversational" && (
                  <Link
                    href={`/chat/${id}`}
                    data-testid="atlas-chat-link"
                    className="rounded-full bg-atlas-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-atlas-accent hover:bg-atlas-accent/25"
                  >
                    Intelligence answer ↗
                  </Link>
                )}
                {responseBody.intent === "spatial" && responseBody.answer && (
                  <Link
                    href={`/chat/${id}`}
                    data-testid="atlas-chat-link"
                    className="rounded-full border border-atlas-border bg-atlas-surface2 px-2 py-0.5 text-[10px] text-atlas-muted hover:text-atlas-text"
                  >
                    See research answer ↗
                  </Link>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                {(() => {
                  const totalSignals = connectorsRun.reduce((sum, c) => sum + c.signalCount, 0);
                  const liveConnectors = connectorsRun.filter(
                    (c) => c.status === "ok" && c.signalCount > 0,
                  ).length;
                  const totalConnectors = connectorsRun.length;
                  const allLive = liveConnectors === totalConnectors && totalConnectors > 0;
                  return (
                    <>
                      <span
                        className={`text-2xl font-bold ${
                          allLive ? "text-emerald-400" : "text-atlas-text"
                        }`}
                        data-testid="signals-used-count"
                      >
                        {totalSignals}
                      </span>
                      <span className="text-[11px] text-atlas-muted">
                        signals used · {liveConnectors}/{totalConnectors} sources live
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            {/* Per-source checkmark row — addresses the property developer
                feedback "I want to see 18 signals, not 1". Today we ship 10
                sources; this row grows as we add more connectors. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 md:grid-cols-5">
              {connectorsRun.map((c) => {
                const live = c.status === "ok" && c.signalCount > 0;
                const partial = c.status === "ok" && c.signalCount === 0;
                const failed = c.status === "error" || c.status === "timeout";
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-1.5 text-[11px]"
                    data-testid={`connector-${c.id}`}
                  >
                    {live ? (
                      <span className="text-emerald-400" title="live">✓</span>
                    ) : partial ? (
                      <span className="text-atlas-muted" title="ok but no results">○</span>
                    ) : (
                      <span className="text-amber-400" title={c.status}>!</span>
                    )}
                    <span className={live ? "text-atlas-text" : failed ? "text-amber-400" : "text-atlas-muted"}>
                      {c.id}
                    </span>
                    <span className="ml-auto text-[10px] text-atlas-muted">
                      {c.signalCount}
                    </span>
                  </div>
                );
              })}
            </div>
            {plan && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-atlas-border pt-3">
                <span className="inline-flex items-center gap-1 rounded-full border border-atlas-border bg-atlas-surface2 px-2.5 py-1 text-[11px] text-atlas-muted">
                  plan · {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"} · {plan.vertical}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-atlas-border bg-atlas-surface2 px-2.5 py-1 text-[11px] text-atlas-muted">
                  {(() => {
                    const m = responseBody?.model;
                    const id = typeof m === "string" ? m : m?.id;
                    return `model · ${id ?? "unknown"}`;
                  })()}
                </span>
              </div>
            )}
          </section>
        )}

        <section className="mb-6">
          <ResultMapClient
            rankedSites={rankedSites}
            plots={plotsForMap}
            catalogListings={catalogListingsForMap}
            status={responseStatus}
            city={stubCity}
            country={stubCountry}
            stubReason={stubReason}
          />
        </section>

        {/* Real-time ranking analytics chart — bar chart per site +
            factor-by-factor line chart for the top 3. Hover any bar
            to see the site's stats. */}
        {rankedSites.length > 0 && (
          <section className="mb-6">
            <RankingChart
              sites={rankedSites.map((s) => ({
                rank: s.rank,
                name: s.name,
                score: s.score,
                confidence: s.confidence,
                rationale: s.rationale,
                lat: s.lat,
                lng: s.lng,
                signals: s.signals,
                scoreBreakdown: s.scoreBreakdown,
                // Day 21: property-level data (passed through from
                // REAL_SITE_CATALOG enrichment to the card UI).
                suburb: (s as any).suburb,
                cornerStand: (s as any).cornerStand,
                facing: (s as any).facing,
                plotSizeHectares: (s as any).plotSizeHectares,
                priceRange: (s as any).priceRange,
                zoning: (s as any).zoning,
                titleType: (s as any).titleType,
                arterial: (s as any).arterial,
                nearestHighwayKm: (s as any).nearestHighwayKm,
                competition: (s as any).competition,
                advantages: (s as any).advantages,
                disadvantages: (s as any).disadvantages,
                medianIncome: (s as any).medianIncome,
                dataProvenance: (s as any).dataProvenance,
              }))}
            />
          </section>
        )}

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-atlas-text">
              Ranked sites
            </h2>
            <span className="text-[10px] uppercase tracking-wider text-atlas-muted">
              {rankedSites.length} site{rankedSites.length === 1 ? "" : "s"} · click to expand
            </span>
          </div>
           <ol className="space-y-2">
            {rankedSites.map((s, i) => (
              <RankedSiteCard
                key={i}
                site={{
                  rank: s.rank,
                  name: s.name,
                  score: s.score,
                  confidence: s.confidence,
                  rationale: s.rationale,
                  lat: s.lat,
                  lng: s.lng,
                  signals: s.signals,
                  scoreBreakdown: s.scoreBreakdown,
                  suburb: (s as any).suburb,
                  cornerStand: (s as any).cornerStand,
                  facing: (s as any).facing,
                  plotSizeHectares: (s as any).plotSizeHectares,
                  priceRange: (s as any).priceRange,
                  zoning: (s as any).zoning,
                  titleType: (s as any).titleType,
                  arterial: (s as any).arterial,
                  nearestHighwayKm: (s as any).nearestHighwayKm,
                  competition: (s as any).competition,
                  advantages: (s as any).advantages,
                  disadvantages: (s as any).disadvantages,
                  medianIncome: (s as any).medianIncome,
                  dataProvenance: (s as any).dataProvenance,
                  liveListings: (s as any).liveListings,
                }}
                fallbackLatLng={streetViewAnchor}
              />
            ))}
          </ol>
        </section>

        <ListingsOverlay
          questionId={id}
          initialOwner={ownerPlots}
          initialMarket={marketPlots}
          initialTavilyListings={tavilyListingsForOverlay}
          cityFilter={cityFilter}
        />
        </div>

        <FeedbackWidget questionId={id} />

        <footer className="mt-auto pt-12 text-center text-xs text-atlas-muted">
           <p>
             Atlas · {new Date().getFullYear()}
           </p>
         </footer>

      {/* Day 28 — floating chat panel for follow-ups + live result refinements */}
      <ResultChatPanel
        questionContext={question.questionText}
        rankedSites={rankedSites}
      />
    </AppShell>
  );
}
