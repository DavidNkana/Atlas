"use client";

/**
 * Atlas — Listings Overlay (Path 4, Day 10+).
 *
 * The "Listings I know about in this area" section on the result
 * page. Shows each user-added plot as a card with price, size,
 * agent, and a link to the original Property24 URL. The user can
 * add more listings via the "+ Add a listing" button.
 *
 * Plots are private to the user. They live in the Plot table
 * scoped by userId + questionId. When a plot is added, we
 * optimistically prepend it to the local state so the UI updates
 * instantly; on save error we roll back.
 */

import { useState } from "react";
import { AddListingModal } from "./AddListingModal";

export interface PlotCard {
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

export function ListingsOverlay({
  questionId,
  initialPlots,
}: {
  questionId: string;
  initialPlots: PlotCard[];
}) {
  const [plots, setPlots] = useState<PlotCard[]>(initialPlots);
  const [modalOpen, setModalOpen] = useState(false);

  function onSaved(newPlot: PlotCard) {
    // Dedupe: if the same id is already in the list, replace it
    // (the API returns the updated row when a sourceUrl already
    // exists). Otherwise prepend.
    setPlots((prev) => {
      const idx = prev.findIndex((p) => p.id === newPlot.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = newPlot;
        return next;
      }
      return [newPlot, ...prev];
    });
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-atlas-text">
            Listings in this area
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-atlas-muted">
            {plots.length} {plots.length === 1 ? "plot" : "plots"} you know about
          </span>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-atlas-accent/40 bg-atlas-accent/10 px-3 py-1.5 text-xs font-medium text-atlas-accent transition-colors hover:bg-atlas-accent/20"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add a listing
        </button>
      </div>

      {plots.length === 0 ? (
        <div className="rounded-md border border-dashed border-atlas-border bg-atlas-surface/50 p-6 text-center">
          <p className="text-xs text-atlas-muted">
            No listings yet. Add a Property24 URL you&apos;re watching, or fill
            in the details of a plot you know about. Listings are private to
            you.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {plots.map((p) => (
            <PlotListItem key={p.id} plot={p} />
          ))}
        </ol>
      )}

      {modalOpen && (
        <AddListingModal
          questionId={questionId}
          onClose={() => setModalOpen(false)}
          onSaved={(plot) => onSaved(plot)}
        />
      )}
    </section>
  );
}

function PlotListItem({ plot }: { plot: PlotCard }) {
  const priceStr = plot.priceAmount != null
    ? formatMoney(plot.priceAmount, plot.currency)
    : "Price on request";
  const sizeStr = plot.sizeM2 != null
    ? `${plot.sizeM2.toLocaleString()} m²`
    : null;
  const listingLabel = plot.listingType === "for_sale"
    ? "For sale"
    : plot.listingType === "auction"
      ? "Auction"
      : plot.listingType === "tender"
        ? "Tender"
        : "Off-market";

  return (
    <li className="rounded-md border border-atlas-border bg-atlas-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-atlas-text">
              {plot.suburb}, {plot.city}
            </h3>
            <span className="inline-flex shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              {listingLabel}
            </span>
          </div>
          <p className="text-xs text-atlas-muted">
            <span className="font-semibold text-atlas-text">{priceStr}</span>
            {sizeStr && <span> &middot; {sizeStr}</span>}
            {plot.agentName && <span> &middot; {plot.agentName}</span>}
          </p>
        </div>
        {plot.sourceUrl && (
          <a
            href={plot.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
          >
            View listing →
          </a>
        )}
      </div>
    </li>
  );
}

function formatMoney(value: number, currency: string): string {
  if (currency === "ZAR") {
    if (value >= 1_000_000) return `R ${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `R ${Math.round(value / 1_000)}K`;
    return `R ${value.toLocaleString()}`;
  }
  if (currency === "ZMW") {
    if (value >= 1_000_000) return `K ${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `K ${Math.round(value / 1_000)}K`;
    return `K ${value.toLocaleString()}`;
  }
  if (currency === "NGN") {
    if (value >= 1_000_000) return `₦ ${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `₦ ${Math.round(value / 1_000)}K`;
    return `₦ ${value.toLocaleString()}`;
  }
  if (currency === "KES") {
    if (value >= 1_000_000) return `KSh ${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `KSh ${Math.round(value / 1_000)}K`;
    return `KSh ${value.toLocaleString()}`;
  }
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${value.toLocaleString()}`;
}
