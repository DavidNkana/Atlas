import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/**
 * Day 3 stub — now with Clerk auth and Supabase persistence.
 *
 * Flow:
 *   1. POST /api/ask
 *   2. auth() — if no userId, 401
 *   3. validate body — 400 on bad input
 *   4. write row to Question table via Prisma
 *   5. return { id, status, vertical, question, echo, ranked_sites }
 *
 * The response SHAPE is the contract — Day 60's scoring engine will still
 * honor it.
 *
 * Day 3 will replace the stub ranked_sites with a real MiniMax planner call.
 * Day 5 will replace it with a real connector output.
 */

type AskRequest = {
  vertical: string;
  question: string;
};

type RankedSite = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
};

type AskResponse = {
  id: string;
  status: string;
  vertical: string;
  question: string;
  echo: string;
  ranked_sites: RankedSite[];
};

const SUPPORTED_VERTICALS = new Set([
  "gas_station",
  "restaurant",
  "warehouse",
  "retail_shop",
]);

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

  const { vertical, question } = body;

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
  if (!SUPPORTED_VERTICALS.has(vertical)) {
    return NextResponse.json(
      {
        error: `Unsupported vertical: ${vertical}. Supported: ${Array.from(
          SUPPORTED_VERTICALS
        ).join(", ")}`,
      },
      { status: 400 }
    );
  }

  // 3. Build the Day-1-shaped response (contract preserved)
  const trimmedQuestion = question.trim();
  const responseBody: Omit<AskResponse, "id"> = {
    status: "stub",
    vertical,
    question: trimmedQuestion,
    echo:
      "This is the Day 1 stub. The deploy pipeline is alive. Day 3 will call MiniMax here. Day 5 will call the connector registry.",
    ranked_sites: [
      {
        rank: 1,
        name: "Stub site (Day 5 will be a real connector output)",
        score: 0,
        confidence: 0,
        rationale:
          "Stub. Day 5 wires the real connector and scoring engine. The shape of this object is the contract that Day 60 will still honor.",
      },
    ],
  };

  // 4. Persist to Supabase via Prisma (best-effort; surface errors to caller)
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

  // 5. Return response + id
  const response: AskResponse = {
    id: questionRow.id,
    ...responseBody,
  };
  return NextResponse.json(response);
}

// Liveness check.
export async function GET() {
  return NextResponse.json({
    status: "stub",
    message: "Atlas /api/ask is alive. POST a { vertical, question } body.",
    supported_verticals: Array.from(SUPPORTED_VERTICALS),
  });
}
