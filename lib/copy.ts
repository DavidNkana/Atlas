/**
 * Atlas — shared marketing copy.
 *
 * ⚑ HOOK COPY LIVES HERE. Swap ATLAS_HOOK in this one place and it
 * updates everywhere it's used:
 *   - the anon landing hero on `/`            (app/page.tsx)
 *   - the tagline on the OG share card        (app/api/og/route.tsx)
 *   - the fallback OG meta description        (app/result/[id]/page.tsx)
 *
 * The current value is a PLACEHOLDER — David is picking the final
 * hook separately.
 */
export const ATLAS_HOOK = "Atlas — Where in South Africa should you build?";

/** Sub-line used under the hook on the anon hero. */
export const ATLAS_SUBHOOK =
  "Ranked, map-backed site answers in 30 seconds. Ask one free question — no sign-up.";

/** Canonical public host (used on the OG card footer + metadataBase). */
export const ATLAS_HOST = "atlas-q2eh.vercel.app";
export const ATLAS_ORIGIN = `https://${ATLAS_HOST}`;
