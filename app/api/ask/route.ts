import { NextRequest, NextResponse } from "next/server";

/**
 * Day 1 stub. Returns a hardcoded ranked_sites array.
 *
 * The point of Day 1 is to prove the route handler works end-to-end:
 *   browser → POST /api/ask → route handler → JSON response → browser <pre>
 *
 * Day 3: this handler will call the MiniMax planner.
 * Day 5: the planner will call the connector registry, which will call real
 *        connectors, which will return real Signals, which the scoring engine
 *        will rank.
 *
 * For now: hardcoded. The shape of the response is the contract.
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

  // Day 1 stub response. The shape is the contract.
  const response: AskResponse = {
    status: "stub",
    vertical,
    question: question.trim(),
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

  return NextResponse.json(response);
}

// Day 1: GET on /api/ask returns a small liveness check.
export async function GET() {
  return NextResponse.json({
    status: "stub",
    message: "Atlas /api/ask is alive. POST a { vertical, question } body.",
    supported_verticals: Array.from(SUPPORTED_VERTICALS),
  });
}
