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
 * Day 29 — AppShell now also hosts the FullScreenChat modal so
 * any page can dispatch the "atlas:openChat" custom event to
 * summon the centered chat overlay. The Sidebar's "Full chat"
 * button dispatches the event; ResultChatPanel's expand button
 * does the same. This keeps the modal singleton + avoids per-
 * page state.
 *
 * Sign-in / sign-up pages deliberately do NOT use AppShell —
 * they have their own minimal layout (no sidebar, centered card).
 */

import { ReactNode, useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { ClientOnly } from "./ClientOnly";
import { FullScreenChat } from "./FullScreenChat";
import { AtlasHeader } from "./AtlasHeader";
import { PageFrame } from "./PageFrame";

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
  return <aside className="atlas-sidebar w-64 shrink-0 border-r border-atlas-border bg-atlas-surface" aria-hidden="true" />;
}

export function AppShell({
  children,
  patterned = false,
}: {
  children: ReactNode;
  patterned?: boolean;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const hadMobileNavOpen = useRef(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitial, setChatInitial] = useState<string | undefined>(
    undefined,
  );

  // Listen for global "atlas:openChat" custom events so any
  // component (Sidebar's "Full chat" button, ResultChatPanel
  // expand button, future quick-actions) can summon the chat.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ initialQuestion?: string }>).detail;
      setChatInitial(detail?.initialQuestion);
      setChatOpen(true);
    }
    window.addEventListener("atlas:openChat", onOpen as EventListener);
    return () => {
      window.removeEventListener("atlas:openChat", onOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  // A drawer can remain open when the viewport crosses the mobile breakpoint.
  // Close it from the client-side responsive effect so the desktop sidebar is
  // no longer competing with an inert main area. The resize listener covers
  // browsers where MediaQueryList change events are delayed or unavailable.
  useEffect(() => {
    const desktopMedia = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktopMedia.matches) setMobileNavOpen(false);
    };

    closeOnDesktop();
    desktopMedia.addEventListener("change", closeOnDesktop);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      desktopMedia.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, []);

  useEffect(() => {
    if (hadMobileNavOpen.current && !mobileNavOpen) {
      // The trigger is hidden at desktop widths. Preserve the mobile focus
      // restoration without attempting to focus that hidden control after a
      // responsive close.
      if (window.matchMedia("(max-width: 767px)").matches) {
        mobileMenuButtonRef.current?.focus();
      }
    }
    hadMobileNavOpen.current = mobileNavOpen;
  }, [mobileNavOpen]);

  return (
    <div className="atlas-app-shell flex h-screen overflow-hidden bg-atlas-bg text-atlas-text">
      <ClientOnly fallback={<SidebarSkeleton />}>
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      </ClientOnly>
      {mobileNavOpen && (
        <div
          role="presentation"
          className="atlas-mobile-backdrop fixed inset-0 z-20 bg-black/55 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <main
        className="flex min-w-0 flex-1 flex-col overflow-y-auto"
        inert={mobileNavOpen ? true : undefined}
      >
        <AtlasHeader />
        <PageFrame patterned={patterned}>{children}</PageFrame>
      </main>
      <button
        ref={mobileMenuButtonRef}
        type="button"
        aria-label="Open navigation"
        aria-expanded={mobileNavOpen}
        aria-controls="atlas-navigation"
        hidden={mobileNavOpen}
        inert={mobileNavOpen ? true : undefined}
        className="fixed left-3 top-3 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-atlas-border bg-atlas-surface/95 text-atlas-muted shadow-lg backdrop-blur transition-colors hover:border-atlas-accent hover:text-atlas-text md:hidden"
        onClick={() => setMobileNavOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      <ClientOnly fallback={null}>
        <FullScreenChat
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          initialQuestion={chatInitial}
        />
      </ClientOnly>
    </div>
  );
}
