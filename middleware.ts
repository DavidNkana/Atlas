import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk middleware for Next.js 15 App Router.
 *
 * The matcher includes:
 *   - /__clerk/* : Clerk's internal routes
 *   - everything except _next/* and files with extensions
 *
 * See: https://clerk.com/docs/quickstarts/nextjs
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    "/__clerk/:path*",
    "/((?!_next|.*\\..*).*)",
  ],
};
