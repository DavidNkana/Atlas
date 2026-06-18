"use client";

/**
 * Atlas — Add Listing Modal (Path 4, Day 10+).
 *
 * The "+ Add a listing I know about" button on the result page
 * opens this modal. Two paths:
 *
 *   1. Paste a Property24 URL → we extract city/suburb/listingType
 *      from the URL slug and pre-fill the form. The user only
 *      needs to add price + size + agent.
 *
 *   2. Fill in the form manually.
 *
 * On submit we POST to /api/plots. The API dedupes by (userId,
 * sourceUrl) so re-pasting the same URL updates the existing row
 * instead of creating a duplicate.
 *
 * Position: fixed so it doesn't push the result page scroll. Esc
 * closes. Click outside closes.
 */

import { useEffect, useState } from "react";
import {
  parseProperty24Url,
  currencyFromUrl,
} from "@/lib/listings/parse-property24-url";

const VALID_LISTING_TYPES = [
  { value: "for_sale", label: "For sale" },
  { value: "auction", label: "Auction" },
  { value: "tender", label: "Tender" },
  { value: "off_market", label: "Off-market" },
] as const;

const VALID_CURRENCIES = [
  { value: "ZAR", label: "ZAR (R)" },
  { value: "ZMW", label: "ZMW (K)" },
  { value: "KES", label: "KES" },
  { value: "NGN", label: "NGN (₦)" },
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
] as const;

interface AddListingModalProps {
  questionId: string;
  onClose: () => void;
  onSaved: (plot: PlotCard) => void;
}

interface PlotCard {
  id: string;
  suburb: string;
  city: string;
  sizeM2: number | null;
  priceAmount: number | null;
  currency: string;
  listingType: string;
  agentName: string | null;
  sourceUrl: string | null;
  lat: number | null;
  lng: number | null;
}

