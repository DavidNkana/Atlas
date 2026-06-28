import { Resend } from "resend";

/**
 * Atlas — Email sender.
 *
 * Day 9 polish. Sends a notification email when a waitlist signup
 * comes in. We use Resend (https://resend.com) because:
 *   - 3,000 free emails/month, no credit card required.
 *   - Simple API, no SMTP config.
 *   - One env var: RESEND_API_KEY.
 *
 * If RESEND_API_KEY is missing or the call fails, we fall back to
 * console.log — the underlying row is still persisted to the
 * database (that's the source of truth for the admin dashboard).
 * The email notification is a convenience, not a hard dependency.
 *
 * Day 13: consolidated to a single sendAtlasEmail() entry point that
 * handles every kind of email Atlas sends (waitlist, demo request,
 * contact). All emails go to NOTIFY_TO = davidnkana74@gmail.com so
 * David sees every inbound in one inbox.
 *
 * The "from" address is onboarding@resend.dev which is Resend's
 * shared test sender. David will need to verify a domain in the
 * Resend dashboard to use a custom from-address; until then,
 * onboarding@resend.dev works for any recipient.
 */

// Day 13: every email Atlas sends goes to David's personal inbox.
// One inbox, zero chance of missing a lead.
const NOTIFY_TO = "davidnkana74@gmail.com";
const FROM = "Atlas <onboarding@resend.dev>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * One unified shape for every email Atlas sends. Each kind fills
 * the fields it needs and leaves the rest blank.
 */
export interface AtlasEmail {
  /** Short label, used in the subject line and the email body header. */
  kind: "waitlist" | "demo" | "contact" | "stripe" | "test";
  /** Email of the person who triggered this notification. */
  fromEmail: string;
  /** Optional name. */
  fromName?: string | null;
  /** Free-form key/value bag — each kind reads the keys it needs. */
  fields: Record<string, string | number | boolean | null | undefined>;
  /** Optional free-text message from the user. */
  message?: string | null;
}

function buildSubject(e: AtlasEmail): string {
  switch (e.kind) {
    case "waitlist":
      return `Atlas waitlist: ${String(e.fields.plan ?? "").toUpperCase() || "?"} — ${e.fromEmail}`;
    case "demo":
      return `Atlas demo request — ${e.fromName ?? e.fromEmail}`;
    case "contact":
      return `Atlas contact: ${e.fields.subject ?? e.fromEmail}`;
    case "stripe":
      return `Atlas Stripe event: ${String(e.fields.event ?? "unknown")} — ${e.fromEmail || "anon"}`;
    case "test":
      return `Atlas test email — ${new Date().toISOString()}`;
  }
}

function buildHtml(e: AtlasEmail): string {
  const fieldsHtml = Object.entries(e.fields)
    .filter(([_, v]) => v !== null && v !== undefined && v !== "")
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding: 6px 12px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(k)}</td>
          <td style="padding: 6px 12px; color: #18181b;">${escapeHtml(String(v))}</td>
        </tr>`,
    )
    .join("");
  const messageHtml = e.message
    ? `<div style="margin-top: 16px; padding: 12px; background: #fafafa; border-left: 3px solid #6366f1; border-radius: 4px;">
         <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Message</div>
         <div style="color: #18181b; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(e.message)}</div>
       </div>`
    : "";
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px 0; color: #6366f1;">Atlas · ${escapeHtml(e.kind)}</h2>
      <p style="margin: 0 0 16px 0; color: #18181b;">
        <strong>${escapeHtml(e.fromName ?? e.fromEmail)}</strong>
        &lt;<a href="mailto:${escapeHtml(e.fromEmail)}" style="color: #6366f1;">${escapeHtml(e.fromEmail)}</a>&gt;
      </p>
      <table style="width: 100%; border-collapse: collapse; background: #fafafa; border-radius: 6px; overflow: hidden;">
        ${fieldsHtml || '<tr><td style="padding: 12px; color: #71717a;">No additional fields</td></tr>'}
      </table>
      ${messageHtml}
      <p style="margin-top: 24px; color: #a1a1aa; font-size: 11px;">
        Sent automatically by Atlas · kind=${escapeHtml(e.kind)} · ${new Date().toISOString()}
      </p>
    </div>
  `;
}

export interface SendResult {
  sent: boolean;
  provider: "resend" | "console";
  error?: string;
}

/**
 * Single email-sending function. Used by every Atlas route that
 * needs to email David. Sends to davidnkana74@gmail.com with the
 * Atlas from-address. Falls back to console.log if RESEND_API_KEY
 * is missing or the Resend call fails.
 */
export async function sendAtlasEmail(e: AtlasEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const subject = buildSubject(e);
  const html = buildHtml(e);

  if (!apiKey) {
    console.log(
      `[atlas-email] RESEND_API_KEY not set — logging instead.\n` +
        `  To: ${NOTIFY_TO}\n` +
        `  From: ${FROM}\n` +
        `  Subject: ${subject}\n` +
        `  Body: ${html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()}`,
    );
    return { sent: false, provider: "console" };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [NOTIFY_TO],
      replyTo: e.fromEmail,
      subject,
      html,
    });
    if (error) {
      console.error(
        `[atlas-email] Resend error: ${error.message ?? JSON.stringify(error)}`,
      );
      return { sent: false, provider: "resend", error: error.message };
    }
    return { sent: true, provider: "resend" };
  } catch (e2) {
    const msg = e2 instanceof Error ? e2.message : String(e2);
    console.error(`[atlas-email] Resend threw: ${msg}`);
    return { sent: false, provider: "resend", error: msg };
  }
}

/**
 * Backwards-compatible wrapper. Existing call sites use
 * sendWaitlistNotification. The day-13 refactor keeps the old
 * name as a thin shim around sendAtlasEmail so we don't have to
 * touch /api/waitlist in the same commit.
 */
export async function sendWaitlistNotification(input: {
  email: string;
  name: string | null;
  vertical: string;
  plan: string;
  userType: string | null;
  message: string | null;
}): Promise<SendResult> {
  return sendAtlasEmail({
    kind: "waitlist",
    fromEmail: input.email,
    fromName: input.name,
    fields: {
      vertical: input.vertical,
      plan: input.plan,
      userType: input.userType,
    },
    message: input.message,
  });
}
