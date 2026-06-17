"use client";

/**
 * Atlas — usePins hook.
 *
 * Persists pinned question IDs to localStorage. Pinned items appear
 * in a dedicated "Pinned" section at the top of the Sidebar. Each
 * question can be pinned (📌) or unpinned. Pinned IDs survive page
 * reloads but are scoped to the current browser.
 *
 * Day 30+: move to Prisma User.pinnedIds[] for cross-device sync.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "atlas:pinned";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    // Cross-component sync
    window.dispatchEvent(new CustomEvent("atlas:pins-changed"));
  } catch {
    // localStorage may be disabled — silently no-op.
  }
}

export function usePins(): {
  pinnedIds: string[];
  isPinned: (id: string) => boolean;
  pin: (id: string) => void;
  unpin: (id: string) => void;
  toggle: (id: string) => void;
} {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setPinnedIds(read());
  }, []);

  // Listen for cross-component changes (so two Sidebar instances stay
  // in sync if they ever exist).
  useEffect(() => {
    function onChange() {
      setPinnedIds(read());
    }
    if (typeof window !== "undefined") {
      window.addEventListener("atlas:pins-changed", onChange);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("atlas:pins-changed", onChange);
      }
    };
  }, []);

  function isPinned(id: string): boolean {
    return pinnedIds.includes(id);
  }

  function pin(id: string) {
    if (pinnedIds.includes(id)) return;
    const next = [id, ...pinnedIds];
    setPinnedIds(next);
    write(next);
  }

  function unpin(id: string) {
    const next = pinnedIds.filter((x) => x !== id);
    setPinnedIds(next);
    write(next);
  }

  function toggle(id: string) {
    if (isPinned(id)) unpin(id);
    else pin(id);
  }

  return { pinnedIds, isPinned, pin, unpin, toggle };
}
