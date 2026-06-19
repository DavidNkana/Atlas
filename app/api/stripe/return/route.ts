import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";

/**
 * Day 13 — GET /api/stripe/return
 *
 * User returns from Stripe Checkout. We look up the session
 * and either:
 *   - status=success: verify the session is paid and redirect
 *     to the dashboard with a "welcome to Pro/Team" message.
 *   - status=cancelled: redirect to /pricing with a friendly
 *     "no charge made" message.
 *
 * The actual subscription state is updated via the webhook at
 * /api/stripe/webhook which Stripe calls async. So the user
 * might see Pro unlocked immediately (if Stripe fired the
 * webhook already) or within a few seconds.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (status === "cancelled") {
    return NextResponse.redirect(new URL("/pricing?stripe=cancelled", req.url));
  }

  if (status === "success" && sessionId) {
    // Verify the session is paid. We don't trust the URL param
    // alone — anyone can hit /api/stripe/return?status=success
    // and claim a free upgrade.
    const stripe = getStripe();
    if (stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid" || session.status === "complete") {
          return NextResponse.redirect(
            new URL(`/dashboard?stripe=success&plan=${session.metadata?.plan ?? "pro"}`, req.url),
          );
        }
      } catch {
        // Fall through to the dashboard with an indeterminate status.
      }
    }
    return NextResponse.redirect(
      new URL("/dashboard?stripe=pending", req.url),
    );
  }

  return NextResponse.redirect(new URL("/pricing", req.url));
}
