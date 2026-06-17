import { NextResponse, type NextRequest } from "next/server";
import { auth, getAuth } from "@clerk/nextjs/server";

/**
 * GET /api/auth-debug
 *
 * Day 9 debug: returns the current Clerk auth state so the user can
 * verify whether their session cookie is being received by the API
 * route. Useful for diagnosing 401s on /api/ask.
 *
 * Returns:
 *   - userId: from Clerk `getAuth(req)` and `auth()` side by side
 *   - sessionClaims: from Clerk (null if not signed in)
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
  const cookies = req.cookies.getAll();
  const cookieNames = cookies.map((c) => c.name);
  const hasSessionCookie = cookieNames.some(
    (n) => n.includes("session") || n.startsWith("__session") || n.startsWith("__client")
  );

  // Try BOTH the request-scoped getAuth(req) and the module-cached
  // auth() so we can see if they differ. If getAuth returns a
  // userId but auth() doesn't, the bug is the module cache (which
  // is what /api/ask was hitting before).
  let fromRequest: { userId: string | null; sessionClaims: any } = {
    userId: null,
    sessionClaims: null,
  };
  let fromCache: { userId: string | null; sessionClaims: any } = {
    userId: null,
    sessionClaims: null,
  };
  let fromCacheError: string | null = null;

  try {
    const a = getAuth(req);
    fromRequest = { userId: a.userId, sessionClaims: a.sessionClaims };
  } catch (e) {
    fromRequest = {
      userId: null,
      sessionClaims: { error: e instanceof Error ? e.message : String(e) },
    };
  }

  try {
    const a = await auth();
    fromCache = { userId: a.userId, sessionClaims: a.sessionClaims };
  } catch (e) {
    fromCacheError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    ok: true,
    fromRequest: {
      userId: fromRequest.userId,
      isSignedIn: !!fromRequest.userId,
      hasSessionClaims: !!fromRequest.sessionClaims,
    },
    fromCache: {
      userId: fromCache.userId,
      isSignedIn: !!fromCache.userId,
      hasSessionClaims: !!fromCache.sessionClaims,
      error: fromCacheError,
    },
    sessionClaims: fromRequest.sessionClaims
      ? {
          hasSub: !!fromRequest.sessionClaims.sub,
          hasEmail: !!fromRequest.sessionClaims.email,
          keys: Object.keys(fromRequest.sessionClaims).slice(0, 20),
        }
      : null,
    cookieCount: cookies.length,
    cookies: cookieNames,
    hasSessionCookie,
    timestamp: new Date().toISOString(),
  });
}
