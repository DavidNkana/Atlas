import { NextRequest, NextResponse } from "next/server";
import { auth, getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { getModel, MODEL_INFO, ALL_MODELS } from "@/lib/models/registry";
import type { Model } from "@/lib/models/types";
import { curatedStub, type StubPayload } from "@/lib/models/stub";
import type { Vertical, ModelInfo } from "@/lib/models/types";
import { getConnector } from "@/lib/connectors/registry";
import type { Signal } from "@/lib/connectors/types";
import { combine } from "@/lib/scoring/engine";
import type { ScoreBreakdown, ScoreFactor } from "@/lib/scoring/types";
import { buildPlan } from "@/lib/plan/planner";
import type { Plan } from "@/lib/plan/types";
import { classifyIntent } from "@/lib/intent/classify";
import { enrichSitesWithCatalog } from "@/lib/stub/enrich-sites";
import { fetchLiveListings, type LiveListing } from "@/lib/connectors/tavily-listings";
import { fetchNearbyCompetitors } from "@/lib/connectors/google-places";
import { withTimeout } from "@/lib/util/timeout";
import { sanitizeForJson } from "@/lib/util/json-sanitize";

/**
 * Day 5 hotfix — handler-level budget.
 *
 * Vercel's free-tier Pro default FUNCTION_INVOCATION_TIMEOUT is 300s.
 * We hit it because the AI fallback chain cascaded through every
 * discovered OpenRouter model. The handler itself now has a 50s hard
 * budget; we set the elapsed-ms header on the response so Chris can
 * see the real wall-clock time in DevTools.
 */
// Day 12 v28: HANDLER_TIMEOUT_MS must be < Vercel's
// FUNCTION_INVOCATION_TIMEOUT (60s on Pro) to give us time
// to return a 200 partial_timeout stub before Vercel kills us.
const HANDLER_TIMEOUT_MS = 58_000;

// Force dynamic evaluation. Without this, Next.js 15 may treat the
// route as a Server Component endpoint and try to evaluate it at
// build time, where `auth()` returns null because there's no
// request context. With this export, every POST runs the handler
// fresh against the live request — no caching, no build-time eval.
export const dynamic = "force-dynamic";

// Day 12 hotfix: when an inner timeout (step_a, step_b, or a
// per-model timeout) fires, we want to return a 200 with a
// partial_timeout stub that includes the actual chain of
// models we attempted + the model error from the last attempt.
// These are module-level so handleAsk() can write to them
// without a heavy refactor. Vercel's Node runtime processes one
// request at a time per worker, so this is safe — no race
// between concurrent requests on the same worker. We RESET
// these at the top of every POST.
let partialAttemptedChain: string[] = [];
let partialModelError: string | null = null;
let partialVertical: string = "";
let partialQuestionText: string = "";
let partialUserId: string = "";

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
// Day 12 v28: Vercel Pro hard-limits the function at 60s.
// We need to fit: model call + Step B connectors + persist
// + response. Budget:
//   - gemini-search: 50s (3 model id attempts, each up to ~15s)
//   - Step B: 5s (just city-aware validation now, no slow connectors)
//   - Persist + respond: 3s
//   - Total: 58s (under the 60s Vercel ceiling)
// HANDLER_TIMEOUT_MS matches Vercel exactly. STEP_A is the
// budget for the model call + cascade.
const STEP_A_TIMEOUT_MS = 55_000;
const STEP_B_TIMEOUT_MS = 5_000;
// Day 22 v12: Tavily live-listings needs its OWN budget because
// 7 parallel portal searches + extracts take 6-10s. The original
// STEP_B_TIMEOUT_MS=5_000 budget was killing the fetcher before
// it returned anything — which is why the UI showed Gemini's
// reasoning but no Live listings section. Listings get 15s.
const TAVILY_LISTINGS_TIMEOUT_MS = 15_000;

// Day 12 v4: per-model timeout dropped from 25s to 8s. The 25s
// cap was originally set to give slow models (e.g. Gemini 3.5 Flash
// during quota exhaustion) enough time to respond. In practice
// that meant 1 model + 1 fallback could each take 25s, blowing
// the 35s Step A budget on a SINGLE model + fallback. With 8s
// per model we can try the primary + 2 fallbacks + curated
// stub in 24s, leaving 11s for everything else (overpass
// queries, scoring). The fast-fail is the right call for a UX
// that values "always something" over "perfect answer eventually".
const MODEL_TIMEOUT_MS = 8_000;

// Day 12 v28: gemini-search tries 3 different model ids in
// sequence (2.0-flash, 1.5-flash, 2.5-flash) — each can take
// 10-15s before failing with 404/503/429. The route's
// withTimeout applies to the whole model.call() function
// not per-attempt. So we need 60s budget for the full
// 3-attempt cascade.
const MODEL_TIMEOUT_OVERRIDES: Record<string, number> = {
  'gemini-search': 60_000,
  'tavily': 45_000,
};

function getModelTimeoutMs(modelId: string): number {
  return MODEL_TIMEOUT_OVERRIDES[modelId] ?? MODEL_TIMEOUT_MS;
}

/**
 * Day 5 hotfix v2 — per-model timeout.
 *
 * If a single model hangs (network stall, server-side hang), kill it
 * after 8s and move to the next model in the chain. The error
 * message uses the prefix "model_<id>_timeout" so catch blocks can
 * distinguish per-model timeouts from the outer api_ask_timeout.
 * (Value is set at line 78 above; the duplicate was removed.)
 */

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
  // Day 29 v2 — optional previous question context, used by the
  // apply-to-results flow to keep the original city signal
  // when the refined query alone is ambiguous.
  previousContext?: string;
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
  /** Day 22 — live per-listing data from Property24 + Private Property.
   * Each ranked site carries the listings matched to it (3 max per site
   * on free-tier Tavily). UI renders as "Live listings" card section. */
  liveListings?: LiveListing[];
  /** Day 22 — when live listings are unavailable (no TAVILY key, or
   * Tavily failed). UI surfaces "live listings unavailable" badge. */
  liveListingsError?: string;
  /** LCP-64 — Google Places competitor search error (if any). */
  placesError?: string;
  /** LCP-62 v4 — browser-use research output (polled for up to 8s). */
  researchNotes?: string;
  /** LCP-62 v4 — live browser URL to watch the agent work. */
  researchLiveUrl?: string;
  /** LCP-62 v4 — set when browser-use fails, has no key, or is misconfigured. */
  researchError?: string;
  /** Day 5 — the plan we actually executed. */
  plan?: Plan;
  /** Day 5 — per-connector status. */
  connectorsRun?: ConnectorRun[];
  /** Day 5 — set when every connector failed (UI shows amber banner). */
  connectorsError?: string;
  /** Day 6 — when status === "stub_demo", the city we detected. */
  city?: string;
  /** Day 6 — when status === "stub_demo", the country we detected. */
  country?: string;
  /** Day 6 — human-readable explanation of why the stub fired. */
  stubReason?: string;
  /** Day 12 v16 — research answer from Gemini Search. */
  answer?: string;
  /** Day 12 v16 — citations from Gemini Search. */
  sources?: Array<{ title?: string; url: string }>;
  /** Day 17 v6 — which engine answered (tavily_plus_gemini | gemini_search | curated). */
  primaryEngine?: string;
  /** Day 17 v6 — intent classification (spatial | conversational). */
  intent?: "spatial" | "conversational";
  /** Day 17 v6 — pattern scores that drove the intent decision. */
  intentScore?: {
    spatial: number;
    conversational: number;
  };
  /** Day 17 v6 — the actual matched patterns (shown in UI). */
  matchedPatterns?: {
    spatial: string[];
    conversational: string[];
  };
};

