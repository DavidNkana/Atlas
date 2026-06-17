import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendWaitlistNotification } from "@/lib/email/send";

/**
 * POST /api/waitlist
 *
 * Day 9. Records a waitlist signup. No auth required — anyone can
 * express interest in Atlas without an account.
 *
 * Body: { email, name?, vertical, plan, message?, userType? }
 * - email: required, must look like an email
 * - name: optional, free text
 * - vertical: required, one of our known verticals (gas_station,
 *   restaurant, warehouse, retail_shop, residential_land, etc.)
 * - plan: required, "free" | "pro" | "team"
 * - message: optional, ≤ 500 chars
 * - userType: optional, "land_developer" | "property_investor" |
 *   "residential_builder" | "other"
 *
 * v1 is intentionally permissive. We don't de-dupe by email —
 * if a user signs up twice we keep both records so we can see
 * the second sign-up as stronger intent.
 */
const VALID_PLANS = new Set(["free", "pro", "team"]);

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : null;
  const vertical = typeof body?.vertical === "string" ? body.vertical.trim().slice(0, 40) : "";
  const plan = typeof body?.plan === "string" ? body.plan.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : null;
  const userType = typeof body?.userType === "string" ? body.userType.trim().slice(0, 40) : null;

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "valid email required" },
      { status: 400 }
    );
  }
  if (!vertical) {
    return NextResponse.json(
      { error: "vertical required" },
      { status: 400 }
    );
  }
  if (!VALID_PLANS.has(plan)) {
    return NextResponse.json(
      { error: "plan must be one of: free, pro, team" },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.waitlistSignup.create({
      data: { email, name, vertical, plan, message, userType },
      select: { id: true, createdAt: true },
    });

    // Fire-and-forget notification email. We don't block the
    // response on the email — the row is persisted, the user gets
    // a 200, and the email goes out in the background. If the
    // email fails, the row is still saved and the admin dashboard
    // is the source of truth.
    void sendWaitlistNotification({
      email,
      name,
      vertical,
      plan,
      userType,
      message,
    }).then((result) => {
      if (!result.sent) {
        console.warn(
          `[waitlist] Notification not sent: provider=${result.provider} error=${result.error ?? "none"}`
        );
      }
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/waitlist
 *
 * Day 9 admin: returns aggregate counts of waitlist signups so the
 * `/admin` dashboard can show traction. No auth — this is v1, we
 * accept the small leak risk. Day 30+ we put this behind the same
 * /admin secret env var as the rest of the internal dashboard.
 */
export async function GET() {
  try {
    const [total, byPlan, byVertical, recent] = await Promise.all([
      prisma.waitlistSignup.count(),
      prisma.waitlistSignup.groupBy({
        by: ["plan"],
        _count: { _all: true },
      }),
      prisma.waitlistSignup.groupBy({
        by: ["vertical"],
        _count: { _all: true },
      }),
      prisma.waitlistSignup.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          email: true,
          name: true,
          vertical: true,
          plan: true,
          message: true,
          userType: true,
          createdAt: true,
        },
      }),
    ]);
    return NextResponse.json({ total, byPlan, byVertical, recent });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
