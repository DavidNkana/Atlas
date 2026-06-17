"use client";

/**
 * Atlas — Sidebar.
 *
 * Perplexity-style left rail:
 *   - Atlas logo + tagline (collapses to logo only)
 *   - "+ New" button (clears input + scrolls to top)
 *   - History list — last 20 questions, scrollable
 *   - Dashboard link
 *   - User avatar + name at the bottom (Clerk UserButton on hover)
 *
 * Collapsible via a chevron toggle in the top-right corner of the rail.
 * The collapsed state shows just icons (≈ 56px wide). The expanded
 * state shows the full labels (≈ 280px wide). Persisted in localStorage
 * so the user's choice survives page reloads.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";

export type HistoryItem = {
  id: string;
  questionText: string;
  vertical: string;
  createdAt: string; // ISO
};

const VERTICAL_LABEL: Record<string, string> = {
  gas_station: "Gas station",
  restaurant: "Restaurant",
  warehouse: "Warehouse",
  retail_shop: "Retail shop",
  residential_land: "Residential land",
  commercial_land: "Commercial land",
  agricultural_land: "Agricultural land",
  industrial_land: "Industrial land",
  mixed_use_land: "Mixed-use land",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return `${Math.floor(day / 30)}mo`;
}

export function Sidebar({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Restore collapsed preference from localStorage
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("atlas:sidebarCollapsed") : null;
    if (stored === "true") setCollapsed(true);
    if (stored === "false") setCollapsed(false);
  }, []);

  // Persist collapsed preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("atlas:sidebarCollapsed", collapsed ? "true" : "false");
    }
  }, [collapsed]);

  // Fetch last 20 questions for the history list
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.items)) {
          setHistory(data.items);
        }
      } catch {
        // Silent — sidebar is a passive surface. If the endpoint is down
        // or the user is signed out, we just show an empty history.
      }
    }
    if (isLoaded && user) load();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, user]);

  const w = collapsed ? "w-14" : "w-64";

  return (
    <aside
      className={`${w} flex h-screen shrink-0 flex-col border-r border-atlas-border bg-atlas-surface transition-[width] duration-200`}
    >
      {/* Top: logo + collapse toggle */}
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 overflow-hidden"
          onClick={() => {
            // "New" feel: nudge the user back to the home command bar.
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("atlas:new"));
            }
          }}
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-atlas-accent text-xs font-bold text-white">
            A
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-atlas-text">
                Atlas
              </div>
              <div className="truncate text-[10px] text-atlas-muted">
                Intelligence for African Real Estate
              </div>
            </div>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            aria-label="Collapse sidebar"
            onClick={() => setCollapsed(true)}
            className="rounded p-1 text-atlas-muted hover:bg-atlas-surface2 hover:text-atlas-text"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          aria-label="Expand sidebar"
          onClick={() => setCollapsed(false)}
          className="mx-2 mb-2 rounded p-1 text-atlas-muted hover:bg-atlas-surface2 hover:text-atlas-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      )}

      {/* + New button */}
      <div className="px-3">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("atlas:new"));
            }
          }}
          className="flex w-full items-center gap-2 rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text transition-colors hover:border-atlas-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          {!collapsed && <span>New</span>}
        </button>
      </div>

      {/* History */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col px-3">
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
              History
            </span>
            <Link
              href="/dashboard"
              className="text-[10px] text-atlas-accent hover:underline"
            >
              See all
            </Link>
          </div>
        )}
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {history.length === 0 ? (
            !collapsed && (
              <p className="text-xs text-atlas-muted">
                No questions yet. Ask Atlas anything.
              </p>
            )
          ) : (
            history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => router.push(`/result/${h.id}`)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs text-atlas-text transition-colors hover:bg-atlas-surface2"
                title={h.questionText}
              >
                {!collapsed && (
                  <>
                    <span className="mt-0.5 inline-flex h-4 shrink-0 items-center rounded-sm bg-atlas-surface2 px-1 text-[9px] font-medium uppercase text-atlas-accent">
                      {VERTICAL_LABEL[h.vertical] ?? h.vertical}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {h.questionText}
                    </span>
                    <span className="shrink-0 text-[10px] text-atlas-muted">
                      {relativeTime(h.createdAt)}
                    </span>
                  </>
                )}
                {collapsed && (
                  <span className="mx-auto inline-flex h-5 w-5 items-center justify-center rounded bg-atlas-surface2 text-[9px] font-medium uppercase text-atlas-accent">
                    {(VERTICAL_LABEL[h.vertical] ?? h.vertical).charAt(0)}
                  </span>
                )}
              </button>
            ))
          )}
        </nav>
      </div>

      {/* User pill at the bottom */}
      <div className="border-t border-atlas-border p-3">
        {isLoaded && user ? (
          <div className="flex items-center gap-2">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: { avatarBox: "h-7 w-7" },
              }}
            />
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-atlas-text">
                  {user.firstName ?? user.username ?? "You"}
                </div>
                <div className="truncate text-[10px] text-atlas-muted">
                  {user.primaryEmailAddress?.emailAddress ?? "Profile & settings"}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="block rounded-md bg-atlas-accent px-3 py-1.5 text-center text-xs font-medium text-white transition-colors hover:bg-atlas-accent2"
          >
            {collapsed ? "↳" : "Sign in"}
          </Link>
        )}
      </div>
    </aside>
  );
}
