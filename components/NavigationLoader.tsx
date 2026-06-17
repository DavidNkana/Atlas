"use client";

/**
 * Atlas — Navigation loader (full-screen overlay).
 *
 * Day 8 polish v2. Listens to Next.js App Router navigation events and
 * shows a centered spinner + "Loading…" message while a route
 * transition is in flight. This makes "See all" / "View response" /
 * history-item clicks feel responsive instead of frozen.
 *
 * Implementation: we use the `usePathname()` hook and watch for
 * changes. While `pending` is true, we render a full-screen
 * semi-transparent overlay with an animated spinner.
 *
 * No external deps. Pure Tailwind + a tiny useState for the visible
 * flag.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AtlasLogo } from "./AtlasLogo";

export function NavigationLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const [minMs, setMinMs] = useState(false);

  useEffect(() => {
    if (pathname !== lastPath) {
      setVisible(true);
      setMinMs(true);
      // Force the loader to stay visible for at least 400ms so the
      // user always sees it. A 50ms navigation that flashes a spinner
      // for 16ms feels worse than no spinner.
      const min = setTimeout(() => setMinMs(false), 400);
      const max = setTimeout(() => {
        setVisible(false);
        setLastPath(pathname);
      }, 2500);
      return () => {
        clearTimeout(min);
        clearTimeout(max);
      };
    }
  }, [pathname, lastPath]);

  // Also clear once pathname settles and the min-ms hold is over.
  useEffect(() => {
    if (visible && !minMs) {
      const t = setTimeout(() => {
        setVisible(false);
        setLastPath(pathname);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [visible, minMs, pathname]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-atlas-border bg-atlas-surface px-8 py-6 shadow-2xl shadow-black/50">
        <div className="relative h-10 w-10">
          <AtlasLogo size={40} className="opacity-30" />
          <svg
            className="absolute inset-0 animate-spin text-atlas-accent"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeOpacity={0.2}
            />
            <path
              d="M22 12C22 17.5228 17.5228 22 12 22"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="text-sm font-medium text-atlas-text">Loading…</div>
        <div className="text-[10px] uppercase tracking-wider text-atlas-muted">
          Atlas
        </div>
      </div>
    </div>
  );
}
