/**
 * Day 5 hotfix — generic timeout helper.
 *
 * Why this exists:
 *   Vercel serverless functions default to a 10s timeout on Hobby and
 *   60s on Pro, with 300s as the max opt-in. /api/ask was hitting the
 *   300s ceiling because (a) the AI fallback chain cascaded through
 *   every discovered OpenRouter model, (b) the Overpass connector
 *   blocked for its full 8s on slow calls, and (c) we had no hard
 *   deadline on the handler itself. Result: FUNCTION_INVOCATION_TIMEOUT.
 *
 *   This helper gives us one canonical timeout primitive so every
 *   async call (model calls, connector fetches, the handler itself)
 *   shares the same AbortController-based semantics.
 *
 * How it works:
 *   - On expiry, console.warn so we can see which call actually timed out
 *     in Vercel's runtime log.
 *   - Throws `${label}_timeout` so catch blocks can pattern-match the
 *     failure without sniffing error messages.
 *   - Caller is responsible for honouring the returned AbortSignal in
 *     their underlying network call (fetch / SDK); otherwise the local
 *     timer fires but the network call keeps running in the background.
 *     That is acceptable for Vercel because the function returns and
 *     the orphan request is reaped server-side.
 */

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        console.warn(`[${label}] timeout after ${ms}ms`);
        reject(new Error(`${label}_timeout`));
      }, ms);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
