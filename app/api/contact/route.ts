import { NextRequest, NextResponse } from "next/server";
import { sendAtlasEmail } from "@/lib/email/send";

/**
 * Day 13 — POST /api/contact
 *
 * Generic "Contact Atlas" form endpoint. Used by the footer
 * contact link on every page. Sends an email to
 * davidnkana74@gmail.com with the message. No DB persistence —
 * contact form messages are ephemeral. If the message is
 * important, the user gets a reply.
 *
 * Body: { name, email, subject?, message }
 * - name: required
 * - email: required
 * - subject: optional (default: "Atlas contact")
 * - message: required, ≤ 2000 chars
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 120) : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 120) : "Atlas contact";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "valid email required" },
      { status: 400 },
    );
  }
  if (!message) {
    return NextResponse.json(
      { error: "message required" },
      { status: 400 },
    );
  }
  if (message.length < 5) {
    return NextResponse.json(
      { error: "message too short (min 5 chars)" },
      { status: 400 },
    );
  }

  const result = await sendAtlasEmail({
    kind: "contact",
    fromEmail: email,
    fromName: name,
    fields: { subject, senderName: name },
    message: `From: ${name} <${email}>\n\n${message}`,
  });

  return NextResponse.json({
    ok: true,
    emailSent: result.sent,
    provider: result.provider,
  });
}
