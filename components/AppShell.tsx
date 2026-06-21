"use client";

/**
 * Day 12 v7: AppShell — the shared layout wrapper for every
 * authenticated / shell-bearing page. Wraps children in
 *   <div className="flex h-screen overflow-hidden bg-atlas-bg text-atlas-text">
 *     <Sidebar />
 *     <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
 *       {children}
 *     </main>
 *   </div>
 *
 * The previous pattern was: every page renders <Sidebar /> + <main>
 * with the same flex/h-screen/overflow-hidden structure inline.
 * With 9 pages that all duplicate this, drift was inevitable.
 * The home page had <div className="flex h-screen ...">, the
 * result page had a similar but different wrapper, etc.
 *
 * Centralising in AppShell means:
 *   - One place to change the layout (e.g. add a top bar later)
 *   - The page just renders its own content; no manual layout
 *   - The sidebar + main are always identical across pages
 *
 * The Sidebar component itself renders the SettingsDrawer and
 * ConfirmDialog portals, so they remain available from any page
 * that mounts the Sidebar. Theme changes apply globally because
 * the theme is applied as a class on <html> by Sidebar's useEffect.
 *
 * Sign-in / sign-up pages deliberately do NOT use AppShell —
 * they have their own minimal layout (no sidebar, centered card).
 */

import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ClientOnly } from "./ClientOnly";

/**
 * Day 28 v2 — wrap Sidebar in <ClientOnly>. Sidebar reads
 * localStorage (atlas:sidebarCollapsed, atlas:prefs, atlas:pins)
 * inside its first useState initialisers. On the server those
 * reads return their initial defaults; on the first client
 * paint useState re-runs and may produce different values,
 * which causes React error #418 (hydration mismatch).
 *
 * Solution: render a skeleton-sized placeholder during SSR +
 * first client paint (same DOM shape), then swap to the real
 * Sidebar after useEffect. The placeholder is invisible
 * (0px wide if collapsed, 280px wide if expanded — default
 * to expanded since that's the server-side initial state).
 */
function SidebarSkeleton() {
  // Match the Sidebar's expanded width (w-64 = 16rem = 256px) so
  // there's no layout shift when the real Sidebar mounts.
  return <aside className="w-64 shrink-0 border-r border-atlas-border bg-atlas-surface" aria-hidden="true" />;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-atlas-bg text-atlas-text">
      <ClientOnly fallback={<SidebarSkeleton />}>
        <Sidebar />
      </ClientOnly>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
