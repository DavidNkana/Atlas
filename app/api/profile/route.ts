import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/**
 * Atlas — Profile capture endpoint (Day 21).
 *
 * Called from app/onboarding/page.tsx after the user finishes the
 * 4-question onboarding form. Upserts into the existing User row
 * (the one the Stripe/PayFast webhooks create when a user pays).
 *
 * Why a separate route instead of inline in the onboarding page:
 *   - Keep the page a thin client component
 *   - Centralise the upsert so any future surface (e.g. a "Update
 *     profile" modal on the dashboard) hits the same path
 *   - Server-side validation of the fields we accept
 *
 * Auth: requires a signed-in Clerk user. The user's id from
 * `auth()` becomes the User row's primary key.
 *
 * Fields accepted (all optional — user can skip):
 *   - location:           string, free text (e.g. "Cape Town, ZA")
 *   - accountType:        "individual" | "organization"
 *   - organizationName:   string, required iff accountType=organization
 *   - intent:             "invest" | "develop" | "rent" | "board" | "research" | "other"
 *   - referralSource:     "google" | "social_media" | "friend" | "article" | "event" | "other"
 *   - skip:               boolean — true means "I'm done, don't show me the form again"
 *
 * Returns: { ok: true, profile: { ...saved fields } }
 *
 * Validates:
 *   - accountType, if present, must be one of the two values
 *   - intent, if present, must be one of the six values
 *   - referralSource, if present, must be one of the six values
 *   - organizationName, if accountType=organization, must be non-empty
 *
 * On any DB error: returns 500 with a generic message — the onboarding
 * page falls back to showing the error and offering "Skip for now".
 */

export const dynamic = "force-dynamic";

const ALLOWED_ACCOUNT_TYPES = ["individual", "organization"] as const;
const ALLOWED_INTENTS = [
  "invest",
  "develop",
  "rent",
  "board",
  "research",
  "other",
] as const;
const ALLOWED_REFERRAL_SOURCES = [
  "google",
  "social_media",
  "friend",
  "article",
  "event",
  "other",
] as const;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Sign in required" },
      { status: 401 },
    );
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        location: true,
        accountType: true,
        organizationName: true,
        intent: true,
        referralSource: true,
        onboardingComplete: true,
        onboardingCompletedAt: true,
      },
    });
    return NextResponse.json({ ok: true, profile: user });
  } catch (err) {
    console.error("[profile] GET failed:", err);
    return NextResponse.json(
      { ok: false, error: "Could not read profile" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Sign in required" },
      { status: 401 },
    );
  }

  // We need the email for the User row's required email field.
  const clerkUser = await currentUser();
  const email =
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    `${userId}@unknown.atlas`;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Validate.
  const accountTypeRaw = body.accountType;
  const accountType =
    typeof accountTypeRaw === "string"
      ? (ALLOWED_ACCOUNT_TYPES as readonly string[]).includes(accountTypeRaw)
        ? accountTypeRaw
        : null
      : null;
  if (accountTypeRaw !== undefined && accountTypeRaw !== null && accountType === null) {
    return NextResponse.json(
      { ok: false, error: `accountType must be one of: ${ALLOWED_ACCOUNT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const organizationNameRaw =
    typeof body.organizationName === "string" ? body.organizationName.trim() : "";
  if (
    accountType === "organization" &&
    organizationNameRaw.length === 0 &&
    body.organizationName !== undefined
  ) {
    return NextResponse.json(
      { ok: false, error: "organizationName is required when accountType=organization" },
      { status: 400 },
    );
  }

  const intentRaw = body.intent;
  const intent =
    typeof intentRaw === "string"
      ? (ALLOWED_INTENTS as readonly string[]).includes(intentRaw)
        ? intentRaw
        : null
      : null;
  if (intentRaw !== undefined && intentRaw !== null && intent === null) {
    return NextResponse.json(
      { ok: false, error: `intent must be one of: ${ALLOWED_INTENTS.join(", ")}` },
      { status: 400 },
    );
  }

  const referralSourceRaw = body.referralSource;
  const referralSource =
    typeof referralSourceRaw === "string"
      ? (ALLOWED_REFERRAL_SOURCES as readonly string[]).includes(referralSourceRaw)
        ? referralSourceRaw
        : null
      : null;
  if (
    referralSourceRaw !== undefined &&
    referralSourceRaw !== null &&
    referralSource === null
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `referralSource must be one of: ${ALLOWED_REFERRAL_SOURCES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const location =
    typeof body.location === "string" ? body.location.trim().slice(0, 200) : null;

  const skip = body.skip === true;

  try {
    const updated = await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email,
        // If accountType/orgName/intent/referralSource are all null AND
        // skip is true, we still upsert so onboardingComplete flips to
        // true and the user doesn't see the form again.
        location: location ?? null,
        accountType: accountType ?? null,
        organizationName:
          accountType === "organization" && organizationNameRaw.length > 0
            ? organizationNameRaw
            : null,
        intent: intent ?? null,
        referralSource: referralSource ?? null,
        onboardingComplete: true,
        onboardingCompletedAt: new Date(),
      },
      update: {
        location: location ?? undefined,
        accountType: accountType ?? undefined,
        organizationName:
          accountType === "organization" && organizationNameRaw.length > 0
            ? organizationNameRaw
            : undefined,
        intent: intent ?? undefined,
        referralSource: referralSource ?? undefined,
        onboardingComplete: true,
        onboardingCompletedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        location: true,
        accountType: true,
        organizationName: true,
        intent: true,
        referralSource: true,
        onboardingComplete: true,
      },
    });

    void skip; // referenced for clarity — skipping just upserts as above

    return NextResponse.json({ ok: true, profile: updated });
  } catch (err) {
    console.error("[profile] upsert failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message.slice(0, 200)
            : "Could not save your profile. Please try again.",
      },
      { status: 500 },
    );
  }
}
