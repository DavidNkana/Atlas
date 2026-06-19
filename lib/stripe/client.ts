import Stripe from "stripe";

/**
 * Day 13 — Stripe client.
 *
 * Single source of truth for Stripe API access. /api/stripe/checkout
 * and /api/stripe/webhook both use this. isStripeConfigured() is
 * a check the rest of the app uses to dim the "Subscribe" button
 * when no key is set.
 *
 * Env: STRIPE_SECRET_KEY (sk_test_... or sk_live_...).
 * Optional: STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_TEAM_MONTHLY,
 *           STRIPE_WEBHOOK_SECRET.
 *
 * Setup steps in .env.example. The price IDs are obtained from
 * the Stripe dashboard (Products → create a recurring product
 * with monthly billing in ZAR → copy the price ID).
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // apiVersion pinned to the latest stable. Bump when Stripe ships
  // a new API version with breaking changes — we test before bumping.
  cached = new Stripe(key, {
    apiVersion: "2024-12-18.acacia" as any,
    typescript: true,
  });
  return cached;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export type BillingPlan = "pro" | "team";

/**
 * Resolved at module load. If the env var isn't set, the price
 * id is undefined and /api/stripe/checkout returns 503 with a
 * "set up Stripe" message rather than crashing.
 */
export const STRIPE_PRICES: Record<BillingPlan, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO_MONTHLY,
  team: process.env.STRIPE_PRICE_TEAM_MONTHLY,
};
