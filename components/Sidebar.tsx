"use client";

/**
 * Atlas — Sidebar.
 *
 * Perplexity-style left rail:
 *   - Atlas logo + tagline (collapses to logo only)
 *   - "+ New" button (clears input + scrolls to top)
 *   - History list — last 20 questions, scrollable
 *   - Settings button (opens SettingsDrawer for theme + default model)
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
import { AtlasLogo } from "./AtlasLogo";
import { usePins } from "@/lib/hooks/usePins";
import {
  SettingsDrawer,
  readPrefs,
  writePrefs,
  type AtlasPrefs,
  DEFAULT_PREFS,
} from "./SettingsDrawer";

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
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [prefs, setPrefs] = useState<AtlasPrefs>(DEFAULT_PREFS);
  const pins = usePins();

  // Restore collapsed preference from localStorage
  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("atlas:sidebarCollapsed")
        : null;
    if (stored === "true") setCollapsed(true);
    if (stored === "false") setCollapsed(false);
  }, []);

  // Persist collapsed preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "atlas:sidebarCollapsed",
        collapsed ? "true" : "false"
      );
    }
  }, [collapsed]);

  // Load user prefs on mount, apply theme to <html>
  useEffect(() => {
    const loaded = readPrefs();
    setPrefs(loaded);
    applyTheme(loaded.theme);
  }, []);

  // Persist + apply theme whenever prefs change
  useEffect(() => {
    writePrefs(prefs);
    applyTheme(prefs.theme);
    // Notify the rest of the app that prefs changed
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("atlas:prefs", { detail: prefs })
      );
    }
  }, [prefs]);

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

  // When fully collapsed, the sidebar is 0px wide — only the expand
  // button floats over the main content. When expanded, it's the full
  // 280px rail.
  const w = collapsed ? "w-0 overflow-hidden" : "w-64";

  return (
    <>
      <aside
        className={`${w} flex h-screen shrink-0 flex-col border-r border-atlas-border bg-atlas-surface transition-[width] duration-200`}
      >
        {/* Top: logo + collapse toggle */}
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 overflow-hidden"
            title="Go to home"
          >
            <AtlasLogo size={28} className="shrink-0" />
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

        {/* Expand chevron is now a floating button outside the aside —
            see below. The aside is 0px wide when collapsed. */}

        {/* + New button — always navigates to home */}
        <div className="px-3">
          <Link
            href="/"
            className="flex w-full items-center gap-2 rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-sm text-atlas-text transition-colors hover:border-atlas-accent"
            title="Start a new question"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            {!collapsed && <span>New</span>}
          </Link>
        </div>

        {/* Pinned + History — hover reveals pin/delete icons on each row */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col px-3">
          {!collapsed && (
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
                Pinned
              </span>
              <span className="text-[10px] text-atlas-muted">
                {pins.pinnedIds.length}
              </span>
            </div>
          )}
          <nav className="min-h-0 space-y-1 overflow-y-auto pr-1">
            {(() => {
              const pinnedItems = pins.pinnedIds
                .map((id) => history.find((h) => h.id === id))
                .filter((h): h is HistoryItem => Boolean(h));
              const unpinned = history.filter(
                (h) => !pins.pinnedIds.includes(h.id)
              );
              const allEmpty = pinnedItems.length === 0 && unpinned.length === 0;
              if (allEmpty && !collapsed) {
                return (
                  <p className="mt-2 text-xs text-atlas-muted">
                    No questions yet. Ask Atlas anything.
                  </p>
                );
              }
              return (
                <>
                  {pinnedItems.map((h) => (
                    <HistoryRow
                      key={h.id}
                      item={h}
                      collapsed={collapsed}
                      isPinned
                      onNavigate={() => router.push(`/result/${h.id}`)}
                      onTogglePin={() => pins.unpin(h.id)}
                    />
                  ))}
                  {pinnedItems.length > 0 && unpinned.length > 0 && !collapsed && (
                    <div className="my-2 border-t border-atlas-border" />
                  )}
                  {pinnedItems.length > 0 && !collapsed && unpinned.length > 0 && (
                    <div className="mb-1 mt-1 flex items-center justify-between">
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
                  {pinnedItems.length === 0 && !collapsed && (
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
                  {unpinned.slice(0, 12).map((h) => (
                    <HistoryRow
                      key={h.id}
                      item={h}
                      collapsed={collapsed}
                      isPinned={false}
                      onNavigate={() => router.push(`/result/${h.id}`)}
                      onTogglePin={() => pins.pin(h.id)}
                    />
                  ))}
                </>
              );
            })()}
          </nav>
        </div>

        {/* Settings + User pill at the bottom */}
        <div className="border-t border-atlas-border p-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="mb-2 flex w-full items-center gap-2 rounded-md border border-atlas-border bg-atlas-bg px-2 py-1.5 text-xs text-atlas-muted transition-colors hover:border-atlas-accent hover:text-atlas-text"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            {!collapsed && <span>Settings</span>}
          </button>

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
                    {user.primaryEmailAddress?.emailAddress ?? "Profile"}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={collapsed ? "flex justify-center" : "space-y-1.5"}>
              <Link
                href="/sign-in"
                className="block rounded-md bg-atlas-accent px-3 py-1.5 text-center text-xs font-medium text-white transition-colors hover:bg-atlas-accent2"
              >
                {collapsed ? "↳" : "Sign in"}
              </Link>
              {!collapsed && (
                <Link
                  href="/sign-up"
                  className="block rounded-md border border-atlas-border bg-atlas-bg px-3 py-1.5 text-center text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent"
                >
                  Create account
                </Link>
              )}
            </div>
          )}
         </div>
       </aside>

      {/* Floating expand button — only visible when sidebar is fully
          collapsed (sidebar is 0px wide so the button can't live
          inside it). */}
      {collapsed && (
        <button
          type="button"
          aria-label="Expand sidebar"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="fixed left-2 top-3 z-40 inline-flex h-8 w-8 items-center justify-center rounded-md border border-atlas-border bg-atlas-surface text-atlas-muted shadow-md transition-colors hover:border-atlas-accent hover:text-atlas-text"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      )}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        onChange={setPrefs}
      />
    </>
  );
}

/**
 * Apply the theme preference to <html>. v1 supports dark + system. Light
 * mode is a preview that swaps the page surface but the brand color
 * stays the same (we never lose Atlas's identity).
 */
function applyTheme(theme: AtlasPrefs["theme"]) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (theme === "dark") {
    html.classList.add("dark");
    html.classList.remove("atlas-light");
  } else if (theme === "light") {
    html.classList.remove("dark");
    html.classList.add("atlas-light");
  } else {
    // system
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      html.classList.add("dark");
      html.classList.remove("atlas-light");
    } else {
      html.classList.remove("dark");
      html.classList.add("atlas-light");
    }
  }
}

