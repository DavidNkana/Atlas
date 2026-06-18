"use client";

/**
 * Atlas — Feedback widget.
 *
 * Day 10. Renders thumbs-up / thumbs-down buttons + an optional
 * note. Wired to POST /api/feedback. Pre-fills from GET
 * /api/feedback?questionId=... on mount so the widget shows the
 * user's last rating on reload.
 *
 * The widget is intentionally minimal — one question, two
 * buttons, a text field that expands on demand. We don't want a
 * 5-field form here. The data moat comes from CLICKS, not from
 * a 2,000-word essay.
 */

import { useEffect, useState } from "react";

export function FeedbackWidget({ questionId }: { questionId: string }) {
  const [rating, setRating] = useState<-1 | 1 | null>(null);
  const [note, setNote] = useState<string>("");
  const [showNote, setShowNote] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill on mount: if the user already rated this question,
  // restore the rating + note so they can edit it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/feedback?questionId=${encodeURIComponent(questionId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return; // silent — we don't block the page on this
        const data = await res.json();
        if (cancelled) return;
        if (data.rating === -1 || data.rating === 1) {
          setRating(data.rating);
          if (data.note) {
            setNote(data.note);
            setShowNote(true);
          }
          if (data.ratedAt) setSavedAt(data.ratedAt);
        }
      } catch {
        // ignore — we don't want feedback loading to break the page
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  async function submit(newRating: -1 | 1) {
    // Optimistic UI: flip the rating immediately so the user
    // gets instant feedback. If the request fails, we roll back.
    const previousRating = rating;
    const previousSavedAt = savedAt;
    setRating(newRating);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          rating: newRating,
          note: showNote ? note.trim() : null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      setSavedAt(data.ratedAt);
    } catch (e) {
      // Roll back
      setRating(previousRating);
      setSavedAt(previousSavedAt);
      setError(e instanceof Error ? e.message : "Could not save feedback");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveNote() {
    if (rating === null) return; // need a rating first
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          rating,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      setSavedAt(data.ratedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-atlas-border bg-atlas-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-atlas-text">
          Was this useful?
        </h3>
        {savedAt && (
          <span className="text-[10px] text-atlas-muted">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      <p className="mb-3 text-[11px] text-atlas-muted">
        Your rating helps Atlas learn which recommendations actually
        work for African land developers.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(1)}
          className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
            rating === 1
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
              : "border-atlas-border bg-atlas-bg text-atlas-muted hover:border-emerald-500/30 hover:text-emerald-300"
          }`}
        >
          <span className="mr-1.5">👍</span>Yes, useful
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(-1)}
          className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
            rating === -1
              ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
              : "border-atlas-border bg-atlas-bg text-atlas-muted hover:border-rose-500/30 hover:text-rose-300"
          }`}
        >
          <span className="mr-1.5">👎</span>Not quite
        </button>
      </div>

      {(rating !== null || showNote) && (
        <div className="mt-3">
          {!showNote ? (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="text-[11px] text-atlas-muted underline-offset-2 hover:text-atlas-accent hover:underline"
            >
              Add a quick note (optional)
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder="What did you actually do with this? What was missing?"
                rows={2}
                className="w-full resize-none rounded-md border border-atlas-border bg-atlas-bg px-3 py-2 text-xs text-atlas-text placeholder:text-atlas-muted/60 focus:border-atlas-accent focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-atlas-muted">
                  {note.length}/500
                </span>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={saveNote}
                  className="rounded-md bg-atlas-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-atlas-accent2 disabled:opacity-50"
                >
                  Save note
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11px] text-rose-300">{error}</p>
      )}
    </section>
  );
}
