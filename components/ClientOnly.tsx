"use client";

/**
 * ClientOnly — render children only after client-side mount.
 *
 * Solves React #418 hydration mismatches caused by components that
 * read localStorage / sessionStorage / window.* during their first
 * client render, where the server render has different (or no)
 * data for those sources.
 *
 * Usage:
 *   <ClientOnly fallback={<Skeleton />}>
 *     <SidebarHistory />   {/* reads localStorage in useState init *\/}
 *   </ClientOnly>
 *
 * SSR / first client paint: renders `fallback` (typically the same
 * skeleton, so the DOM shape is identical → no hydration warning).
 * After useEffect runs (post-hydration): swaps to children.
 */

import { ReactNode, useEffect, useState } from "react";

export function ClientOnly({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <>{fallback ?? null}</>;
  return <>{children}</>;
}
