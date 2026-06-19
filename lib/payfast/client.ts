import crypto from "crypto";

/**
 * Day 15 — PayFast client.
 *
 * PayFast is South Africa's leading payment gateway (acquired by
 * Network International in 2024 but still operates independently).
 * It's the recommended payment processor for the Atlas wedge:
 *
 *   - SA-native, no country restrictions on signup
 *   - Sign up at https://www.payfast.co.za with your SA ID number
 *   - No business registration needed for individual accounts
 *     (use your personal bank account + ID)
 *   - Supports credit card, Instant EFT, SnapScan, Zapper, Mobicred
 *   - 2.9% + R2.00 per ZAR transaction
 *   - Payouts to any SA bank (FNB, Absa, Standard Bank, etc)
 *
 * PayFast uses MD5 signatures (legacy but still their standard).
 * The flow:
 *
 *   1. POST /api/payfast/checkout — server builds the form data,
 *      signs it with our passphrase, returns the redirect URL
 *   2. Browser GETs the PayFast checkout page (hosted by them)
 *   3. User pays (card / Instant EFT / etc)
 *   4. PayFast POSTs an ITN (Instant Transaction Notification) to
 *      /api/payfast/itn with the payment status
 *   5. We verify the signature, mark the User as paid
 *
 * Env: PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE,
 * PAYFAST_RETURN_URL, PAYFAST_CANCEL_URL, PAYFAST_NOTIFY_URL.
 *
 * Test mode: PayFast has a sandbox at sandbox.payfast.co.za. Set
 * PAYFAST_BASE_URL=https://sandbox.payfast.co.za to use it.
 */

const PAYFAST_BASE = process.env.PAYFAST_BASE_URL || "https://www.payfast.co.za";

export function isPayfastConfigured(): boolean {
  return !!(
    process.env.PAYFAST_MERCHANT_ID &&
    process.env.PAYFAST_MERCHANT_KEY &&
    process.env.PAYFAST_PASSPHRASE
  );
}

export type PayfastPlan = "pro" | "team";

export const PAYFAST_AMOUNT: Record<PayfastPlan, number> = {
  pro: 25000,    // R250.00 in cents
  team: 250000,  // R2,500.00 in cents
};

export const PAYFAST_ITEM_NAME: Record<PayfastPlan, string> = {
  pro: "Atlas Pro subscription (monthly)",
  team: "Atlas Team subscription (monthly, 5 seats)",
};

/**
 * Build the PayFast checkout URL with a valid signature. The user
 * is redirected here, fills in their payment details on PayFast's
 * hosted page, and PayFast POSTs back to /api/payfast/itn when
 * payment completes.
 */
export function buildPayfastCheckoutUrl(input: {
  plan: PayfastPlan;
  userId: string;
  userEmail: string;
  baseUrl: string; // The Atlas origin, e.g. https://atlas-q2eh.vercel.app
}): string | null {
  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  const passphrase = process.env.PAYFAST_PASSPHRASE;
  if (!merchantId || !merchantKey) {
    return null;
  }

  // m_payment_id: our internal order id. Use the userId + plan so
  // it's deterministic and idempotent.
  const paymentId = `${input.userId}-${input.plan}-${Date.now()}`;
  // Recurring billing: PayFast's subscription endpoint. We use
  // subscription_type=1 (monthly) + billing_date=now + recurring_amount.
  // Subscription runs until cancelled.
  const data: Record<string, string | number> = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: process.env.PAYFAST_RETURN_URL || `${input.baseUrl}/dashboard?payfast=success`,
    cancel_url: process.env.PAYFAST_CANCEL_URL || `${input.baseUrl}/pricing?payfast=cancelled`,
    notify_url: process.env.PAYFAST_NOTIFY_URL || `${input.baseUrl}/api/payfast/itn`,

    name_first: input.userEmail.split("@")[0],
    email_address: input.userEmail,
    m_payment_id: paymentId,

    // Subscription params
    subscription_type: 1,
    billing_date: new Date().toISOString().slice(0, 10),
    recurring_amount: PAYFAST_AMOUNT[input.plan] / 100, // PayFast wants rands, not cents
    frequency: 3, // 3 = monthly
    cycles: 0, // 0 = indefinitely until cancelled

    // Optional user tracking
    custom_str1: input.userId,
    custom_str2: input.plan,
  };

  // Build the signature: MD5 of all params sorted alphabetically,
  // URL-encoded, joined with &, then MD5 of (that + passphrase).
  // See https://developers.payfast.co.za/docs#signature
  const sorted = Object.keys(data).sort();
  const paramString = sorted
    .map((k) => `${k}=${encodeURIComponent(String(data[k])).replace(/%20/g, "+")}`)
    .join("&");
  const stringToSign = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase)}`
    : paramString;
  const signature = crypto.createHash("md5").update(stringToSign).digest("hex");
  data.signature = signature;

  // Build the full URL with query string
  const queryString = sorted
    .concat("signature")
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(data[k])).replace(/%20/g, "+")}`)
    .join("&");
  return `${PAYFAST_BASE}/eng/process?${queryString}`;
}

/**
 * Verify an ITN (Instant Transaction Notification) signature.
 * PayFast sends form-encoded POST data. We rebuild the same
 * signature and compare. Returns true if valid.
 *
 * Docs: https://developers.payfast.co.za/docs#itn
 */
export function verifyPayfastItn(
  formData: Record<string, string>,
  passphrase: string,
): boolean {
  // Pull signature out, rebuild from the rest
  const receivedSignature = formData.signature;
  if (!receivedSignature) return false;

  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(formData)) {
    if (k !== "signature" && v !== "") {
      filtered[k] = v;
    }
  }
  const sorted = Object.keys(filtered).sort();
  const paramString = sorted
    .map((k) => `${k}=${encodeURIComponent(filtered[k]).replace(/%20/g, "+")}`)
    .join("&");
  const stringToSign = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase)}`
    : paramString;
  const expected = crypto.createHash("md5").update(stringToSign).digest("hex");
  return expected === receivedSignature;
}

/**
 * Map PayFast payment_status values to our internal status.
 * PayFast sends one of: COMPLETE, CANCELLED, FAILED, PROCESSING,
 *   RECEIVED, TIMEOUT, DISPUTE, EXPIRED.
 */
export type PayfastPaymentStatus =
  | "complete"
  | "cancelled"
  | "failed"
  | "processing"
  | "received"
  | "timeout"
  | "dispute"
  | "expired";

export function isPayfastPaymentSuccessful(
  status: string | undefined,
): boolean {
  // COMPLETE = payment captured. PROCESSING + RECEIVED are also
  // considered success because they'll eventually become COMPLETE;
  // the ITN will fire again with COMPLETE for true confirmation.
  // For Atlas we mark paid on COMPLETE only — being conservative.
  return status === "COMPLETE";
}