/**
 * The wire type for /api/ask: either one of the 4 builtin verticals or
 * a custom value matching /custom:[a-z0-9_]+/. We keep the runtime cast
 * (`as Vertical` in a few places) for downstream type compatibility
 * with lib/models/types.ts but accept any string at the edge.
 */
type AskVertical = Vertical | `custom:${string}`;

const SUPPORTED_VERTICALS = new Set<Vertical>([
  // Day 1-8 verticals (the 4 chip-buttons at the top of the home page)
  "gas_station",
  "restaurant",
  "warehouse",
  "retail_shop",
  // Day 9: land verticals suggested by the vertical-mismatch modal
  // when the user's question clearly points to a different vertical
  // than the one selected. The mismatch modal's "Switch to {suggested}"
  // button sets the vertical to one of these and auto-submits — if
  // we don't accept them here, the route returns 401 "Unsupported
  // vertical" which the page misinterprets as a sign-in error.
  "residential_land",
  "commercial_land",
  "agricultural_land",
  "industrial_land",
  "mixed_use_land",
  "civic_land",
]);

/**
 * Custom verticals are user-defined (e.g. "residential_land", "office_block").
 * They are opaque tokens the API forwards through to the model and the
 * scoring engine — neither knows how to score them, so the connectors
 * gracefully degrade to the cross-vertical query and the stub returns
 * generic templates. The user gets an answer, just not a vertical-tuned one.
 */
const CUSTOM_VERTICAL_RE = /^custom:[a-z][a-z0-9_]{1,39}$/;

