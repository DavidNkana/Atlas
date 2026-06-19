import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendAtlasEmail } from "@/lib/email/send";

/**
 * Day 13 — POST /api/demo-request
 *
 * Replaces the "Get a demo" mailto: link on /demo with a real
 * inline form. The form posts here, we persist the row to
 * Supabase and email davidnkana74@gmail.com with the details.
 *
 * Body: { name, email, company, role?, message? }
 * - name: required, free text
 * - email: required, must look like an email
 * - company: required, free text
 * - role: optional, "land_developer" | "property_investor" | "residential_builder" | "other"
 * - message: optional, ≤ 1000 chars
 *
 * Like /api/waitlist, we don't block the response on the email
 * — the row is the source of truth, the email is a convenience.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

const VALID_ROLES = new Set([
  "land_developer",
  "property_investor",
  "residential_builder",
  "other",
]);

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 120) : "";
  const company = typeof body?.company === "string" ? body.company.trim().slice(0, 80) : "";
  const role = typeof body?.role === "string" ? body.role.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : null;
  // Optional question context — what did the user ask before requesting
  // a demo? Surfaces in the email so David can prep for the call.
  const questionContext = typeof body?.questionContext === "string" ? body.questionContext.trim().slice(0, 500) : null;

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "valid email required" },
      { status: 400 },
    );
  }
  if (!company) {
    return NextResponse.json(
      { error: "company required" },
      { status: 400 },
    );
  }
  if (role && !VALID_ROLES.has(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${Array.from(VALID_ROLES).join(", ")}` },
      { status: 400 },
    );
  }

  try {
    // Day 13: we reuse the WaitlistSignup table because it has
    // the right shape (email + name + vertical + plan + message
    // + userType). For demo requests, we set:
    //   plan = "demo"
    //   vertical = role (or "other")
    //   userType = "demo_request"
    //   message = <their message> + optional questionContext
    const composedMessage = [
      questionContext ? `Question: ${questionContext}` : null,
      message,
    ]
      .filter(Boolean)
      .join("\n\n") || null;

    const row = await prisma.waitlistSignup.create({
      data: {
        email,
        name: `${name}${company ? ` (${company})` : ""}`.slice(0, 80),
        vertical: role || "other",
        plan: "demo",
        userType: "demo_request",
        message: composedMessage,
      },
      select: { id: true, createdAt: true },
    });

    // Fire-and-forget email. Reply-To is the requester's email so
    // David can hit Reply in Gmail and reach them directly.
    void sendAtlasEmail({
      kind: "demo",
      fromEmail: email,
      fromName: name,
      fields: {
        name,
        email,
        company,
        role: role || "other",
      },
      message: composedMessage,
    }).then((result) => {
      if (!result.sent) {
        console.warn(
          `[demo-request] Notification not sent: provider=${result.provider} error=${result.error ?? "none"}`,
        );
      }
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
