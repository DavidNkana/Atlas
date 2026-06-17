"use client";

/**
 * Atlas — Confirm dialog.
 *
 * Small modal for "are you sure?" prompts. Generic enough to be used
 * anywhere — the caller controls title, body, confirm label, and
 * danger flag.
 *
 * Usage:
 *   <ConfirmDialog
 *     open={open}
 *     title="Delete this question?"
 *     body="This will remove the question from your history. The question is still in the database and can be restored later."
 *     confirmLabel="Delete"
 *     danger
 *     onConfirm={handleDelete}
 *     onCancel={() => setOpen(false)}
 *   />
 */

import { useEffect } from "react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Esc closes the dialog
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-confirm-title"
    >
      {/* Click-outside to cancel */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-sm rounded-2xl border border-atlas-border bg-atlas-surface p-5 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div
          className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ${
            danger ? "bg-red-500/15" : "bg-atlas-accent/15"
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={danger ? "text-red-400" : "text-atlas-accent"}
          >
            {danger ? (
              <>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </>
            )}
          </svg>
        </div>

        <h2
          id="atlas-confirm-title"
          className="mb-1.5 text-base font-semibold text-atlas-text"
        >
          {title}
        </h2>
        {body && (
          <p className="mb-5 text-xs leading-relaxed text-atlas-muted">{body}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-atlas-border bg-atlas-bg px-3 py-1.5 text-xs font-medium text-atlas-muted transition-colors hover:border-atlas-accent hover:text-atlas-text"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors ${
              danger
                ? "bg-red-500 hover:bg-red-600"
                : "bg-atlas-accent hover:bg-atlas-accent2"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
