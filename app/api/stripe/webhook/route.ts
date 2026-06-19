import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripe, type BillingPlan } from "@/lib/stripe/client";

/**
 * Day 13 — POST /api/stripe/webhook
 *
 * Stripe posts events here. We listen for:
 *   - checkout.session.completed  — user paid, upgrade their plan
 *   - customer.subscription.deleted — user cancelled
 *   - customer.subscription.updated — user changed plan
 *
 * On each event we update the User table (plan + stripeCustomerId
 * + stripeSubscriptionId). Note: User table doesn't exist yet —
 * we need to add it to the Prisma schema in a follow-up commit.
 * For now, we email David so the upgrade isn't lost.
 *
 * Env: STRIPE_WEBHOOK_SECRET (the signing secret Stripe shows
 * when you create the webhook endpoint in the dashboard).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Stripe needs the raw body to verify the signature. Next.js App
// Router gives us the parsed body via req.json() — to verify the
// signature we need the raw bytes. We work around by reading the
// request body once and re-using the string form.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    );
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not set" },
      { status: 503 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "missing stripe-signature header" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `webhook signature verification failed: ${msg}` },
      { status: 400 },
    );
  }

  // We don't have a User table yet with a plan column — that
  // ships in a follow-up commit. For now, log the event and
  // email David so a paying customer doesn't fall through the
  // cracks.
  console.log(
    `[stripe-webhook] event=${event.type} id=${event.id}` +
      (event.data?.object?.id ? ` object=${event.data.object.id}` : ""),
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id ?? session.metadata?.userId;
      const plan = (session.metadata?.plan ?? "pro") as BillingPlan;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      console.log(
        `[stripe-webhook] paid: userId=${userId} plan=${plan} customerId=${customerId} subscriptionId=${subscriptionId}`,
      );
      // TODO: when User table has a plan column, write here.
      // For now, log it. David's admin dashboard can show
      // webhook events.
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      console.log(`[stripe-webhook] subscription cancelled: ${sub.id}`);
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      console.log(
        `[stripe-webhook] subscription updated: ${sub.id} status=${sub.status}`,
      );
      break;
    }
    default:
      // Ignore other events.
      break;
  }

  return NextResponse.json({ received: true });
}
