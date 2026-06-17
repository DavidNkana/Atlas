import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { getModel, MODEL_INFO, ALL_MODELS } from "@/lib/models/registry";
import type { Model } from "@/lib/models/types";
import { curatedStub } from "@/lib/models/stub";
import type { Vertical, ModelInfo } from "@/lib/models/types";
import { getConnector } from "@/lib/connectors/registry";
import type { Signal } from "@/lib/connectors/types";
import { combine } from "@/lib/scoring/engine";
import type { ScoreBreakdown, ScoreFactor } from "@/lib/scoring/types";
import { buildPlan } from "@/lib/plan/planner";
import type { Plan } from "@/lib/plan/types";
import { withTimeout } from "@/lib/util/timeout";

/**
 * Day 5 hotfix — handler-level budget.
 *
 * Vercel's free-tier Pro default FUNCTION_INVOCATION_TIMEOUT is 300s.
 * We hit it because the AI fallback chain cascaded through every
 * discovered OpenRouter model. The handler itself now has a 50s hard
 * budget; we set the elapsed-ms header on the response so Chris can
 * see the real wall-clock time in DevTools.
 */
const HANDLER_TIMEOUT_MS = 50_000;

/**
 * Day 5 hotfix v2 — per-step budgets.
 *
 * The handler is now structured as three explicit steps so that a
 * timeout in Step B (connectors) does NOT throw — we can still return
 * Step A's AI answer with connectorsError set. Only a Step A failure
 * throws and triggers the outer partial_timeout stub.
 *
 *   Step A: model fallback chain — 35s. Picks a model and returns
 *           ranked_sites. If this times out or all models fail, we
 *           throw and the outer POST returns 200 + partial_timeout.
 *   Step B: connector fan-out — 12s. Promise.allSettled so one slow
 *           connector never blocks another. If this times out, we
 *           return Step A's result with connectorsError = "timeout".
 *   Step C: persist + respond. Always runs.
 */
const STEP_A_TIMEOUT_MS = 35_000;
const STEP_B_TIMEOUT_MS = 12_000;

/**
 * Day 5 hotfix v2 — per-model timeout.
 *
 * If a single model hangs (network stall, server-side hang), kill it
 * after 25s and move to the next model in the chain. The error
 * message uses the prefix "model_<id>_timeout" so catch blocks can
 * distinguish per-model timeouts from the outer api_ask_timeout.
 */
const MODEL_TIMEOUT_MS = 25_000;

/**
 * Day 5 hotfix — fallback chain cap.
 *
 * Cap total model attempts at 3: primary → 1 best fallback → curated-stub.
 * Previously we cascaded through ALL live models (5+ attempts × 30s each
 * = 150s+), which is the dominant contributor to the 504s we were seeing.
 */
const MAX_FALLBACK_ATTEMPTS = 3;

/**
 * Day 5 — connectors wired in.
 *
 * Flow:
 *   1. POST /api/ask (auth, validate, model call) — same as Day 3/4.
 *   2. After the AI returns ranked_sites:
 *      a. buildPlan(vertical, location, sites)
 *      b. For every step, call connector.fetch(ctx) via Promise.allSettled
 *         so one failure never aborts the rest.
 *      c. For every site, combine(aiSite, signalsForSite, vertical) to get
 *         a ScoreBreakdown, then update site.score and attach signals +
 *         breakdown.
 *      d. Build connectorsRun[] for the response so the UI can show
 *         "overpass · 12 signals · ok".
 *   3. If EVERY connector failed, keep the AI score unchanged and surface
 *      connectorsError so the UI can show the amber banner.
 *   4. Persist responseJson to Prisma (preserved existing behaviour).
 *
 * For v1, "location" comes from the FIRST ranked_sites entry that has
 * lat/lng — the AI's top pick usually anchors on the user's query region.
 * When the front-end starts sending an explicit location, swap this for
 * that input.
 */

type AskRequest = {
  vertical: string;
  question: string;
  model?: string;
};

