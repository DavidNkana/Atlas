import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isVerifiedAdmin } from "@/lib/admin";

export const runtime = "nodejs";

function errorResponse(error: string, status: number, details?: string) {
  return NextResponse.json({ error, ...(details ? { details } : {}) }, { status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: callerId } = await auth();
  if (!callerId) return errorResponse("Authentication required", 401);
  if (!(await isVerifiedAdmin())) return errorResponse("Forbidden", 403);

  const { userId: targetUserId } = await params;
  if (!/^user_[A-Za-z0-9_-]{3,128}$/.test(targetUserId)) {
    return errorResponse("Invalid user ID", 400);
  }
  if (targetUserId === callerId) {
    return errorResponse("You cannot delete your own account", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      payfastPaymentId: true,
      payfastToken: true,
      payfastMPaymentId: true,
    },
  });
  if (!target) return errorResponse("Local user not found", 404);

  const hasBillingLink = Boolean(
    target.plan !== "free" ||
      target.stripeCustomerId ||
      target.stripeSubscriptionId ||
      target.payfastPaymentId ||
      target.payfastToken ||
      target.payfastMPaymentId,
  );
  if (hasBillingLink) {
    return errorResponse(
      "User has billing attached",
      409,
      "Cancel and verify the subscription before deleting this user.",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.plot.deleteMany({ where: { userId: targetUserId } });
      await tx.question.deleteMany({ where: { userId: targetUserId } });
      await tx.user.delete({ where: { id: targetUserId } });
    });
  } catch (error) {
    // A concurrent deletion is safe to report as already gone; other errors
    // must not be mistaken for a successful deletion.
    if ((error as { code?: string })?.code === "P2025") {
      return errorResponse("User was already deleted", 404);
    }
    console.error("[admin user deletion] local deletion failed", error);
    return errorResponse("Could not delete local user data", 500);
  }

  try {
    await (await clerkClient()).users.deleteUser(targetUserId);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json({
        ok: true,
        warning: "Local data was deleted; the Clerk user was already absent.",
      });
    }
    console.error("[admin user deletion] Clerk deletion failed", error);
    return errorResponse(
      "Local data was deleted, but the Clerk user could not be deleted",
      502,
      "Resolve the Clerk deletion separately before allowing this user to sign up again.",
    );
  }

  return NextResponse.json({ ok: true });
}
