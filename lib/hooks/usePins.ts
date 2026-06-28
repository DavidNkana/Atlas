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

interface PinnedItem {
  id: string;
  questionText: string;
  vertical: string;
}

function read(): PinnedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: any) => typeof s?.id === "string") : [];
  } catch {
    return [];
  }
}

function write(items: PinnedItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("atlas:pins-changed"));
  } catch {}
}

export function usePins() {
  const [pinned, setPinned] = useState<PinnedItem[]>([]);

  useEffect(() => { setPinned(read()); }, []);

  useEffect(() => {
    function onChange() { setPinned(read()); }
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
    return pinned.some((p) => p.id === id);
  }

  function pin(id: string, questionText: string = "", vertical: string = "") {
    if (pinned.some((p) => p.id === id)) return;
    const next = [{ id, questionText, vertical }, ...pinned];
    setPinned(next);
    write(next);
  }

  function unpin(id: string) {
    const next = pinned.filter((p) => p.id !== id);
    setPinned(next);
    write(next);
  }

  function toggle(id: string, questionText?: string, vertical?: string) {
    if (isPinned(id)) unpin(id);
    else pin(id, questionText, vertical);
  }

  return { pinned, isPinned, pin, unpin, toggle };
}