type RankedSite = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;
  lng?: number;
  /** Day 5 — populated by the scoring engine. */
  signals?: Signal[];
  scoreBreakdown?: ScoreBreakdown;
};

type ConnectorRun = {
  id: string;
  status: "ok" | "error" | "timeout";
  signalCount: number;
};

type ModelBlock = {
  id: string;
  displayName: string;
  provider: string;
  free: boolean;
  fallbackUsed: boolean;
  /** Day 5 hotfix — list of model ids that were attempted before success / stub. */
  attemptedChain?: string[];
  modelError?: string;
};

type AskResponse = {
  id: string;
  status: string;
  model: ModelBlock;
  vertical: string;
  question: string;
  echo: string;
  ranked_sites: RankedSite[];
  /** Day 5 — the plan we actually executed. */
  plan?: Plan;
  /** Day 5 — per-connector status. */
  connectorsRun?: ConnectorRun[];
  /** Day 5 — set when every connector failed (UI shows amber banner). */
  connectorsError?: string;
};

const SUPPORTED_VERTICALS = new Set<Vertical>([
  "gas_station",
  "restaurant",
  "warehouse",
  "retail_shop",
]);

function modelInfoToBlock(info: ModelInfo, fallbackUsed: boolean, modelError?: string, attemptedChain?: string[]): ModelBlock {
  const block: ModelBlock = {
    id: info.id,
    displayName: info.displayName,
    provider: info.provider,
    free: info.free,
    fallbackUsed,
  };
  if (modelError) {
    block.modelError = modelError;
  }
  if (attemptedChain && attemptedChain.length > 0) {
    block.attemptedChain = attemptedChain;
  }
  return block;
}

/**
 * Pick a query location from the ranked sites. We prefer the first site
 * with lat/lng. If none have coords (e.g. the AI returned text-only
 * reasoning for restaurant/warehouse/retail) we fall back to Lusaka CBD
 * so connectors at least run and return a real, comparable number.
 */
function deriveLocation(sites: RankedSite[]): {
  lat: number;
  lng: number;
  label?: string;
} {
  for (const s of sites) {
    if (
      typeof s.lat === "number" &&
      typeof s.lng === "number" &&
      !Number.isNaN(s.lat) &&
      !Number.isNaN(s.lng)
    ) {
      return { lat: s.lat, lng: s.lng, label: s.name };
    }
  }
  // Lusaka CBD fallback
  return { lat: -15.3875, lng: 28.3228, label: "Lusaka CBD (fallback)" };
}

/**
 * Day 5 hotfix — the handler itself is wrapped in a 50s hard timeout
 * (withTimeout). If the inner work doesn't finish in time, we throw
 * api_ask_timeout and the outer POST returns a 504-shaped JSON with a
 * "timed out" message and the elapsed time we know about. The header
 * `x-atlas-elapsed-ms` is set on every response so Chris can see the
 * real wall-clock duration in DevTools' Network tab.
 *
 * Why 50s and not the Vercel default 60s? Give ourselves a 10s buffer
 * so Prisma persist + JSON serialisation can finish before Vercel
 * hard-kills us at 60s. Vercel's FUNCTION_INVOCATION_TIMEOUT is the
 * real ceiling; our 50s is an inner cap.
 */
