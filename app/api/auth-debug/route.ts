import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/auth-debug
 *
 * Day 9 debug: returns the current Clerk auth state so the user can
 * verify whether their session cookie is being received by the API
 * route. Useful for diagnosing 401s on /api/ask.
 *
 * Returns:
 *   - userId: from Clerk `auth()` (null if not signed in)
 *   - sessionClaims: from Clerk `auth()` (null if not signed in)
 *   - cookieCount: how many cookies the request carried (so we can
 *     see if the session cookie was sent at all)
 *   - cookies: list of cookie NAMES only (never values — for safety)
 *   - hasSessionCookie: true if any cookie name includes "session"
 *
 * The endpoint is intentionally permissive (no auth required to call
 * it) so it can be used to diagnose auth failures themselves. It
 * only returns whether the SESSION is valid, never any secrets.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let userId: string | null = null;
  let sessionClaims: any = null;
  try {
    const authResult = await auth();
    userId = authResult.userId;
    sessionClaims = authResult.sessionClaims;
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: "auth() threw",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const cookies = req.cookies.getAll();
  const cookieNames = cookies.map((c) => c.name);
  const hasSessionCookie = cookieNames.some(
    (n) => n.includes("session") || n.includes("__session") || n.startsWith("__client")
  );

  return NextResponse.json({
    ok: true,
    userId,
    isSignedIn: !!userId,
    sessionClaims: sessionClaims
      ? {
          // Strip anything sensitive. Just enough to know which
          // fields Clerk populated.
          hasSub: !!sessionClaims.sub,
          hasEmail: !!sessionClaims.email,
          keys: Object.keys(sessionClaims).slice(0, 20),
        }
      : null,
    cookieCount: cookies.length,
    cookies: cookieNames,
    hasSessionCookie,
    timestamp: new Date().toISOString(),
  });
}
