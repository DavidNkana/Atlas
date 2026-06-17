"use client";

/**
 * Atlas — Navigation loader.
 *
 * Day 8 polish. Listens to Next.js App Router navigation events and
 * shows a thin progress bar at the top of the page while a route
 * transition is in flight. This makes "See all" / "View response" /
 * history-item clicks feel responsive instead of frozen.
 *
 * Implementation: we use the `usePathname()` hook and watch for
 * changes. While `pending` is true, we render a top bar that
 * animates from 0 → 90% (incomplete so the user can see motion) and
 * snaps to 100% when the navigation completes.
 *
 * No external deps. Pure Tailwind + a tiny useState for the bar width.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationLoader() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  useEffect(() => {
    if (pathname !== lastPath) {
      // Route just changed. Start a fake progress animation.
      setVisible(true);
      setProgress(0);
      let p = 0;
      const id = setInterval(() => {
        p += 12 + Math.random() * 8;
        if (p >= 90) {
          p = 90;
          clearInterval(id);
        }
        setProgress(p);
      }, 80);
      // Snap to 100% after a short delay (route mount is done).
      const t = setTimeout(() => {
        clearInterval(id);
        setProgress(100);
        setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 220);
      }, 400);
      setLastPath(pathname);
      return () => {
        clearInterval(id);
        clearTimeout(t);
      };
    }
  }, [pathname, lastPath]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-0.5"
      aria-hidden="true"
    >
      <div
        className="h-full bg-atlas-accent transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
