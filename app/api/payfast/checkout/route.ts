import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  buildPayfastCheckoutUrl,
  isPayfastConfigured,
  type PayfastPlan,
} from "@/lib/payfast/client";

/**
 * Day 15 — POST /api/payfast/checkout
 *
 * Creates a PayFast subscription checkout URL and returns it.
 * The browser redirects to PayFast's hosted checkout page where
 * the user pays (card / Instant EFT / SnapScan / etc). PayFast
 * then POSTs to /api/payfast/itn with the payment result.
 *
 * Auth: user must be signed in. PayFast charges the user's
 * card / EFT and creates a recurring monthly subscription.
 *
 * Env: PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE.
 * Without these, returns 503 with a clear "set up PayFast" message
 * and the client falls back to /waitlist.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PLANS: PayfastPlan[] = ["pro", "team"];

export async function POST(req: NextRequest) {
  // Auth: user must be signed in.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to start a subscription" },
      { status: 401 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const plan = body?.plan as string;
  if (!VALID_PLANS.includes(plan as PayfastPlan)) {
    return NextResponse.json(
      { error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  if (!isPayfastConfigured()) {
    return NextResponse.json(
      {
        error:
          "PayFast is not configured. Add PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, and PAYFAST_PASSPHRASE to Vercel env vars. See .env.example for setup steps.",
        notConfigured: true,
      },
      { status: 503 },
    );
  }

  // We need the user's email for the PayFast checkout. Pull it
  // from the Clerk session.
  const { sessionClaims } = await auth();
  const userEmail =
    (sessionClaims?.email as string | undefined) ??
    (sessionClaims?.primaryEmail as string | undefined) ??
    `${userId}@unknown.atlas`;

  const url = buildPayfastCheckoutUrl({
    plan: plan as PayfastPlan,
    userId,
    userEmail,
    baseUrl: req.nextUrl.origin,
  });
  if (!url) {
    return NextResponse.json(
      { error: "Failed to build PayFast checkout URL (missing config)" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, url });
}