/**
 * HistoryRow — a single question in the Sidebar.
 *
 * Day 8 polish v3: hover reveals a pin icon (left) and a delete icon
 * (right). The icons stop event propagation so clicking them doesn't
 * trigger navigation to the result page. Delete is a v1 local
 * operation (just hides the item from the local list — server-side
 * delete comes in Day 30+).
 */
function HistoryRow({
  item,
  collapsed,
  isPinned,
  onNavigate,
  onTogglePin,
}: {
  item: HistoryItem;
  collapsed: boolean;
  isPinned: boolean;
  onNavigate: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div
      className="group relative flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs text-atlas-text transition-colors hover:bg-atlas-surface2"
    >
      <button
        type="button"
        onClick={onNavigate}
        title={item.questionText}
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
      >
        {!collapsed && (
          <>
            <span className="mt-0.5 inline-flex h-4 shrink-0 items-center rounded-sm bg-atlas-surface2 px-1 text-[9px] font-medium uppercase text-atlas-accent">
              {VERTICAL_LABEL[item.vertical] ?? item.vertical}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {item.questionText}
            </span>
            <span className="shrink-0 text-[10px] text-atlas-muted">
              {relativeTime(item.createdAt)}
            </span>
          </>
        )}
        {collapsed && (
          <span className="mx-auto inline-flex h-5 w-5 items-center justify-center rounded bg-atlas-surface2 text-[9px] font-medium uppercase text-atlas-accent">
            {(VERTICAL_LABEL[item.vertical] ?? item.vertical).charAt(0)}
          </span>
        )}
      </button>

      {/* Hover-revealed actions (right side) — only when not collapsed */}
      {!collapsed && (
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-atlas-surface/95 px-1 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            title={isPinned ? "Unpin" : "Pin"}
            aria-label={isPinned ? "Unpin" : "Pin"}
            className={`rounded p-1 transition-colors ${
              isPinned
                ? "text-atlas-accent hover:bg-atlas-accent/15"
                : "text-atlas-muted hover:bg-atlas-surface2 hover:text-atlas-text"
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill={isPinned ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // v1: just hide from the list (no server delete). Day 30+
              // will wire a /api/questions/:id DELETE endpoint.
              const el = (e.currentTarget as HTMLElement).closest(
                ".group"
              ) as HTMLElement | null;
              if (el) el.style.display = "none";
            }}
            title="Hide from history"
            aria-label="Hide from history"
            className="rounded p-1 text-atlas-muted transition-colors hover:bg-atlas-surface2 hover:text-red-300"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
