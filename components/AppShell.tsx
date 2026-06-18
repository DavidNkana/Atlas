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

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-atlas-bg text-atlas-text">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
