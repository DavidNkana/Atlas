"use client";

/**
 * Atlas — Settings drawer.
 *
 * Opens from the bottom-left of the sidebar (above the user pill). Lets
 * the signed-in user configure:
 *   - Theme (dark / light / system)
 *   - Default model (the picker the command bar uses by default)
 *   - Default vertical
 *   - Show thinking loader (toggle)
 *
 * Theme and default-model settings persist to localStorage so the user's
 * choice survives page reloads. We use a single `atlas:prefs` JSON key
 * — the Sidebar reads it on mount and passes initial values down.
 *
 * v1: no backend persistence. The same user on a different device gets
 * the defaults. Day 30+ we'll move prefs to the Prisma User table.
 */

import { useEffect, useState } from "react";
import { MODEL_INFO } from "@/lib/models/registry";
import { ModelIcon } from "./ModelIcon";
import { AtlasLogo } from "./AtlasLogo";

export type AtlasPrefs = {
  theme: "dark" | "light" | "system";
  defaultModel: string;
  defaultVertical: string;
  showThinkingLoader: boolean;
};

export const DEFAULT_PREFS: AtlasPrefs = {
  theme: "dark",
  defaultModel: MODEL_INFO.find((m) => m.id === "curated-stub")?.id ?? MODEL_INFO[0]?.id ?? "curated-stub",
  defaultVertical: "gas_station",
  showThinkingLoader: true,
};

export function readPrefs(): AtlasPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem("atlas:prefs");
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AtlasPrefs>;
    const merged: AtlasPrefs = { ...DEFAULT_PREFS, ...parsed };
    // If the stored defaultModel doesn't exist in the current registry,
    // fall back to the first registered model. This handles upgrades where
    // a previous-version model id is no longer in MODEL_INFO.
    const knownIds = new Set(MODEL_INFO.map((m) => m.id));
    if (merged.defaultModel && !knownIds.has(merged.defaultModel)) {
      merged.defaultModel = DEFAULT_PREFS.defaultModel;
    }
    return merged;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(p: AtlasPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("atlas:prefs", JSON.stringify(p));
  } catch {
    // localStorage may be disabled — silently no-op.
  }
}

const VERTICALS = [
  { value: "gas_station", label: "Gas station" },
  { value: "restaurant", label: "Restaurant" },
  { value: "warehouse", label: "Warehouse" },
  { value: "retail_shop", label: "Retail shop" },
];

export function SettingsDrawer({
  open,
  onClose,
  prefs,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  prefs: AtlasPrefs;
  onChange: (next: AtlasPrefs) => void;
}) {
  // Esc closes the drawer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-start"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      {/* Click-outside to close */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <div
        className="relative m-3 w-80 max-w-[90vw] rounded-xl border border-atlas-border bg-atlas-surface p-5 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AtlasLogo size={20} />
            <h2 className="text-sm font-semibold text-atlas-text">Settings</h2>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="rounded p-1 text-atlas-muted hover:bg-atlas-surface2 hover:text-atlas-text"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Theme */}
        <section className="mb-5">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
            Theme
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["dark", "light", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...prefs, theme: t })}
                className={`rounded-md border px-2 py-1.5 text-xs capitalize transition-colors ${
                  prefs.theme === t
                    ? "border-atlas-accent bg-atlas-accent/10 text-atlas-text"
                    : "border-atlas-border bg-atlas-bg text-atlas-muted hover:border-atlas-accent/50 hover:text-atlas-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-atlas-muted">
            Atlas is dark by default. Light mode is a preview.
          </p>
        </section>

        {/* Default model */}
        <section className="mb-5">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
            Default model
          </label>
          <div className="space-y-1">
            {MODEL_INFO.map((info) => {
              const isActive = prefs.defaultModel === info.id;
              return (
                <button
                  key={info.id}
                  type="button"
                  onClick={() => onChange({ ...prefs, defaultModel: info.id })}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? "border-atlas-accent bg-atlas-accent/10"
                      : "border-atlas-border bg-atlas-bg hover:border-atlas-accent/50"
                  }`}
                >
                  <ModelIcon info={info} size={18} />
                  <span className="flex-1 text-atlas-text">
                    {info.displayName}
                  </span>
                  {info.free && (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                      FREE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Default vertical */}
        <section className="mb-5">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
            Default vertical
          </label>
          <div className="grid grid-cols-2 gap-2">
            {VERTICALS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => onChange({ ...prefs, defaultVertical: v.value })}
                className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                  prefs.defaultVertical === v.value
                    ? "border-atlas-accent bg-atlas-accent/10 text-atlas-text"
                    : "border-atlas-border bg-atlas-bg text-atlas-muted hover:border-atlas-accent/50 hover:text-atlas-text"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </section>

        {/* Show thinking loader */}
        <section className="mb-1">
          <div
            role="button"
            tabIndex={0}
            onClick={() =>
              onChange({ ...prefs, showThinkingLoader: !prefs.showThinkingLoader })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange({ ...prefs, showThinkingLoader: !prefs.showThinkingLoader });
              }
            }}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-atlas-border bg-atlas-bg p-2.5 transition-colors hover:border-atlas-accent/50"
          >
            <div>
              <div className="text-xs text-atlas-text">Animated thinking loader</div>
              <div className="text-[10px] text-atlas-muted">
                Show the 5-stage progress while Atlas thinks
              </div>
            </div>
            <div
              role="switch"
              aria-checked={prefs.showThinkingLoader}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                prefs.showThinkingLoader ? "bg-atlas-accent" : "bg-atlas-border"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  prefs.showThinkingLoader ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
