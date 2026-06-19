import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { getStripe, STRIPE_PRICES, type BillingPlan } from "@/lib/stripe/client";

/**
 * Day 13 — POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for the requested plan
 * (pro | team) and returns the session URL. The browser
 * redirects the user to Stripe, Stripe collects payment, and
 * Stripe redirects the user to /api/stripe/return?session_id=...
 * with a status=success or status=cancelled query param.
 *
 * On the Stripe dashboard, set the success URL to:
 *   https://atlas-q2eh.vercel.app/api/stripe/return?status=success
 * and cancel URL to:
 *   https://atlas-q2eh.vercel.app/api/stripe/return?status=cancelled
 *
 * The webhook at /api/stripe/webhook listens for:
 *   - checkout.session.completed   — mark user as paid
 *   - customer.subscription.deleted — downgrade to free
 *   - customer.subscription.updated — update plan
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 * Without these, returns 503 with a clear "set up Stripe" message.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PLANS: BillingPlan[] = ["pro", "team"];

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        error:
          "Stripe is not configured. Add STRIPE_SECRET_KEY to Vercel env vars. See .env.example for setup steps.",
        notConfigured: true,
      },
      { status: 503 },
    );
  }

  // Auth: the user must be signed in to subscribe.
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
  if (!VALID_PLANS.includes(plan as BillingPlan)) {
    return NextResponse.json(
      { error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  const priceId = STRIPE_PRICES[plan as BillingPlan];
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          "Stripe price IDs not configured. Set STRIPE_PRICE_PRO_MONTHLY and STRIPE_PRICE_TEAM_MONTHLY in Vercel env.",
        notConfigured: true,
      },
      { status: 503 },
    );
  }

  const origin = req.nextUrl.origin;
  const successUrl = `${origin}/api/stripe/return?status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/api/stripe/return?status=cancelled`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      // The webhook uses client_reference_id to update the user.
      // We pass userId here. The user's email is added on Stripe's
      // checkout page (so they can change it if they want).
      client_reference_id: userId,
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Stripe error: ${msg}` }, { status: 500 });
  }
}
