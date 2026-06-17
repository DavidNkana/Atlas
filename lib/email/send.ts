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
 * console.log — the waitlist row is still persisted to the database
 * (that's the source of truth for the admin dashboard). The email
 * notification is a convenience, not a hard dependency.
 *
 * The "from" address is onboarding@resend.dev which is Resend's
 * shared test sender. David will need to verify a domain in the
 * Resend dashboard to use a custom from-address; until then,
 * onboarding@resend.dev works for any recipient.
 */

const NOTIFY_TO = "davidnkana74@gmail.com";
const FROM = "Atlas Waitlist <onboarding@resend.dev>";

interface WaitlistEmailInput {
  email: string;
  name: string | null;
  vertical: string;
  plan: string;
  userType: string | null;
  message: string | null;
}

function buildHtml(input: WaitlistEmailInput): string {
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px 0; color: #6366f1;">New Atlas waitlist signup</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 12px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Email</td>
          <td style="padding: 6px 12px; color: #18181b; font-weight: 500;">${escapeHtml(input.email)}</td>
        </tr>
        <tr style="background: #fafafa;">
          <td style="padding: 6px 12px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Name</td>
          <td style="padding: 6px 12px; color: #18181b;">${escapeHtml(input.name ?? "—")}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Vertical</td>
          <td style="padding: 6px 12px; color: #18181b;">${escapeHtml(input.vertical)}</td>
        </tr>
        <tr style="background: #fafafa;">
          <td style="padding: 6px 12px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Plan</td>
          <td style="padding: 6px 12px; color: #18181b; font-weight: 600;">${escapeHtml(input.plan)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">User type</td>
          <td style="padding: 6px 12px; color: #18181b;">${escapeHtml(input.userType ?? "—")}</td>
        </tr>
      </table>
      ${
        input.message
          ? `<div style="margin-top: 16px; padding: 12px; background: #fafafa; border-left: 3px solid #6366f1; border-radius: 4px;">
              <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Message</div>
              <div style="color: #18181b; line-height: 1.5;">${escapeHtml(input.message)}</div>
            </div>`
          : ""
      }
      <p style="margin-top: 24px; color: #a1a1aa; font-size: 11px;">
        Sent automatically by Atlas · /api/waitlist · ${new Date().toISOString()}
      </p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSubject(input: WaitlistEmailInput): string {
  return `Atlas waitlist: ${input.plan.toUpperCase()} — ${input.email}`;
}

export async function sendWaitlistNotification(
  input: WaitlistEmailInput
): Promise<{ sent: boolean; provider: "resend" | "console"; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const subject = buildSubject(input);
  const html = buildHtml(input);

  if (!apiKey) {
    // Graceful fallback: log the email content so a developer can
    // copy it out of server logs if needed. The waitlist row is
    // already persisted — admin dashboard is the source of truth.
    console.log(
      `[waitlist-email] RESEND_API_KEY not set — logging instead.\n` +
        `  To: ${NOTIFY_TO}\n` +
        `  From: ${FROM}\n` +
        `  Subject: ${subject}\n` +
        `  Body:\n${html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()}`
    );
    return { sent: false, provider: "console" };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [NOTIFY_TO],
      subject,
      html,
    });
    if (error) {
      console.error(`[waitlist-email] Resend error: ${error.message ?? JSON.stringify(error)}`);
      return { sent: false, provider: "resend", error: error.message };
    }
    return { sent: true, provider: "resend" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[waitlist-email] Resend threw: ${msg}`);
    return { sent: false, provider: "resend", error: msg };
  }
}
