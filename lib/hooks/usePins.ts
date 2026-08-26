"use client";

/**
 * Atlas — usePins hook.
 *
 * Persists pinned question IDs to localStorage, **scoped per Clerk
 * user**. Pinned items appear in a dedicated "Pinned" section at the
 * top of the Sidebar. Each question can be pinned (📌) or unpinned.
 *
 * Storage: localStorage key `atlas:pinned:${userId}`. The userId is the
 * Clerk user ID — a stable string. If no user is signed in, the hook
 * returns an empty pins list (signed-out users can't pin).
 *
 * Why per-user namespacing matters:
 *   - Before this fix, all users shared `atlas:pinned` — any user
 *     could see any other user's pins (privacy + UX bug).
 *   - Now: User A signs out → empty pins. User A signs in → User A's
 *     pins. User B signs in (same browser) → User B's pins, not A's.
 *
 * Day 30+: move to Prisma User.pinnedIds[] for cross-device sync.
 * This hook returns the same shape so the Sidebar doesn't change.
 */

import { useEffect, useState } from "react";

interface PinnedItem {
  id: string;
  questionText: string;
  vertical: string;
}

const STORAGE_PREFIX = "atlas:pinned";

function storageKey(userId: string | null): string | null {
  if (!userId) return null;
  return `${STORAGE_PREFIX}:${userId}`;
}

function read(userId: string | null): PinnedItem[] {
  const key = storageKey(userId);
  if (!key) return [];
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: any) => typeof s?.id === "string") : [];
  } catch {
    return [];
  }
}

function write(userId: string | null, items: PinnedItem[]) {
  const key = storageKey(userId);
  if (!key) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("atlas:pins-changed"));
  } catch {}
}

/**
 * @param userId - The Clerk user ID (string), or null when signed out.
 *                 When null, the hook returns an empty pins list and
 *                 pin/unpin/toggle are no-ops (you can't pin while
 *                 signed out).
 */
export function usePins(userId: string | null) {
  const [pinned, setPinned] = useState<PinnedItem[]>([]);

  // Load whenever userId changes (sign in / sign out / switch account).
  useEffect(() => {
    setPinned(read(userId));
  }, [userId]);

  // Cross-component sync: if the Sidebar calls pin() from one place,
  // any other mounted Sidebar (e.g. mobile/desktop layouts) should
  // update too. We scope the listener by userId so we only react to
  // events from the same user.
  useEffect(() => {
    function onChange() {
      setPinned(read(userId));
    }
    if (typeof window !== "undefined") {
      window.addEventListener("atlas:pins-changed", onChange);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("atlas:pins-changed", onChange);
      }
    };
  }, [userId]);

  function isPinned(id: string): boolean {
    return pinned.some((p) => p.id === id);
  }

  function pin(id: string, questionText: string = "", vertical: string = "") {
    if (!userId) return; // no-op when signed out
    if (pinned.some((p) => p.id === id)) return;
    const next = [{ id, questionText, vertical }, ...pinned];
    setPinned(next);
    write(userId, next);
  }

  function unpin(id: string) {
    if (!userId) return; // no-op when signed out
    const next = pinned.filter((p) => p.id !== id);
    setPinned(next);
    write(userId, next);
  }

  function toggle(id: string, questionText?: string, vertical?: string) {
    if (isPinned(id)) unpin(id);
    else pin(id, questionText, vertical);
  }

  return { pinned, isPinned, pin, unpin, toggle };
}
