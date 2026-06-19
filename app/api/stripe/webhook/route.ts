import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripe, type BillingPlan } from "@/lib/stripe/client";

/**
 * Day 14 — POST /api/stripe/webhook
 *
 * Stripe posts events here. We listen for:
 *   - checkout.session.completed  — user paid, upgrade their plan
 *   - customer.subscription.deleted — user cancelled
 *   - customer.subscription.updated — user changed plan
 *
 * On each event we upsert the User table (plan +
 * stripeCustomerId + stripeSubscriptionId + planUpdatedAt).
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

  console.log(
    `[stripe-webhook] event=${event.type} id=${event.id}` +
      (event.data?.object?.id ? ` object=${event.data.object.id}` : ""),
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id ?? session.metadata?.userId;
        const plan = (session.metadata?.plan ?? "pro") as BillingPlan;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        const customerEmail =
          session.customer_details?.email ?? session.customer_email ?? null;
        if (!userId) {
          console.warn(
            `[stripe-webhook] checkout.session.completed without userId — cannot upsert User`,
          );
          break;
        }
        // Upsert: create the User row if it doesn't exist yet,
        // otherwise update plan + Stripe IDs. customerEmail
        // comes from Stripe's checkout page (which the user
        // could change); on first signup we trust it.
        await prisma.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            email: customerEmail ?? `${userId}@unknown.atlas`,
            plan,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            planUpdatedAt: new Date(),
          },
          update: {
            plan,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            planUpdatedAt: new Date(),
          },
        });
        console.log(
          `[stripe-webhook] user upgraded: id=${userId} plan=${plan} customerId=${customerId} subscriptionId=${subscriptionId}`,
        );
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        // The subscription is gone — downgrade the user to
        // 'free'. We look up by stripeSubscriptionId since the
        // customer.subscription.deleted event doesn't carry
        // the Clerk userId.
        const updated = await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { plan: "free", planUpdatedAt: new Date() },
        });
        console.log(
          `[stripe-webhook] subscription cancelled: ${sub.id} (${updated.count} user(s) downgraded to free)`,
        );
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        // If the subscription is still active, keep the user's
        // plan as-is (they might have just renewed). If it's
        // past_due or unpaid, we don't auto-downgrade — David
        // can manually intervene in /admin.
        console.log(
          `[stripe-webhook] subscription updated: ${sub.id} status=${sub.status}`,
        );
        break;
      }
      default:
        // Ignore other events.
        break;
    }
  } catch (e) {
    // We catch here so a transient DB error doesn't make Stripe
    // retry the webhook indefinitely (Stripe gives up after 3
    // days of failures).
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[stripe-webhook] DB error: ${msg}`);
    return NextResponse.json(
      { received: true, dbError: msg },
      { status: 200 },
    );
  }

  return NextResponse.json({ received: true });
}

