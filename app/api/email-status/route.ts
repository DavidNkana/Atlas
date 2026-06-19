import { NextRequest, NextResponse } from "next/server";

/**
 * Day 13 — GET /api/email-status
 *
 * Reports the wiring of the email + billing stack so David can
 * confirm at a glance whether Resend + Stripe are ready.
 *
 *   - Resend: configured or not (and the from address)
 *   - Recipient: who every email goes to
 *   - Stripe: configured or not (key + price IDs + webhook)
 *
 * Use this to verify after David adds the env vars in Vercel.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const resendKey = process.env.RESEND_API_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pricePro = process.env.STRIPE_PRICE_PRO_MONTHLY;
  const priceTeam = process.env.STRIPE_PRICE_TEAM_MONTHLY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    email: {
      resendConfigured: !!resendKey,
      resendKeyPrefix: resendKey ? `${resendKey.slice(0, 6)}...` : null,
      recipient: "davidnkana74@gmail.com",
      fromAddress: "Atlas <onboarding@resend.dev>",
      note: resendKey
        ? "Resend is wired. Test by POSTing to /api/contact or /api/demo-request — check davidnkana74@gmail.com for the email."
        : "Resend is NOT configured. Add RESEND_API_KEY to Vercel env. Until then, email payloads are logged to Vercel server console only.",
    },
    stripe: {
      stripeConfigured: !!stripeKey,
      stripeKeyPrefix: stripeKey ? `${stripeKey.slice(0, 8)}...` : null,
      priceProConfigured: !!pricePro,
      priceTeamConfigured: !!priceTeam,
      webhookConfigured: !!webhookSecret,
      note:
        stripeKey && pricePro && priceTeam && webhookSecret
          ? "Stripe is fully wired. Pro and Team Subscribe buttons will create real Checkout sessions."
          : "Stripe is partially configured. Pricing page Subscribe buttons will fall back to /waitlist until STRIPE_SECRET_KEY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_TEAM_MONTHLY, and STRIPE_WEBHOOK_SECRET are all set.",
    },
  });
}