export function AddListingModal({
  questionId,
  onClose,
  onSaved,
}: AddListingModalProps) {
  // URL paste field
  const [url, setUrl] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const [parsed, setParsed] = useState<ReturnType<typeof parseProperty24Url>>(
    null
  );

  // Form fields
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [sizeSqm, setSizeSqm] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("ZAR");
  const [listingType, setListingType] = useState("for_sale");
  const [agentName, setAgentName] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Esc closes the modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // When the user pastes a URL, parse it on the fly. The prefill
  // is opt-in (the "Parse URL" button) so the user can still
  // type a URL without auto-overwriting their manual entry.
  function parseUrl() {
    setUrlTouched(true);
    setError(null);
    const result = parseProperty24Url(url);
    if (!result) {
      setError("That doesn't look like a Property24 URL. Fill the form manually below.");
      setParsed(null);
      return;
    }
    setParsed(result);
    setSuburb(result.suburb);
    setCity(result.city);
    setListingType(result.listingType);
    const c = currencyFromUrl(url);
    if (c) setCurrency(c);
    setInfo(`Pre-filled from URL. Add price + size + agent to complete.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!suburb.trim() || !city.trim()) {
      setError("Suburb and city are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const body: Record<string, unknown> = {
        questionId,
        suburb: suburb.trim(),
        city: city.trim(),
        country: country.trim() || "South Africa",
        currency,
        listingType,
      };
      if (url.trim()) body.sourceUrl = url.trim();
      if (sizeSqm.trim()) {
        const n = Number(sizeSqm);
        if (!Number.isFinite(n) || n <= 0) throw new Error("Size must be a positive number");
        body.sizeM2 = Math.floor(n);
      }
      if (price.trim()) {
        const cleaned = price.replace(/[\s,]/g, "");
        const n = Number(cleaned);
        if (!Number.isFinite(n) || n <= 0) throw new Error("Price must be a positive number");
        body.priceAmount = Math.floor(n);
      }
      if (agentName.trim()) body.agentName = agentName.trim();
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch("/api/plots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      if (data.deduped) {
        setInfo("Updated existing listing.");
      } else {
        setInfo("Saved.");
      }
      const saved = data.plot as PlotCard | undefined;
      if (saved) onSaved(saved);
      // Brief delay so the user sees the "Saved" message, then close.
      setTimeout(() => {
        onSaved(saved as PlotCard);
        onClose();
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save listing");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-add-listing-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-atlas-border bg-atlas-surface p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-atlas-muted transition-colors hover:bg-atlas-surface2 hover:text-atlas-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <h2 id="atlas-add-listing-title" className="mb-1 text-lg font-semibold text-atlas-text">
          Add a listing to this area
        </h2>
        <p className="mb-4 text-xs text-atlas-muted">
          Listings you add are private to you. v2 will add team sharing.
        </p>

        <form onSubmit={submit} className="space-y-3">
          {/* URL paste section */}
          <div className="rounded-lg border border-atlas-border bg-atlas-bg p-3">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
              Paste a Property24 URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlTouched(false);
                  setParsed(null);
                  setInfo(null);
                }}
                placeholder="https://www.property24.com/for-sale/sandton/johannesburg/..."
                className="flex-1 rounded-md border border-atlas-border bg-atlas-surface px-2.5 py-1.5 text-xs text-atlas-text placeholder:text-atlas-muted/50 focus:border-atlas-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={parseUrl}
                disabled={!url.trim()}
                className="rounded-md border border-atlas-border bg-atlas-surface px-3 py-1.5 text-xs font-medium text-atlas-text transition-colors hover:border-atlas-accent disabled:opacity-50"
              >
                Parse URL
              </button>
            </div>
            {parsed && (
              <p className="mt-1.5 text-[10px] text-emerald-300">
                ✓ Detected: {parsed.suburb}, {parsed.city} ({parsed.listingType})
              </p>
            )}
            {urlTouched && !parsed && url && (
              <p className="mt-1.5 text-[10px] text-atlas-muted">
                Not a Property24 URL — fill the form below manually.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-atlas-border" />
            <span className="text-[10px] uppercase tracking-wider text-atlas-muted">
              or fill in manually
            </span>
            <div className="h-px flex-1 bg-atlas-border" />
          </div>

          {/* Manual fields */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Suburb *">
              <input
                type="text"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                placeholder="Sandton CBD"
                required
                className="w-full rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text placeholder:text-atlas-muted/50 focus:border-atlas-accent focus:outline-none"
              />
            </Field>
            <Field label="City *">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Sandton"
                required
                className="w-full rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text placeholder:text-atlas-muted/50 focus:border-atlas-accent focus:outline-none"
              />
            </Field>
            <Field label="Country">
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="South Africa"
                className="w-full rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text placeholder:text-atlas-muted/50 focus:border-atlas-accent focus:outline-none"
              />
            </Field>
            <Field label="Size (m²)">
              <input
                type="text"
                inputMode="numeric"
                value={sizeSqm}
                onChange={(e) => setSizeSqm(e.target.value)}
                placeholder="1,250"
                className="w-full rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text placeholder:text-atlas-muted/50 focus:border-atlas-accent focus:outline-none"
              />
            </Field>
            <Field label="Price">
              <input
                type="text"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="4,200,000"
                className="w-full rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text placeholder:text-atlas-muted/50 focus:border-atlas-accent focus:outline-none"
              />
            </Field>
            <Field label="Currency">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text focus:border-atlas-accent focus:outline-none"
              >
                {VALID_CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Listing type">
              <select
                value={listingType}
                onChange={(e) => setListingType(e.target.value)}
                className="w-full rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text focus:border-atlas-accent focus:outline-none"
              >
                {VALID_LISTING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Agent">
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Chas Everitt Sandton"
                className="w-full rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text placeholder:text-atlas-muted/50 focus:border-atlas-accent focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
              rows={2}
              placeholder="Mentioned by John Smith, +27 11 ... / 5km from highway on-ramp"
              className="w-full resize-none rounded-md border border-atlas-border bg-atlas-bg px-2.5 py-1.5 text-xs text-atlas-text placeholder:text-atlas-muted/50 focus:border-atlas-accent focus:outline-none"
            />
          </Field>

          {error && (
            <p className="text-[11px] text-rose-300">{error}</p>
          )}
          {info && !error && (
            <p className="text-[11px] text-emerald-300">{info}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-atlas-border bg-atlas-bg px-3 py-1.5 text-xs font-medium text-atlas-muted transition-colors hover:border-atlas-accent hover:text-atlas-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-atlas-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-atlas-accent2 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save listing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-atlas-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
