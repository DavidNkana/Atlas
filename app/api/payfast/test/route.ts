import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  buildPayfastCheckoutUrl,
  isPayfastConfigured,
  type PayfastPlan,
} from "@/lib/payfast/client";

/**
 * Day 15 v2 — GET /api/payfast/test
 *
 * Diagnostic endpoint for verifying PayFast integration end-to-end
 * WITHOUT making a real payment. Three things it returns:
 *
 *   1. isConfigured — whether PAYFAST_MERCHANT_ID, _KEY, _PASSPHRASE
 *      are set in env (Vercel deployment context)
 *   2. checkoutUrlPreview — for the given plan, what the redirect
 *      URL would be. Useful to copy/paste into a browser to test
 *      the PayFast hosted checkout page without signing in.
 *   3. merchantInfo — safe non-secret merchant info (prefix only)
 *      plus the base URL (sandbox vs production)
 *
 * Auth: requires sign-in. This is so David can verify the wiring
 * himself, but random visitors can't probe for which environment
 * is configured.
 *
 * Usage from terminal:
 *   curl -sS https://atlas-q2eh.vercel.app/api/payfast/test | jq
 *   curl -sS https://atlas-q2eh.vercel.app/api/payfast/test?plan=team | jq
 *
 * Usage from browser:
 *   https://atlas-q2eh.vercel.app/api/payfast/test  (default plan=pro)
 *
 * If PayFast is in sandbox mode (PAYFAST_BASE_URL includes "sandbox"),
 * the preview URL will go to sandbox.payfast.co.za where you can use
 * sandbox test cards (no real money moves).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to run PayFast diagnostics" },
      { status: 401 },
    );
  }

  const planParam = req.nextUrl.searchParams.get("plan") ?? "pro";
  if (planParam !== "pro" && planParam !== "team") {
    return NextResponse.json(
      { error: `plan must be 'pro' or 'team' (got ${planParam})` },
      { status: 400 },
    );
  }
  const plan = planParam as PayfastPlan;

  const configured = isPayfastConfigured();
  const merchantIdPrefix = process.env.PAYFAST_MERCHANT_ID?.slice(0, 4) ?? null;
  const baseUrl = process.env.PAYFAST_BASE_URL ?? "https://www.payfast.co.za";
  const isSandbox = baseUrl.includes("sandbox");

  // Try to build a preview URL. We need a fake userId + email.
  // If not configured, this returns null and we just skip the preview.
  let checkoutUrlPreview: string | null = null;
  let buildError: string | null = null;
  if (configured) {
    try {
      checkoutUrlPreview = buildPayfastCheckoutUrl({
        plan,
        userId: `test-${userId.slice(-6)}`,
        userEmail: `${userId.slice(-8)}@test.atlas`,
        baseUrl: req.nextUrl.origin,
      });
    } catch (e) {
      buildError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    configured,
    isSandbox,
    baseUrl,
    merchantIdPrefix,
    envPresent: {
      PAYFAST_MERCHANT_ID: !!process.env.PAYFAST_MERCHANT_ID,
      PAYFAST_MERCHANT_KEY: !!process.env.PAYFAST_MERCHANT_KEY,
      PAYFAST_PASSPHRASE: !!process.env.PAYFAST_PASSPHRASE,
      PAYFAST_BASE_URL: !!process.env.PAYFAST_BASE_URL,
    },
    plan,
    checkoutUrlPreview,
    buildError,
    instructions: configured
      ? isSandbox
        ? "PayFast is in SANDBOX mode. The preview URL goes to sandbox.payfast.co.za. Use the sandbox test card 4000000000000002 with any future expiry + any CVV to simulate a payment. The ITN will fire to /api/payfast/itn with payment_status=COMPLETE."
        : "PayFast is in LIVE mode. The preview URL goes to www.payfast.co.za. DO NOT test with real cards — use the sandbox merchant credentials (10000100 / 46f0cd694581a / q1Uz2sB6) and set PAYFAST_BASE_URL=https://sandbox.payfast.co.za to switch to sandbox."
      : "PayFast is NOT configured. To finish setup:\n  1. Sign up at https://www.payfast.co.za (use SA ID number + SA bank account)\n  2. Wait 1-2 business days for PayFast to verify your bank\n  3. Dashboard → Settings → Integration → copy Merchant ID, Merchant Key, generate Passphrase\n  4. Set the ITN URL: https://atlas-q2eh.vercel.app/api/payfast/itn\n  5. Add the 3 env vars to all 3 Vercel environments (Production, Preview, Development)\n  6. For sandbox testing FIRST, use merchant 10000100 / 46f0cd694581a / q1Uz2sB6\n     and set PAYFAST_BASE_URL=https://sandbox.payfast.co.za\n  7. Trigger a redeploy so the new env vars reach the runtime\n  8. Re-hit this endpoint — isConfigured should be true",
  });
}