async function handleAsk(req: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();

  // 1. Auth check
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in required" },
      { status: 401 }
    );
  }

  // 2. Parse + validate body
  let body: AskRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 401 } // preserve Day 4 status; not changing auth/validation contracts
    );
  }

  const { vertical, question, model } = body;

  if (!vertical || typeof vertical !== "string") {
    return NextResponse.json(
      { error: "Missing 'vertical' field" },
      { status: 401 }
    );
  }
  if (!question || typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { error: "Missing 'question' field" },
      { status: 401 }
    );
  }
  if (!SUPPORTED_VERTICALS.has(vertical as Vertical)) {
    return NextResponse.json(
      {
        error: `Unsupported vertical: ${vertical}. Supported: ${Array.from(
          SUPPORTED_VERTICALS
        ).join(", ")}`,
      },
      { status: 401 }
    );
  }

  const trimmedQuestion = question.trim();

  // 3. Resolve model — default to gemini-flash
  const requestedModelId = (model && typeof model === "string") ? model : "gemini-flash";
  let activeModel: Model;
  let activeInfo: ModelInfo;
  let fallbackUsed = false;
  let responseStatus: "ok" | "stub_fallback" = "ok";

  // Day 5 hotfix — track every model id we attempted so the user sees
  // exactly what was tried in the response.
  const attemptedChain: string[] = [];

  // Day 5 hotfix — if the user picks the curated stub explicitly, we skip
  // the entire chain (it's already a stub).
  const requestedIsStub = requestedModelId === "curated-stub";

  try {
    activeModel = getModel(requestedModelId);
    activeInfo = activeModel.info;
    if (!activeModel.isAvailable()) {
      // Requested model has no key set — fall back to curated stub
      console.warn(`[/api/ask] model ${requestedModelId} not available, falling back to curated-stub`);
      attemptedChain.push(requestedModelId);
      activeModel = curatedStub;
      activeInfo = curatedStub.info;
      fallbackUsed = true;
      responseStatus = "stub_fallback";
    }
  } catch {
    // Unknown model id — fall back to curated stub
    console.warn(`[/api/ask] unknown model ${requestedModelId}, falling back to curated-stub`);
    attemptedChain.push(requestedModelId);
    activeModel = curatedStub;
    activeInfo = curatedStub.info;
    fallbackUsed = true;
    responseStatus = "stub_fallback";
  }

  // Day 5 hotfix — if primary is the stub, don't bother cascading.
  if (!requestedIsStub && activeInfo.id !== "curated-stub") {
    attemptedChain.push(activeInfo.id);
  }

  // 4. Step A — call the model (with 35s budget). If this throws or
  // times out, the outer POST returns 200 + partial_timeout. The model
  // fallback chain (primary → 1 best fallback → curated-stub) is capped
  // at MAX_FALLBACK_ATTEMPTS and each model.call() is itself wrapped
  // in a 25s per-model timeout via callModel() below.
  let rankedSites: RankedSite[] = [];
  let raw: string | undefined;
  let modelError: string | undefined;

  // Helper — keep the model-call try-block small and readable.
  // Day 5 hotfix v2: every model.call() is wrapped in a 25s per-model
  // timeout so a single hanging model can't burn the whole handler
  // budget. The error message uses the "model_<id>_timeout" prefix
  // so catch blocks can distinguish a per-model timeout from the
  // outer api_ask_timeout.
  const callModel = async (m: Model): Promise<{ ranked_sites: RankedSite[]; raw?: string }> => {
    const result = await withTimeout(
      m.call({
        vertical: vertical as Vertical,
        question: trimmedQuestion,
      }),
      MODEL_TIMEOUT_MS,
      "model:" + m.info.id,
    );
    return { ranked_sites: result.ranked_sites, raw: result.raw };
  };

  try {
    await withTimeout((async () => {
      try {
        const result = await callModel(activeModel);
        rankedSites = result.ranked_sites;
        raw = result.raw;
        return;
      } catch (modelErr) {
        // Primary model failed. Day 5 hotfix: cap the fallback chain at
        // MAX_FALLBACK_ATTEMPTS (3 total = primary → 1 fallback → curated-stub).
        // Previously we cascaded through every live model (5+ × 30s = 150s+),
        // which was the dominant contributor to FUNCTION_INVOCATION_TIMEOUT.
        const primaryErrMsg =
          modelErr instanceof Error ? modelErr.message : String(modelErr);
        console.error(
          `[/api/ask] model ${activeInfo.id} call failed, trying fallback chain (max ${MAX_FALLBACK_ATTEMPTS} attempts):`,
          modelErr
        );

        const errorChain: string[] = [
          `${activeInfo.id} call failed: ${primaryErrMsg}`,
        ];

        // Build fallback chain: every model in the registry except the one
        // that just failed and except the curated-stub. Only live (isAvailable)
        // ones. We cap attempts at MAX_FALLBACK_ATTEMPTS - 1 (primary is 1) so
        // the final curated-stub call is always the last attempt.
        const fallbackChain = ALL_MODELS.filter(
          (m) =>
            m.info.id !== activeInfo.id &&
            m.info.id !== "curated-stub" &&
            m.isAvailable()
        ).slice(0, MAX_FALLBACK_ATTEMPTS - 2); // -2 = primary + curated-stub

        let cascaded = false;
        for (const fallback of fallbackChain) {
          try {
            const fallbackResult = await callModel(fallback);
            rankedSites = fallbackResult.ranked_sites;
            raw = fallbackResult.raw;
            activeInfo = fallback.info;
            activeModel = fallback;
            fallbackUsed = true;
            cascaded = true;
            attemptedChain.push(fallback.info.id);
            console.log(
              `[/api/ask] fallback chain served by ${fallback.info.id} after ${activeInfo.id} failed`
            );
            return;
          } catch (fallbackErr) {
            const fbMsg =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : String(fallbackErr);
            errorChain.push(`${fallback.info.id} call failed: ${fbMsg}`);
            attemptedChain.push(fallback.info.id);
            console.error(
              `[/api/ask] fallback model ${fallback.info.id} also failed:`,
              fallbackErr
            );
            continue;
          }
        }

        if (!cascaded) {
          // All fallbacks failed (or there were none available). Use curated
          // stub so the user never sees a 500. modelError captures every
          // failure in the chain so we can see why the stub fired.
          attemptedChain.push("curated-stub");
          const stubResult = await callModel(curatedStub);
          rankedSites = stubResult.ranked_sites;
          raw = stubResult.raw;
          activeInfo = curatedStub.info;
          activeModel = curatedStub;
          fallbackUsed = true;
          responseStatus = "stub_fallback";
        }

        // Surface every error in the chain (newline-separated) for debugging.
        // If we successfully cascaded to another live model, the primary error
        // alone is enough — the user got a real answer, just not from their pick.
        modelError = cascaded
          ? errorChain[0]
          : errorChain.join("\n");
      }
    })(), STEP_A_TIMEOUT_MS, "step_a");
  } catch (stepAErr) {
    // Step A exhausted its 35s budget (or threw). Let the outer POST
    // catch it and return 200 + partial_timeout.
    throw stepAErr;
  }

  // 5. Step B — connectors + scoring (12s budget).
  // Build the plan, fan-out to connectors in parallel, collect signals per
  // site, then run the scoring engine. Track per-connector status so the
  // UI can show "overpass · 12 signals · ok" / "ok · 0 signals" / "error".
  //
  // Day 5 hotfix v2: if Step B times out, we DO NOT throw. We return
  // Step A's AI answer with connectorsError = "timeout" so the user
  // sees the ranked sites, just without enrichment signals. The
  // partial_timeout status (set by the outer POST on api_ask_timeout)
  // is distinct from this per-step connectorsError.
  let connectorsRun: ConnectorRun[] = [];
  let connectorsError: string | undefined;
  let allConnectorsFailed = false;
  let plan: Plan | undefined;

  try {
    await withTimeout((async () => {
      const location = deriveLocation(rankedSites);
      const builtPlan: Plan = buildPlan(vertical as Vertical, location, rankedSites);

      // Run every plan step. We map index → site.id so we can rebuild
      // signalsForSite[siteId] without re-reading the plan.
      const stepResults = await Promise.allSettled(
        builtPlan.steps.map((step) => {
          const skip = step.input.__skip === true;
          if (skip) {
            // Resolved immediately with []; treated as "ok · 0 signals".
            return Promise.resolve<Signal[]>([]);
          }
          const connector = getConnector(step.connectorId);
          // Find the site the step is for. The planner always emits one step
          // per site, in the same order, so we can use the step index.
          const site = rankedSites[builtPlan.steps.indexOf(step)];
          if (!site) {
            return Promise.resolve<Signal[]>([]);
          }
          const ctx = {
            vertical: vertical as Vertical,
            location,
            site: {
              id: String(site.rank),
              name: site.name,
              lat: site.lat ?? location.lat,
              lng: site.lng ?? location.lng,
            },
          };
          return connector.fetch(ctx);
        }),
      );

      // Bucket signals per siteId (which is the site rank as a string).
      const signalsBySite: Record<string, Signal[]> = {};
      builtPlan.steps.forEach((step, i) => {
        const siteId = String(rankedSites[i]?.rank ?? i);
        const settled = stepResults[i];
        if (settled && settled.status === "fulfilled") {
          signalsBySite[siteId] = settled.value ?? [];
        } else {
          signalsBySite[siteId] = [];
        }
      });

      // Per-connector status — today we only have one connector ("overpass")
      // but we aggregate across all sites for the response.
      const signalsByConnector: Record<string, Signal[]> = {};
      let anyConnectorFailed = false;
      for (let i = 0; i < builtPlan.steps.length; i += 1) {
        const step = builtPlan.steps[i];
        const settled = stepResults[i];
        if (!settled) continue;
        const sigs = settled.status === "fulfilled" ? settled.value ?? [] : [];
        if (!signalsByConnector[step.connectorId]) {
          signalsByConnector[step.connectorId] = [];
        }
        signalsByConnector[step.connectorId] =
          signalsByConnector[step.connectorId].concat(sigs);
        if (settled.status === "rejected") {
          anyConnectorFailed = true;
        }
      }

      connectorsRun = Object.entries(
        signalsByConnector,
      ).map(([id, sigs]) => ({
        id,
        status: sigs.length === 0 && anyConnectorFailed ? ("error" as const) : ("ok" as const),
        signalCount: sigs.length,
      }));

      // Apply scoring engine to every site.
      for (const site of rankedSites) {
        const siteId = String(site.rank);
        const signals = signalsBySite[siteId] ?? [];
        const breakdown = combine(
          { id: siteId, score: site.score },
          signals,
          vertical as Vertical,
        );
        site.score = breakdown.confidence;
        site.signals = signals;
        site.scoreBreakdown = breakdown;
      }

      allConnectorsFailed =
        connectorsRun.length > 0 &&
        connectorsRun.every((c) => c.status !== "ok" || c.signalCount === 0);

      // Only assign outer `plan` after Step B fully succeeds. If
      // Step B times out or throws, we leave plan = undefined and the
      // response omits the plan field.
      plan = builtPlan;
    })(), STEP_B_TIMEOUT_MS, "step_b");
  } catch (stepBErr) {
    // Step B timed out (or threw). Day 5 hotfix v2: return Step A's
    // AI answer with connectorsError = "timeout" instead of throwing.
    // We do NOT let this propagate — the outer POST's partial_timeout
    // path is reserved for Step A failures.
    const msg = stepBErr instanceof Error ? stepBErr.message : String(stepBErr);
    if (msg === "step_b_timeout") {
      console.warn(`[/api/ask] step_b timed out after ${STEP_B_TIMEOUT_MS}ms — returning AI answer without connector enrichment`);
      connectorsError = "timeout";
    } else {
      // Unexpected Step B error — still do not throw, just surface it.
      console.error(`[/api/ask] step_b failed unexpectedly:`, stepBErr);
      connectorsError = `connectors failed: ${msg}`;
      allConnectorsFailed = true;
    }
  }

  // 6. Build response body (sans id; id comes from prisma row)
  const responseBody: Omit<AskResponse, "id"> = {
    status: responseStatus,
    model: modelInfoToBlock(activeInfo, fallbackUsed, modelError, attemptedChain),
    vertical,
    question: trimmedQuestion,
    echo: raw ? `Answer generated by ${activeInfo.displayName}${fallbackUsed ? " (fallback)" : ""}.` : "ok",
    ranked_sites: rankedSites,
    plan,
    connectorsRun,
  };
  if (allConnectorsFailed) {
    responseBody.connectorsError = "all connectors failed";
  }
  if (connectorsError) {
    // Either "timeout" (Step B hit its 12s budget) or a non-timeout
    // connector error. Both are surfaced so the UI can show the amber
    // banner without throwing.
    responseBody.connectorsError = connectorsError;
  }

  // 7. Persist to Supabase via Prisma (best-effort; surface errors to caller)
  let questionRow;
  try {
    questionRow = await prisma.question.create({
      data: {
        userId,
        vertical,
        questionText: trimmedQuestion,
        responseJson: responseBody as any,
      },
    });
  } catch (dbErr) {
    console.error("[/api/ask] failed to persist question:", dbErr);
    return NextResponse.json(
      { error: "Failed to record question" },
      { status: 500 }
    );
  }

  // 8. Return response + id
  const response: AskResponse = {
    id: questionRow.id,
    ...responseBody,
  };
  const finalResponse = NextResponse.json(response);
  // Diagnostic header — Chris can see real wall-clock time in DevTools.
  finalResponse.headers.set("x-atlas-elapsed-ms", String(Date.now() - t0));
  return finalResponse;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  // Day 5 hotfix v2 — partial-response pattern.
  //
  // When the handler exceeds its 50s budget (api_ask_timeout), the old
  // code returned 504 to the user, which Vercel converts to a
  // user-visible 504. Now we return 200 with a partial_timeout stub so
  // the UI can show "we couldn't finish in time, try again or use
  // curated-stub". Only true unhandled errors return 5xx.
  let timeoutFired = false;
  let handlerResponse: NextResponse | null = null;
  try {
    handlerResponse = await withTimeout(
      handleAsk(req),
      HANDLER_TIMEOUT_MS,
      "api_ask",
    );
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[/api/ask] handler timed out or threw after ${elapsed}ms:`, err);
    if (msg === "api_ask_timeout") {
      timeoutFired = true;
    } else {
      // Unhandled error from inside the handler — still surface 500 so
      // the user sees something is broken, and we get a real alert.
      const body = {
        error: "Atlas /api/ask failed",
        message: msg,
        elapsedMs: elapsed,
      };
      const response = NextResponse.json(body, { status: 500 });
      response.headers.set("x-atlas-elapsed-ms", String(elapsed));
      response.headers.set("x-atlas-status", "error");
      return response;
    }
  }

  if (timeoutFired) {
    // Build the partial_timeout stub. We return 200 (not 504) so the
    // UI can render a graceful "we couldn't finish in time" state
    // instead of a hard Vercel error page.
    const partialResult = {
      status: "partial_timeout",
      error: "Request exceeded 50s budget. Try again or pick curated-stub for instant response.",
      elapsedMs: HANDLER_TIMEOUT_MS,
      ranked_sites: [],
      model: {
        id: "timeout",
        displayName: "Timed out",
        fallbackUsed: true,
        attemptedChain: [],
      },
    };
    const res = NextResponse.json(partialResult);
    res.headers.set("x-atlas-elapsed-ms", String(partialResult.elapsedMs));
    res.headers.set("x-atlas-status", "partial_timeout");
    return res;
  }

  // Normal happy path — handler returned a real response.
  // Belt-and-braces: ensure header is set even if the inner handler
  // returned before we got here (it already sets it, but this guards
  // future refactors that might forget).
  handlerResponse!.headers.set("x-atlas-elapsed-ms", String(Date.now() - t0));
  return handlerResponse!;
}

// Liveness check — also reports the available model list.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Atlas /api/ask is alive. POST a { vertical, question, model? } body.",
    supported_verticals: Array.from(SUPPORTED_VERTICALS),
    models: MODEL_INFO,
  });
}