/**
 * Custom verticals are user-defined (e.g. "residential_land", "office_block").
 * They are opaque tokens the API forwards through to the model and the
  * scoring engine — neither knows how to score them, so the connectors
  * gracefully degrade to the cross-vertical query and the stub returns
  * generic templates. The user gets an answer, just not a vertical-tuned one.
 */
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
  //
  // Day 9: We use getAuth(req) instead of the bare auth() call.
  // getAuth() takes the request directly and reads the Clerk
  // session state from the request context. The bare auth() reads
  // from a module-level cache that the Clerk middleware populates.
  // On Next.js 15 + Clerk v6, that cache can be stale in edge
  // regions or when the request goes through a long-lived serverless
  // worker — which produces the 401 even though the user IS signed
  // in and the middleware returned 200.
  //
  // By reading the auth state directly from the request, we
  // guarantee we see the same session the middleware validated.
  const cookieNames = req.cookies.getAll().map((c) => c.name);
  const hasSessionCookie = cookieNames.some(
    (n) => n.startsWith("__session") || n.startsWith("__client") || n === "session"
  );
  const authResult = getAuth(req);
  const userId = authResult.userId;
  partialUserId = userId ?? "";
  if (!userId) {
    console.warn(
      `[ask-401] cookies=${cookieNames.length} hasSession=${hasSessionCookie} userId=null` +
        ` sessionClaimsKeys=${authResult.sessionClaims ? Object.keys(authResult.sessionClaims).length : 0}` +
        ` url=${req.nextUrl.pathname}`
    );
    return NextResponse.json(
      {
        error: "Sign in required",
        debug: {
          cookieCount: cookieNames.length,
          hasSessionCookie,
          sessionClaimsKeys: authResult.sessionClaims
            ? Object.keys(authResult.sessionClaims).length
            : 0,
        },
      },
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

  const { vertical, question, model, previousContext } = body;

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
  if (!SUPPORTED_VERTICALS.has(vertical as Vertical) && !CUSTOM_VERTICAL_RE.test(vertical)) {
    return NextResponse.json(
      {
        error: `Unsupported vertical: ${vertical}. Supported: ${Array.from(
          SUPPORTED_VERTICALS
        ).join(", ")}, or a custom value matching /${CUSTOM_VERTICAL_RE.source}/`,
      },
      { status: 401 }
    );
  }

  // For downstream code, narrow custom verticals to a generic "fallback"
  // behaviour: connectors fire with their default radius / query and the
  // stub generator uses generic town-centre templates. The user's custom
  // value is preserved in the response.vertical field so the UI can
  // display it correctly.
  const effectiveVertical: Vertical =
    (SUPPORTED_VERTICALS.has(vertical as Vertical) ? vertical : "retail_shop") as Vertical;
  const isCustom = !SUPPORTED_VERTICALS.has(vertical as Vertical);

  const trimmedQuestion = question.trim();
  // Mirror to module-level vars so the outer POST can persist
  // a Question row on partial_timeout.
  partialVertical = vertical;
  partialQuestionText = trimmedQuestion;

  // 3. Resolve model — default to gemini-flash
  const requestedModelId = (model && typeof model === "string") ? model : "mistral-free";
  let activeModel: Model;
  let activeInfo: ModelInfo;
  let fallbackUsed = false;
  let responseStatus: "ok" | "stub_fallback" | "stub_demo" = "ok";
  // Day 6 — populated when the stub returns its __stub payload. The UI
  // banner uses these to tell the user "this is a city-specific demo
  // placeholder" and to render the city + country.
  let stubMeta: StubPayload | null = null;

  // Day 5 hotfix — track every model id we attempted so the user sees
  // exactly what was tried in the response.
  // We use an array proxy that mirrors pushes to the module-level
  // partialAttemptedChain so the outer POST can read the chain
  // when constructing the partial_timeout stub. This avoids
  // threading the chain through 7 different code paths.
  const attemptedChain: string[] = [];
  // Override Array.push so every local push also updates the
  // module-level var. We do this by reassigning .push (it works
  // because we don't need to call it before or after, just
  // through this local ref).
  // Actually we can't safely override the prototype; instead, use
  // a helper:
  const pushAttempted = (id: string) => {
    attemptedChain.push(id);
    partialAttemptedChain.push(id);
  };

  // Day 5 hotfix — if the user picks the curated stub explicitly, we skip
  // the entire chain (it's already a stub).
  const requestedIsStub = requestedModelId === "curated-stub";

  try {
    activeModel = getModel(requestedModelId);
    activeInfo = activeModel.info;
    if (!activeModel.isAvailable()) {
      // Day 27 hotfix: don't jump straight to curated-stub when primary
      // isn't available. Try the next available model in the chain first.
      pushAttempted(requestedModelId);
      const nextAvailable = ALL_MODELS.find(
        (m) => m.info.id !== requestedModelId && m.isAvailable(),
      );
      if (nextAvailable) {
        activeModel = nextAvailable;
        activeInfo = nextAvailable.info;
        fallbackUsed = true;
        responseStatus = "ok";
      } else {
        activeModel = curatedStub;
        activeInfo = curatedStub.info;
        fallbackUsed = true;
        responseStatus = "stub_fallback";
      }
    }
  } catch {
    // Unknown model id — fall back to curated stub
    console.warn(`[/api/ask] unknown model ${requestedModelId}, falling back to curated-stub`);
    pushAttempted(requestedModelId);
    activeModel = curatedStub;
    activeInfo = curatedStub.info;
    fallbackUsed = true;
    responseStatus = "stub_fallback";
  }

  // Day 5 hotfix — if primary is the stub, don't bother cascading.
  if (!requestedIsStub && activeInfo.id !== "curated-stub") {
    pushAttempted(activeInfo.id);
  }

  // 4. Step A — call the model (with 35s budget). If this throws or
  // times out, the outer POST returns 200 + partial_timeout. The model
  // fallback chain (primary → 1 best fallback → curated-stub) is capped
  // at MAX_FALLBACK_ATTEMPTS and each model.call() is itself wrapped
  // in a 25s per-model timeout via callModel() below.
  let rankedSites: RankedSite[] = [];
  let raw: string | undefined;
  let modelError: string | undefined;
  // Day 12 v16: research-grade fields returned by Gemini Search
  // (and any future model that uses web grounding). These are
  // attached to responseBody below and the result page renders
  // them as a prose answer + citation list. Most models omit
  // these; the result page just hides the section if absent.
  let modelAnswer: string | undefined;
  let modelSources: Array<{ title?: string; url: string }> | undefined;

  // Helper — keep the model-call try-block small and readable.
  // Day 5 hotfix v2: every model.call() is wrapped in a 25s per-model
  // timeout so a single hanging model can't burn the whole handler
  // budget.
  //
  // Day 5 hotfix v3: model.call() now returns a union type
  //   { ok: true, ranked_sites, raw } | { ok: false, error }
  // so we never have to rely on throwing for control flow. This helper
  // normalises that into either { ok: true, sites, raw } or { ok: false,
  // error } for the fallback chain.
  const callModel = async (
    m: Model,
  ): Promise<
    | {
        ok: true;
        sites: RankedSite[];
        raw?: string;
        __stub?: StubPayload;
        // Day 12 v16: research answer + citations from Gemini Search.
        // Optional — most models omit these.
        answer?: string;
        sources?: Array<{ title?: string; url: string }>;
      }
    | { ok: false; error: string }
  > => {
    let result;
    const modelTimeoutMs = getModelTimeoutMs(m.info.id);
    try {
      result = await withTimeout(
        m.call({
          vertical: effectiveVertical,
          question: trimmedQuestion,
        }),
        modelTimeoutMs,
        "model:" + m.info.id,
      );
    } catch (timeoutErr) {
      const msg = timeoutErr instanceof Error ? timeoutErr.message : String(timeoutErr);
      return { ok: false, error: `model:${m.info.id} ${msg}` };
    }
    // Defensive: model.call() should never return null/undefined.
    if (!result || typeof result !== "object") {
      return { ok: false, error: `model:${m.info.id} returned non-object` };
    }
    const r = result as any;
    if (r.ok === false && typeof r.error === "string") {
      return { ok: false, error: `model:${m.info.id} ${r.error}` };
    }
    if (r.ok === true && Array.isArray(r.ranked_sites)) {
      return {
        ok: true,
        sites: r.ranked_sites,
        raw: r.raw,
        __stub: r.__stub,
        // v16: pass research answer + sources from Gemini Search
        // through to the result page so it can render citations
        // and a prose summary.
        answer: r.answer,
        sources: r.sources,
      };
    }
    // Day 22 v25 fix: if a model returned ok:false explicitly AND
    // also included a ranked_sites array (which my gemini-search.ts
    // fix now does — ok:false with ranked_sites:[]), do NOT let the
    // legacy Array.isArray check below silently convert it back to
    // ok:true. That conversion was the #1 cause of "all models fail
    // but cascade never falls back" — callModel was eating the
    // ok:false flag and re-reporting success with zero sites.
    //
    // We detect this by checking whether r.ok is EXPLICITLY false.
    // If it's not explicitly true OR false, fall through to the
    // legacy shape check below.
    if (r.ok === undefined && Array.isArray(r.ranked_sites)) {
      return { ok: true, sites: r.ranked_sites, raw: r.raw };
    }
    return { ok: false, error: `model:${m.info.id} returned malformed response` };
  };

  try {
    await withTimeout((async () => {
      // LCP-66: try OpenRouter directly first. Bypasses the model abstraction
      // layer. If it works in <5s, use the result. If not, fall through.
      const orKey = process.env.OPENROUTER_API_KEY;
      if (orKey && !("_skip_or" in (req as any))) {
        try {
          const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${orKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "qwen/qwen3-next-80b-a3b-instruct",
              messages: [{
                role: "user",
                content: `List 5 real suburbs in or near ${ trimmedQuestion }. Return as JSON array: [{"name":"suburb name","lat":-26,"lng":28,"why":"one sentence"}]`,
              }],
              max_tokens: 500,
            }),
          });
          if (orRes.ok) {
            const data = await orRes.json() as any;
            const text = data?.choices?.[0]?.message?.content;
            if (text) {
              const parsed = JSON.parse(text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim());
              if (Array.isArray(parsed) && parsed.length > 0) {
                rankedSites = parsed.map((s: any, i: number) => ({
                  rank: i + 1,
                  name: String(s.name ?? ''),
                  score: 0.7,
                  confidence: 0.8,
                  rationale: String(s.why ?? ''),
                  lat: Number(s.lat) || 0,
                  lng: Number(s.lng) || 0,
                }));
                activeInfo = { id: 'mistral-free', displayName: 'Mistral (OpenRouter)', shortName: 'Mistral', provider: 'openrouter', free: true, description: '', brandColor: '#7C3AED', logoPath: '' };
                responseStatus = 'ok';
                pushAttempted('mistral-free');
                return;
              }
            }
          }
        } catch { /* fall through to model chain */ }
      }

      try {
        const result = await callModel(activeModel);
        if (result.ok && result.sites.length > 0) {
          // Day 21 v2: enrich AI-returned sites with REAL_SITE_CATALOG
          // property data (corner stand, facing, price range, etc).
          // The catalog has 25 SA sites with hand-curated data; the
          // AI returns site names from its general knowledge. Matching
          // by name/suburb bridges the two so the user always sees
          // the property data on the result card.
          rankedSites = enrichSitesWithCatalog(result.sites);
          raw = result.raw;
          // Day 12 v16: capture research answer + citations from
          // Gemini Search. Most models omit these.
          if (result.answer) modelAnswer = result.answer;
          if (result.sources && result.sources.length > 0) modelSources = result.sources;
          // Day 6 — the stub tags its result with __stub. We capture it
          // so the response can surface status:"stub_demo" + city +
          // country + stubReason. Real models never set __stub.
          if (result.__stub) {
            stubMeta = result.__stub;
            responseStatus = "stub_demo";
          }
          return;
        }
        // Day 22 v25 fix: a model returning ok:true with 0 sites is
        // not actually success — the user will see an empty result
        // page. Treat 0-site responses as a fallback trigger too.
        // This is a defence-in-depth check on top of the callModel
        // ok:false fix; if any future model returns ranked_sites:[]
        // with ok:true, the cascade still fires.
        if (result.ok && result.sites.length === 0) {
          console.warn(
            `[/api/ask] model ${activeInfo.id} returned 0 sites with ok:true — falling through to fallback chain`,
          );
        }
        // Primary model returned { ok: false, error } OR returned 0
        // sites — no usable answer. Treat as failure and fall through.
        const primaryErrMsg = result.ok
          ? `${activeInfo.id} returned 0 sites`
          : (result.error ?? `${activeInfo.id} returned no result`);
        console.error(
          `[/api/ask] model ${activeInfo.id} call returned error, trying fallback chain (max ${MAX_FALLBACK_ATTEMPTS} attempts): ${primaryErrMsg}`,
        );

        const errorChain: string[] = [
          `${activeInfo.id} call failed: ${primaryErrMsg}`,
        ];

        // Build fallback chain: every model in the registry except the one
        // that just failed and except the curated-stub. Only live (isAvailable)
        // ones.
        //
        // Day 22 v24 fix: removed the `.slice(0, MAX_FALLBACK_ATTEMPTS - 2)`
        // cap. With MAX_FALLBACK_ATTEMPTS=3 that was leaving only 1 fallback
        // slot, which meant OpenRouter's llama-free and mistral-free rarely
        // got a chance to fire. The cap was tuned for the era when ALL
        // models timed out individually; with the current per-model
        // timeouts, longer chains are fine as long as each one returns
        // quickly (8s default per model). We still call curatedStub as
        // the last-resort path below.
        const fallbackChain = ALL_MODELS.filter(
          (m) =>
            m.info.id !== activeInfo.id &&
            m.info.id !== "curated-stub" &&
            m.isAvailable()
        );

        let cascaded = false;
        for (const fallback of fallbackChain) {
          pushAttempted(fallback.info.id);
          const fbResult = await callModel(fallback);
          if (fbResult.ok && fbResult.sites.length > 0) {
            // Day 21 v2: enrich with REAL_SITE_CATALOG property data.
            rankedSites = enrichSitesWithCatalog(fbResult.sites);
            raw = fbResult.raw;
            // v16: propagate research answer + citations from
            // any model that returned them.
            if (fbResult.answer) modelAnswer = fbResult.answer;
            if (fbResult.sources && fbResult.sources.length > 0) modelSources = fbResult.sources;
            activeInfo = fallback.info;
            activeModel = fallback;
            fallbackUsed = true;
            cascaded = true;
            if (fbResult.__stub) {
              stubMeta = fbResult.__stub;
              responseStatus = "stub_demo";
            }
            console.log(
              `[/api/ask] fallback chain served by ${fallback.info.id} after ${activeInfo.id} failed`
            );
            return;
          }
          // Day 22 v25: same site-count guard for fallbacks. If
          // OpenRouter returns ok:true with 0 sites, keep cascading.
          if (fbResult.ok && fbResult.sites.length === 0) {
            console.warn(
              `[/api/ask] fallback ${fallback.info.id} returned 0 sites with ok:true — continuing to next fallback`,
            );
          }
          errorChain.push(
            fbResult.ok
              ? `${fallback.info.id} returned 0 sites`
              : `${fallback.info.id} call failed: ${fbResult.error ?? "unknown error"}`,
          );
          console.error(
            `[/api/ask] fallback model ${fallback.info.id} also failed: ${fbResult.ok ? "0 sites" : (fbResult.error ?? "unknown error")}`,
          );
          // continue to next fallback — never throw
        }

        if (!cascaded) {
          // All fallbacks failed (or there were none available). Use curated
          // stub so the user never sees a 500. modelError captures every
          // failure in the chain so we can see why the stub fired.
          pushAttempted("curated-stub");
          // curatedStub.call() can never fail (it's a pure function), but
          // wrap defensively anyway.
          const stubResult = await callModel(curatedStub);
          if (stubResult.ok) {
            rankedSites = stubResult.sites;
            raw = stubResult.raw;
            // v16: stub doesn't produce research answer / sources.
            // If a fallback model did, those are already captured
            // above; we don't overwrite them here.
            // Day 6 — promote status to "stub_demo" and capture city
            // metadata. This is the path that fires when every real
            // model is unavailable (Gemini 500, OpenRouter rate limit).
            if (stubResult.__stub) {
              stubMeta = stubResult.__stub;
              responseStatus = "stub_demo";
            }
          } else {
            // Should never happen — stub is pure. Defensive fallback.
            console.error("[/api/ask] curated-stub failed (should never happen):", stubResult.error);
            rankedSites = [];
            raw = "stub_failed";
          }
          activeInfo = curatedStub.info;
          activeModel = curatedStub;
          fallbackUsed = true;
          if (responseStatus !== "stub_demo") {
            responseStatus = "stub_fallback";
          }
        }

        // Surface every error in the chain (newline-separated) for debugging.
        // If we successfully cascaded to another live model, the primary error
        // alone is enough — the user got a real answer, just not from their pick.
        modelError = cascaded
          ? errorChain[0]
          : errorChain.join("\n");
        // Mirror to the module-level var so the outer POST's
        // partial_timeout stub can include the full error chain.
        partialModelError = modelError;
      } catch (modelErr) {
        // Last-resort catch — should be impossible since callModel() never
        // throws and the loop never throws. But just in case.
        const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
        console.error(`[/api/ask] Step A inner threw unexpectedly:`, modelErr);
        // Force stub so we still return something.
        pushAttempted("curated-stub");
        const stubResult = await callModel(curatedStub);
        if (stubResult.ok) {
          rankedSites = stubResult.sites;
          raw = stubResult.raw;
          // v16: stub doesn't produce research answer / sources.
          if (stubResult.__stub) {
            stubMeta = stubResult.__stub;
            responseStatus = "stub_demo";
          }
        }
        activeInfo = curatedStub.info;
        activeModel = curatedStub;
        fallbackUsed = true;
        if (responseStatus !== "stub_demo") {
          responseStatus = "stub_fallback";
        }
        modelError = `unexpected_step_a_error: ${msg}`;
        partialModelError = modelError;
      }
    })(), STEP_A_TIMEOUT_MS, "step_a");
  } catch (stepAErr) {
    // Step A exhausted its 35s budget (or threw). Let the outer POST
    // catch it and return 200 + partial_timeout.
    throw stepAErr;
  }

  // Day 25 v26 — Defensive final guard.
  // The cascade above (e3ebda1 + the callModel ok:false fix) already
  // routes every failure to curatedStub. This is a last-resort safety
  // net: if for any reason rankedSites is still empty after the entire
  // cascade (e.g. curatedStub itself returned ok:true but with 0 sites,
  // or a future model has a bug), force-call curatedStub one more time.
  // curatedStub.call() is a pure function over REAL_SITE_CATALOG and
  // CANNOT return 0 sites when the catalog has entries for the city.
  // If it does, that's a real bug and we log it.
  if (rankedSites.length === 0) {
    console.warn(
      "[/api/ask] cascade exited with rankedSites.length === 0 — force-firing curatedStub as final guard",
    );
    pushAttempted("curated-stub-final-guard");
    const finalStubResult = await callModel(curatedStub);
    if (finalStubResult.ok && finalStubResult.sites.length > 0) {
      rankedSites = enrichSitesWithCatalog(finalStubResult.sites);
      if (finalStubResult.__stub) {
        stubMeta = finalStubResult.__stub;
        responseStatus = "stub_demo";
      }
      activeInfo = curatedStub.info;
      activeModel = curatedStub;
      fallbackUsed = true;
      modelError = `${modelError ?? "unknown"}\nfinal-guard-stub: curatedStub returned ${finalStubResult.sites.length} sites`;
    } else {
      // curatedStub itself failed — log and let the empty result
      // propagate. The UI will show "no sites found" instead of
      // empty cards, which is the honest answer.
      console.error(
        "[/api/ask] curatedStub final guard also failed (this should never happen)",
        finalStubResult,
      );
      modelError = `${modelError ?? "unknown"}\nfinal-guard-stub: curatedStub returned 0 sites — this is a bug`;
    }
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
  /** Day 22 — live listings fetched in parallel with signal connectors. */
  let allLiveListings: LiveListing[] = [];
  /** Day 22 — when Tavily fails for any reason; UI surfaces a non-fatal badge. */
  let liveListingsError: string | undefined;
  let placesError: string | undefined;
  let researchNotes: string | undefined;
  let researchError: string | undefined;
  let researchLiveUrl: string | undefined;

  try {
    await withTimeout((async () => {
      const location = deriveLocation(rankedSites);
      const builtPlan: Plan = buildPlan(effectiveVertical, location, rankedSites);

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
            vertical: effectiveVertical,
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
          effectiveVertical,
        );
        site.score = breakdown.confidence;
        site.signals = signals;
        site.scoreBreakdown = breakdown;
      }

      // LCP-64 — Google Places competitor search for each ranked site.
      // Fires in parallel after scoring. Each site gets a `competitors`
      // field with nearby businesses matching the vertical.
      try {
        const competitorResults = await Promise.allSettled(
          rankedSites.map((site) =>
            fetchNearbyCompetitors({
              lat: site.lat ?? location.lat,
              lng: site.lng ?? location.lng,
              vertical: effectiveVertical,
            }),
          ),
        );
        let anyOk = false;
        const errors: string[] = [];
        rankedSites.forEach((site, i) => {
          const r = competitorResults[i];
          if (r.status === "fulfilled") {
            if (r.value.ok && r.value.places.length > 0) {
              (site as any).competitors = r.value;
              anyOk = true;
            } else if (r.value.error) {
              errors.push(`${site.name}: ${r.value.error}`);
            }
          }
        });
        if (!anyOk && errors.length > 0) {
          placesError = errors.slice(0, 3).join(" | ");
        }
      } catch { /* non-fatal */ }

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

  // Day 22: fire Tavily live-listings search in parallel with Step B's
  // signal connectors. Same 12s budget cap. If Tavily fails or returns
  // nothing, the UI gets a non-fatal badge — never blocks the response.
  //
  // Suburb source priority:
  //   1. site.suburb (some models populate this)
  //   2. site.name — split on "," and take the first segment
  //      (e.g. "Sandton CBD, Johannesburg" → "Sandton CBD")
  //   3. detectCity(question).name — city-only fallback
  try {
    const location = deriveLocation(rankedSites);
    // deriveLocation returns {lat, lng, label} — not {name}. Use label.
    const cityName = location?.label ?? null;
    // Build per-site price/erf hints from enriched sites (so the query
    // matches what the developer asked for, not generic suburb terms).
    let hints = rankedSites
      .map((s) => {
        const explicitSuburb = ((s as any).suburb as string | undefined) ?? null;
        const nameField = (s.name ?? "").trim();
        // Extract suburb from name like "Constantia, Cape Town" → "Constantia"
        const nameSuburb =
          nameField.includes(",") ? nameField.split(",")[0].trim() : nameField || null;
        const suburb = explicitSuburb || nameSuburb || null;
        if (!suburb && !cityName) return null;
        const payload = ((s as any).payload ?? {}) as {
          priceBand?: string;
          plotSizeHectares?: number;
        };
        return {
          suburb,
          cityName: cityName || "",
          priceBand: payload.priceBand ?? null,
          plotSizeHectares: payload.plotSizeHectares ?? null,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .slice(0, 3);

    // Fallback for non-SA cities: if Gemini didn't return identifiable
    // suburbs, fire a single city-level Tavily search anyway.
    if (hints.length === 0 && cityName) {
      hints = [{
        suburb: null,
        cityName,
        priceBand: null,
        plotSizeHectares: null,
      }];
    }

    // Day 22 v12: run one search per hint (max 3) — gives Perplexity-
    // style depth (per-suburb). Use TAVILY_LISTINGS_TIMEOUT_MS (15s)
    // not STEP_B_TIMEOUT_MS (5s) — the listings pipeline takes 6-10s
    // minimum for 7 portal searches + extracts. creditBudget=14
    // covers all 7 portals.
    const perSuburbResults = await Promise.allSettled(
      hints.map((h) =>
        withTimeout(
          fetchLiveListings({
            city: { id: "", name: h.cityName, country: "" },
            suburb: h.suburb,
            vertical: effectiveVertical,
            priceBand: h.priceBand,
            plotSizeHectares: h.plotSizeHectares,
            creditBudget: 14,
            maxListings: 20,
          }),
          TAVILY_LISTINGS_TIMEOUT_MS,
          "tavily-listings",
        ).catch((err) => {
          // Surface error so we can see it in the response
          console.warn("[/api/ask] tavily-listings fetch error:", err);
          return [];
        }),
      ),
    );

    for (const r of perSuburbResults) {
      if (r.status === "fulfilled") {
        allLiveListings.push(...r.value);
      }
    }
    // Dedupe by URL (same listing can match multiple suburbs)
    const seen = new Set<string>();
    allLiveListings = allLiveListings.filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
  } catch (tavilyErr) {
    console.warn("[/api/ask] tavily-listings failed (non-fatal):", tavilyErr);
    liveListingsError = String(tavilyErr instanceof Error ? tavilyErr.message : tavilyErr);
  }

  // LCP-62 v4 — browser-use research sprint (synchronous, 8s max).
  // Creates a session, polls for up to 8 seconds, returns whatever
  // output the agent produced plus a liveUrl to watch the rest.
  try {
    const BU_KEY = process.env.BROWSER_USE_API_KEY;
    if (BU_KEY) {
      const task = [
        `Research property for a ${effectiveVertical.replace(/_/g, " ")}.`,
        `User asked: "${question}"`,
        "",
        "1. Search listing sites. Top 3: price, size, address, URL.",
        "2. Check zoning and regulations for the area mentioned.",
        "3. Google Maps: nearby businesses, roads, competition.",
        "Return plain text: LISTINGS, ZONING, ACCESS.",
      ].join("\n");

      const createRes = await fetch("https://api.browser-use.com/api/v3/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Browser-Use-API-Key": BU_KEY },
        body: JSON.stringify({ task, model: "gpt-5.4-mini" }),
      });
      if (createRes.ok) {
        const session = await createRes.json() as { id: string; live_url?: string };
        researchLiveUrl = session.live_url;
        // Poll for up to 8 seconds
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1500));
          const pollRes = await fetch(
            `https://api.browser-use.com/api/v3/sessions/${session.id}`,
            { headers: { "X-Browser-Use-API-Key": BU_KEY } },
          );
          if (!pollRes.ok) break;
          const state = await pollRes.json() as { status?: { value: string }; output?: string };
          const sv = state.status?.value;
          if (sv === "idle" || sv === "stopped") {
            if (state.output) researchNotes = state.output;
            break;
          }
          if (sv === "error" || sv === "timed_out") break;
        }
      } else {
        researchError = `browser-use session creation failed (${createRes.status})`;
      }
    } else {
      researchError = "BROWSER_USE_API_KEY not set in Vercel env";
    }
  } catch (researchErr) {
    researchError = String(researchErr instanceof Error ? researchErr.message : researchErr);
  }

  // Attach live listings to ranked sites.
  //
  // Day 22 v14: the strict suburb-name match (`listingSuburb === siteSuburb`)
  // was rejecting almost every listing because grid-page chunk
  // titles often have `suburb: null` (parser couldn't extract
  // suburb from grid-page chunks). Now we use a tier system:
  //   1. Strict suburb match (suburb field populated both sides)
  //   2. Suburb-from-name field on site (e.g. "Constantia, Cape Town")
  //   3. Fallback: first 3 listings go to first site (city-level)
  //
  // Net effect: even when parser can't extract suburb, listings
  // still appear on the result page so the Live listings section
  // is never empty when Tavily returned data.
  if (allLiveListings.length > 0) {
    const siteListingsMap = new Map<number, any[]>();
    let unassignedIndex = 0;
    for (const site of rankedSites) {
      const explicitSuburb = ((site as any).suburb ?? "").toString().toLowerCase().trim();
      const nameField = (site.name ?? "").toString().toLowerCase().trim();
      const nameSuburb = nameField.includes(",")
        ? nameField.split(",")[0].trim()
        : nameField;
      const siteSuburb = explicitSuburb || nameSuburb;
      const matched = allLiveListings.filter((l) => {
        const listingSuburb = (l.suburb ?? "").toString().toLowerCase().trim();
        // Tier 3: listing has no suburb, defer to fall-through
        if (!listingSuburb) return false;
        if (!siteSuburb) return false;
        // Tier 1: exact
        if (listingSuburb === siteSuburb) return true;
        // Tier 2: shared word of length > 3
        const sw: string[] = siteSuburb.split(/\s+/).filter((w: string) => w.length > 3);
        const lw: string[] = listingSuburb.split(/\s+/);
        return sw.some((w: string) => lw.includes(w));
      });
      siteListingsMap.set(site.rank, matched.slice(0, 3));
    }
    // Distribute remaining listings (suburb-less) round-robin to sites
    const suburblessListings = allLiveListings.filter(
      (l) => !(l.suburb ?? "").toString().trim(),
    );
    for (const listing of suburblessListings) {
      const targetRank = rankedSites[unassignedIndex % rankedSites.length]?.rank;
      if (targetRank !== undefined) {
        const existing = siteListingsMap.get(targetRank) ?? [];
        if (existing.length < 3) {
          siteListingsMap.set(targetRank, [...existing, listing]);
        }
      }
      unassignedIndex += 1;
    }
    // Apply map back to sites
    for (const site of rankedSites) {
      const matched = siteListingsMap.get(site.rank);
      if (matched && matched.length > 0) {
        (site as any).liveListings = matched.slice(0, 3);
      }
    }
  }

  // 6. Build response body (sans id; id comes from prisma row)
  //
  // Day 17 v6: add the intent classifier result so the UI can route
  // to the spatial (/result/[id]) or conversational (/chat/[id])
  // view. Both views share the same data; the classifier picks
  // the primary one. The result page always links to the chat
  // view (and vice versa) so users can switch.
  const intentResult = classifyIntent(trimmedQuestion);
  const responseBody: Omit<AskResponse, "id"> = {
    status: responseStatus,
    model: modelInfoToBlock(activeInfo, fallbackUsed, modelError, attemptedChain),
    vertical,
    question: trimmedQuestion,
    echo: raw ? `Answer generated by ${activeInfo.displayName}${fallbackUsed ? " (fallback)" : ""}.` : "ok",
    ranked_sites: rankedSites,
    plan,
    // Day 22 — live listings attached to each ranked site by suburb
    // match. Falls back to top-level array for chat view which shows
    // all listings regardless of site.
    liveListings: allLiveListings.length > 0 ? allLiveListings : undefined,
    liveListingsError: allLiveListings.length === 0 ? liveListingsError : undefined,
    placesError: placesError || undefined,
    researchNotes: researchNotes || undefined,
    researchLiveUrl: researchLiveUrl || undefined,
    researchError: researchError || undefined,
    connectorsRun,
    // Day 17 v6: routing + chat surface. primaryEngine tells the UI
    // which engine answered. matchedPatterns shows the user why we
    // classified the question that way. chatViewUrl is the URL for
    // the conversational view of this same query.
    primaryEngine: activeInfo.id,
    intent: intentResult.primary,
    intentScore: {
      spatial: intentResult.spatialScore,
      conversational: intentResult.conversationalScore,
    },
    matchedPatterns: {
      spatial: intentResult.matchedSpatialPatterns,
      conversational: intentResult.matchedConversationalPatterns,
    },
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

  // Day 6 — surface the city-aware stub metadata so the UI can show
  // a clear "AI overloaded, here's a city-specific demo placeholder"
  // banner. The map and sidebar still render the ranked_sites as
  // normal — this is purely informational metadata on top.
  if (stubMeta) {
    const sm: StubPayload = stubMeta;
    responseBody.city = sm.city;
    responseBody.country = sm.country;
    responseBody.stubReason = sm.stubReason;
  }

  // Day 12 v16: attach research answer + citations to the
  // response body so the result page can render them. The
  // fields are omitted entirely when the active model
  // didn't produce them (most models).
  if (modelAnswer) {
    responseBody.answer = modelAnswer;
  }
  if (modelSources && modelSources.length > 0) {
    responseBody.sources = modelSources;
  }

  // 7. Persist to Supabase via Prisma (best-effort).
  //
  // Day 5 hotfix v3 — persistence is NOT in the critical response path.
  // If Prisma rejects the row (e.g. Json codec rejects an undefined value,
  // NaN, or a non-serialisable field), we log the error, generate a
  // fallback id locally, and STILL return 200 with the answer. The user
  // gets their result, we get a log line, and the dashboard will just
  // not show this question (acceptable — it's persisted best-effort).
  //
  // responseJson is run through sanitizeForJson() to strip undefined keys
  // and replace NaN/Infinity with null before handing to Prisma.
  let questionId: string;
  try {
    const safeResponse = sanitizeForJson(responseBody);
    const questionRow = await prisma.question.create({
      data: {
        userId,
        vertical,
        questionText: trimmedQuestion,
        responseJson: safeResponse as any,
      },
    });
    questionId = questionRow.id;
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    console.error(
      `[/api/ask] failed to persist question (returning answer anyway):`,
      dbErr,
    );
    // Synthetic id so the response shape stays consistent. Marked so the
    // dashboard knows this row wasn't actually persisted.
    questionId = `no_persist_${Date.now().toString(36)}`;
    // Surface the persist error in headers so Chris can see it in DevTools.
    responseBody.connectorsError = responseBody.connectorsError ?? "persist_failed";
    // We log the message too so the diagnostic trail isn't lost.
    console.error(`[/api/ask] persist message: ${msg}`);
  }

  // 8. Return response + id
  const response: AskResponse = {
    id: questionId,
    ...responseBody,
  };
  const finalResponse = NextResponse.json(response);
  // Diagnostic header — Chris can see real wall-clock time in DevTools.
  finalResponse.headers.set("x-atlas-elapsed-ms", String(Date.now() - t0));
  return finalResponse;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  // Reset partial-timeout data so the module-level vars don't
  // leak state across requests on the same worker.
  partialAttemptedChain = [];
  partialModelError = null;
  partialVertical = "";
  partialQuestionText = "";
  partialUserId = "";
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
    // Day 12 hotfix: any of our timeout labels should return
    // the partial_timeout stub, not a 500. The previous code
    // only matched "api_ask_timeout" which is the OUTER timeout
    // label. Inner timeouts ("step_a_timeout", "step_b_timeout",
    // "model:gemini-flash_timeout") were falling through to the
    // 500 else branch even though they're exactly the
    // "we ran out of time" case the partial stub is designed
    // for. Now we match any "*_timeout" suffix.
    if (msg.endsWith("_timeout") || msg === "api_ask_timeout") {
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
    //
    // Day 12 hotfix: include the actual chain of models we
    // attempted (mirrored to module-level vars by the inner
    // Step A handler) so the UI can tell the user what to do
    // next ("try again" vs "switch to curated-stub").
    //
    // Day 12 hotfix v2: ALSO persist a Question row so the
    // /result/[id] page renders the timeout state in a real
    // route. Without this the page sees no `id` and shows
    // "Atlas returned no result id. Please try again." which is
    // wrong — the partial response IS a result, just with
    // empty ranked_sites.
    const actualElapsed = Date.now() - t0;
    const partialResult = {
      status: "partial_timeout" as const,
      error: "Request timed out. Try again or pick curated-stub for instant response.",
      elapsedMs: actualElapsed,
      timeoutMs: HANDLER_TIMEOUT_MS,
      vertical: partialVertical,
      questionText: partialQuestionText,
      ranked_sites: [],
      model: {
        id: "timeout",
        displayName: "Timed out",
        provider: "stub" as const,
        free: true,
        description: "Request exceeded the time budget before any model could respond.",
        fallbackUsed: true,
        attemptedChain: partialAttemptedChain,
      },
      modelError: partialModelError || "No model produced a response within the time budget",
      connectorsRun: [],
    };
    let questionId: string | null = null;
    try {
      const safeResponse = sanitizeForJson(partialResult);
      const questionRow = await prisma.question.create({
        data: {
          userId: partialUserId,
          vertical: partialVertical,
          questionText: partialQuestionText,
          responseJson: safeResponse as any,
        },
      });
      questionId = questionRow.id;
    } catch (persistErr) {
      // Persistence is best-effort. If Prisma rejects we still
      // return 200 with the partial data so the UI has something
      // to show. The page will degrade to the home screen.
      console.error(`[/api/ask] partial_timeout persist failed:`, persistErr);
    }
    const res = questionId
      ? NextResponse.json({ ok: true, id: questionId, ...partialResult })
      : NextResponse.json({ ok: true, ...partialResult });
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
