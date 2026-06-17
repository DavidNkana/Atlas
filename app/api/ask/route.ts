import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { getModel, MODEL_INFO, ALL_MODELS } from "@/lib/models/registry";
import type { Model } from "@/lib/models/types";
import { curatedStub } from "@/lib/models/stub";
import type { Vertical, ModelInfo } from "@/lib/models/types";

/**
 * Day 3 — model registry wired in.
 *
 * Flow:
 *   1. POST /api/ask
 *   2. auth() — if no userId, 401
 *   3. validate body — 400 on bad input
 *   4. call getModel(modelId).call(...) — falls back to curatedStub on error
 *   5. write row to Question table via Prisma (best-effort; response includes model info)
 *   6. return { id, status, model: { id, displayName, provider, free, fallbackUsed }, vertical, question, echo, ranked_sites }
 *
 * The response SHAPE is the contract — Day 60's scoring engine will still
 * honor it.
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
};

type ModelBlock = {
  id: string;
  displayName: string;
  provider: string;
  free: boolean;
  fallbackUsed: boolean;
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
};

const SUPPORTED_VERTICALS = new Set<Vertical>([
  "gas_station",
  "restaurant",
  "warehouse",
  "retail_shop",
]);

function modelInfoToBlock(info: ModelInfo, fallbackUsed: boolean, modelError?: string): ModelBlock {
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
  return block;
}

export async function POST(req: NextRequest) {
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
      { status: 400 }
    );
  }

  const { vertical, question, model } = body;

  if (!vertical || typeof vertical !== "string") {
    return NextResponse.json(
      { error: "Missing 'vertical' field" },
      { status: 400 }
    );
  }
  if (!question || typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { error: "Missing 'question' field" },
      { status: 400 }
    );
  }
  if (!SUPPORTED_VERTICALS.has(vertical as Vertical)) {
    return NextResponse.json(
      {
        error: `Unsupported vertical: ${vertical}. Supported: ${Array.from(
          SUPPORTED_VERTICALS
        ).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const trimmedQuestion = question.trim();

  // 3. Resolve model — default to gemini-flash
  const requestedModelId = (model && typeof model === "string") ? model : "gemini-flash";
  let activeModel: Model;
  let activeInfo: ModelInfo;
  let fallbackUsed = false;
  let responseStatus: "ok" | "stub_fallback" = "ok";

  try {
    activeModel = getModel(requestedModelId);
    activeInfo = activeModel.info;
    if (!activeModel.isAvailable()) {
      // Requested model has no key set — fall back to curated stub
      console.warn(`[/api/ask] model ${requestedModelId} not available, falling back to curated-stub`);
      activeModel = curatedStub;
      activeInfo = curatedStub.info;
      fallbackUsed = true;
      responseStatus = "stub_fallback";
    }
  } catch {
    // Unknown model id — fall back to curated stub
    console.warn(`[/api/ask] unknown model ${requestedModelId}, falling back to curated-stub`);
    activeModel = curatedStub;
    activeInfo = curatedStub.info;
    fallbackUsed = true;
    responseStatus = "stub_fallback";
  }

  // 4. Call the model
  let rankedSites: RankedSite[] = [];
  let raw: string | undefined;
  let modelError: string | undefined;
  try {
    const result = await activeModel.call({
      vertical: vertical as Vertical,
      question: trimmedQuestion,
    });
    rankedSites = result.ranked_sites;
    raw = result.raw;
  } catch (modelErr) {
    // Primary model failed. Day 3 fix 3: try EVERY other live model in the
    // registry (excluding the one that just failed and excluding the curated
    // stub) before giving up to the stub. This way if the user picks
    // gemini-flash and Gemini's quota is 0, we still try the OpenRouter
    // models instead of going straight to the curated stub.
    const primaryErrMsg =
      modelErr instanceof Error ? modelErr.message : String(modelErr);
    console.error(
      `[/api/ask] model ${activeInfo.id} call failed, trying fallback chain:`,
      modelErr
    );

    const errorChain: string[] = [
      `${activeInfo.id} call failed: ${primaryErrMsg}`,
    ];

    // Build fallback chain: every model in the registry except the one that
    // just failed and except the curated-stub. Only live (isAvailable) ones.
    const fallbackChain = ALL_MODELS.filter(
      (m) =>
        m.info.id !== activeInfo.id &&
        m.info.id !== "curated-stub" &&
        m.isAvailable()
    );

    let cascaded = false;
    for (const fallback of fallbackChain) {
      try {
        const fallbackResult = await fallback.call({
          vertical: vertical as Vertical,
          question: trimmedQuestion,
        });
        rankedSites = fallbackResult.ranked_sites;
        raw = fallbackResult.raw;
        activeInfo = fallback.info;
        activeModel = fallback;
        fallbackUsed = true;
        cascaded = true;
        console.log(
          `[/api/ask] fallback chain served by ${fallback.info.id} after ${activeInfo.id} failed`
        );
        break;
      } catch (fallbackErr) {
        const fbMsg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        errorChain.push(`${fallback.info.id} call failed: ${fbMsg}`);
        console.error(
          `[/api/ask] fallback model ${fallback.info.id} also failed:`,
          fallbackErr
        );
        continue;
      }
    }

    if (!cascaded) {
      // All fallbacks failed (or there were none available). Use curated stub
      // so the user never sees a 500. modelError captures every failure in
      // the chain so we can see why the stub fired.
      const stubResult = await curatedStub.call({
        vertical: vertical as Vertical,
        question: trimmedQuestion,
      });
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

  // 5. Build response body (sans id; id comes from prisma row)
  const responseBody: Omit<AskResponse, "id"> = {
    status: responseStatus,
    model: modelInfoToBlock(activeInfo, fallbackUsed, modelError),
    vertical,
    question: trimmedQuestion,
    echo: raw ? `Answer generated by ${activeInfo.displayName}${fallbackUsed ? " (fallback)" : ""}.` : "ok",
    ranked_sites: rankedSites,
  };

  // 6. Persist to Supabase via Prisma (best-effort; surface errors to caller)
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

  // 7. Return response + id
  const response: AskResponse = {
    id: questionRow.id,
    ...responseBody,
  };
  return NextResponse.json(response);
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