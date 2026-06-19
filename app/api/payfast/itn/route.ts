import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyPayfastItn,
  isPayfastPaymentSuccessful,
  type PayfastPlan,
} from "@/lib/payfast/client";

/**
 * Day 15 — POST /api/payfast/itn (Instant Transaction Notification)
 *
 * PayFast calls this endpoint when a payment status changes. We
 * verify the signature, then update the User row's plan field.
 *
 * PayFast sends application/x-www-form-urlencoded POST data. We
 * parse it with URLSearchParams.
 *
 * Docs: https://developers.payfast.co.za/docs#itn
 *
 * We respond with 200 OK on success so PayFast stops retrying.
 * On signature failure we respond with 400 so PayFast retries.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const passphrase = process.env.PAYFAST_PASSPHRASE;
  if (!passphrase) {
    console.error("[payfast-itn] PAYFAST_PASSPHRASE not set — cannot verify ITN");
    return NextResponse.json(
      { error: "PAYPASS_PASSPHRASE not set" },
      { status: 500 },
    );
  }

  // PayFast sends application/x-www-form-urlencoded. Parse it.
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const formData: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    formData[k] = v;
  }

  // Verify signature. This is critical — without verification
  // anyone could POST to this endpoint and mark themselves as paid.
  if (!verifyPayfastItn(formData, passphrase)) {
    console.warn("[payfast-itn] Signature verification failed — rejecting");
    return NextResponse.json(
      { error: "signature verification failed" },
      { status: 400 },
    );
  }

  // Extract fields
  const paymentStatus = formData.payment_status;
  const pfPaymentId = formData.pf_payment_id; // PayFast's internal id
  const customStr1 = formData.custom_str1; // our userId
  const customStr2 = formData.custom_str2; // our plan
  const amountGross = formData.amount_gross; // e.g. "250.00"
  const mPaymentId = formData.m_payment_id; // our payment_id
  const token = formData.token; // PayFast subscription token for cancellations

  console.log(
    `[payfast-itn] status=${paymentStatus} userId=${customStr1} plan=${customStr2} pfPaymentId=${pfPaymentId} mPaymentId=${mPaymentId} amount=${amountGross}`,
  );

  // Only update User on COMPLETE
  if (!isPayfastPaymentSuccessful(paymentStatus)) {
    return NextResponse.json({
      received: true,
      action: "logged-only",
      reason: `payment_status=${paymentStatus} is not COMPLETE`,
    });
  }

  if (!customStr1 || !customStr2) {
    console.warn("[payfast-itn] missing custom_str1 (userId) or custom_str2 (plan)");
    return NextResponse.json(
      { error: "missing userId or plan" },
      { status: 400 },
    );
  }

  try {
    await prisma.user.upsert({
      where: { id: customStr1 },
      create: {
        id: customStr1,
        email: formData.email_address ?? `${customStr1}@unknown.atlas`,
        plan: customStr2 as PayfastPlan,
        payfastPaymentId: pfPaymentId ?? null,
        payfastToken: token ?? null,
        payfastMPaymentId: mPaymentId ?? null,
        planUpdatedAt: new Date(),
      },
      update: {
        plan: customStr2 as PayfastPlan,
        payfastPaymentId: pfPaymentId ?? null,
        payfastToken: token ?? null,
        payfastMPaymentId: mPaymentId ?? null,
        planUpdatedAt: new Date(),
      },
    });
    console.log(
      `[payfast-itn] user upgraded via PayFast: id=${customStr1} plan=${customStr2}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[payfast-itn] DB error: ${msg}`);
    // Still 200 so PayFast doesn't retry forever
    return NextResponse.json({ received: true, dbError: msg });
  }

  return NextResponse.json({ received: true });
}

/**
 * PayFast may also send a GET to test the endpoint. Just return 200.
 */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "payfast-itn" });
}
