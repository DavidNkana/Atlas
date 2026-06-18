"use client";

/**
 * Atlas — Listings Overlay (Path 4, Day 10+; Day 11 cross-user).
 *
 * The "Listings in this area" section on the result page. Shows:
 *   - The user's own plots first (full data, can edit/share)
 *   - Then other Atlas users' published plots (data fields
 *     only by default, contact fields only if the owner
 *     explicitly opted in via revealContact)
 *
 * Plots are private to their owner by default. The user can
 * toggle publishToMarket + revealContact on a per-listing basis
 * via the AddListingModal.
 */

import { useState } from "react";
import { AddListingModal } from "./AddListingModal";
import type { PlotCard as ModalPlotCard } from "./AddListingModal";

// The ListingsOverlay's PlotCard extends the modal's PlotCard
// with privacy flags + an ownership marker. Market plots come
// in pre-filtered from the server; the modal's onSaved returns
// the unflagged base shape.
export interface PlotCard extends ModalPlotCard {
  // Privacy flags — only present on owner plots. Market plots
  // are already pre-filtered server-side.
  publishToMarket?: boolean;
  revealContact?: boolean;
  notes?: string | null;
  ownership: "owner" | "market";
}

export function ListingsOverlay({
  questionId,
  initialOwner,
  initialMarket,
  cityFilter,
}: {
  questionId: string;
  initialOwner: PlotCard[];
  initialMarket: PlotCard[];
  cityFilter: string | null;
}) {
  const [owner, setOwner] = useState<PlotCard[]>(initialOwner);
  const [market] = useState<PlotCard[]>(initialMarket);
  const [modalOpen, setModalOpen] = useState(false);

  function onSaved(newPlot: ModalPlotCard) {
    // Dedupe + prepend for the owner's list. The new plot is
    // always an owner plot (the user just added it). The
    // AddListingModal hands us a PlotCard without the
    // `ownership` marker, so we add it here.
    const owned: PlotCard = { ...newPlot, ownership: "owner" as const };
    setOwner((prev) => {
      const idx = prev.findIndex((p) => p.id === owned.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = owned;
        return next;
      }
      return [owned, ...prev];
    });
  }

  const total = owner.length + market.length;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-atlas-text">
            Listings in this area
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-atlas-muted">
            {owner.length} yours &middot; {market.length} from other Atlas users
            {cityFilter ? ` · ${cityFilter}` : ""}
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

      {total === 0 ? (
        <div className="rounded-md border border-dashed border-atlas-border bg-atlas-surface/50 p-6 text-center">
          <p className="text-xs text-atlas-muted">
            No listings yet. Add a Property24 URL you&apos;re watching, or fill
            in the details of a plot you know about. Listings you add are
            shared with the Atlas market by default (you can toggle this off).
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {owner.map((p) => (
            <PlotListItem key={p.id} plot={p} />
          ))}
          {market.length > 0 && owner.length > 0 && (
            <li className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-atlas-muted">
              <div className="h-px flex-1 bg-atlas-border" />
              <span>From other Atlas users</span>
              <div className="h-px flex-1 bg-atlas-border" />
            </li>
          )}
          {market.map((p) => (
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

  const isMarket = plot.ownership === "market";

  return (
    <li
      className={`rounded-md border p-3 ${
        isMarket
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-atlas-border bg-atlas-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-atlas-text">
              {plot.suburb}, {plot.city}
            </h3>
            <span
              className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isMarket
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {listingLabel}
            </span>
            {isMarket && (
              <span className="inline-flex shrink-0 rounded-full bg-atlas-surface px-2 py-0.5 text-[10px] font-medium text-atlas-muted">
                Atlas market
              </span>
            )}
            {!isMarket && plot.publishToMarket === false && (
              <span className="inline-flex shrink-0 rounded-full bg-atlas-surface px-2 py-0.5 text-[10px] font-medium text-atlas-muted">
                Private
              </span>
            )}
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
