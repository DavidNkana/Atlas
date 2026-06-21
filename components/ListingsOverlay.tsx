"use client";

/**
 * Atlas — Listings Overlay (Path 4, Day 10+; Day 11 cross-user;
 * Day 22 v15 — Tavily live portal listings).
 *
 * The "Listings in this area" section on the result page. Shows:
 *   - The user's own plots first (full data, can edit/share)
 *   - Other Atlas users' published plots
 *   - Day 22 v15: live listings from SA property portals
 *     (Property24, Private Property, Pam Golding, Seeff, Gumtree,
 *     BidX1, Chas Everitt) via Tavily. Agent names redacted.
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

/**
 * Day 22 v15: live portal listing. Lighter than the
 * LiveListingsGrid card — same data fields but uses PlotCard-
 * style listing-row rendering so it sits naturally next to
 * owner + market plots in this section.
 */
export interface TavilyListing {
  id: string;
  suburb: string | null;
  portal: string;
  url: string;
  price: string | null;
  erfSize: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  address: string | null;
  title: string;
  matchTier: 1 | 2 | 3;
}

const PORTAL_LABEL: Record<string, string> = {
  property24: "Property24",
  privateproperty: "Private Property",
  gumtree: "Gumtree",
  bidx1: "BidX1",
  pamgolding: "Pam Golding",
  seeff: "Seeff",
  chaseveritt: "Chas Everitt",
};

const PORTAL_BADGE: Record<string, string> = {
  property24: "bg-blue-500/15 text-blue-300",
  privateproperty: "bg-purple-500/15 text-purple-300",
  gumtree: "bg-emerald-500/15 text-emerald-300",
  bidx1: "bg-amber-500/15 text-amber-300",
  pamgolding: "bg-rose-500/15 text-rose-300",
  seeff: "bg-cyan-500/15 text-cyan-300",
  chaseveritt: "bg-indigo-500/15 text-indigo-300",
};

export function ListingsOverlay({
  questionId,
  initialOwner,
  initialMarket,
  initialTavilyListings,
  cityFilter,
}: {
  questionId: string;
  initialOwner: PlotCard[];
  initialMarket: PlotCard[];
  initialTavilyListings?: TavilyListing[];
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

  // Day 22 v15: filter Tavily listings to drop banner/junk entries.
  // An entry is "real" if it has any of: price, erf size, address,
  // or a meaningful (non-banner) title.
  const realTavilyListings: TavilyListing[] = (initialTavilyListings ?? []).filter((l) => {
    const hasPrice = !!l.price;
    const hasErf = !!l.erfSize;
    const hasAddress = !!l.address;
    const hasRealTitle =
      !!l.title &&
      l.title.length >= 15 &&
      !l.title.toLowerCase().includes("property alerts") &&
      !l.title.toLowerCase().includes("get instant") &&
      !l.title.toLowerCase().includes("listing number") &&
      !l.title.toLowerCase().includes("calculate bond") &&
      !l.title.toLowerCase().includes("monthly bond") &&
      !l.title.toLowerCase().includes("my properties") &&
      !l.title.toLowerCase().includes("property alerts");
    return hasPrice || hasErf || hasAddress || hasRealTitle;
  });

  const total = owner.length + market.length + realTavilyListings.length;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-atlas-text">
            Listings in this area
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-atlas-muted">
            {owner.length} yours &middot; {market.length} from other Atlas users
            {realTavilyListings.length > 0
              ? ` · ${realTavilyListings.length} from SA portals`
              : ""}
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

      {/* Day 22 v15: live portal listings rendered as a third
          subsection underneath owner + market plots. Click any
          "View listing →" to open the actual portal page. */}
      {realTavilyListings.length > 0 && (
        <div className="mt-4 border-t border-atlas-border/40 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
              From SA property portals
            </h3>
            <span className="font-mono text-[9px] text-atlas-muted">
              Powered by Tavily
            </span>
          </div>
          <ol className="space-y-2">
            {realTavilyListings.map((l) => (
              <li
                key={l.id}
                className="flex items-baseline justify-between gap-3 rounded border border-atlas-border/40 bg-atlas-surface/40 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                        PORTAL_BADGE[l.portal] ?? "bg-zinc-500/15 text-zinc-300"
                      }`}
                    >
                      {PORTAL_LABEL[l.portal] ?? l.portal}
                    </span>
                    {l.matchTier === 1 && (
                      <span className="font-mono text-[9px] text-emerald-400">exact</span>
                    )}
                    {l.matchTier === 2 && (
                      <span className="font-mono text-[9px] text-amber-400">fuzzy</span>
                    )}
                    {/* Day 22 v17: AI-evaluated match score */}
                    {typeof (l as any).matchScore === "number" && (
                      <span
                        className={`font-mono text-[9px] ${
                          (l as any).matchScore >= 0.8
                            ? "text-emerald-400"
                            : (l as any).matchScore >= 0.6
                              ? "text-amber-400"
                              : "text-atlas-muted"
                        }`}
                        title={
                          Array.isArray((l as any).matchReasons)
                            ? (l as any).matchReasons.join(" · ")
                            : ""
                        }
                      >
                        match {Math.round(((l as any).matchScore as number) * 100)}%
                      </span>
                    )}
                  </div>
                  {(l as any).disqualifyReason && (
                    <p className="mt-0.5 font-mono text-[9px] text-rose-400">
                      ⚠ {(l as any).disqualifyReason}
                    </p>
                  )}
                  <p className="mt-1 truncate text-atlas-text">{l.title}</p>
                  {l.address && (
                    <p className="truncate font-mono text-[10px] text-atlas-muted">
                      {l.address}
                    </p>
                  )}
                  <p className="mt-0.5 text-atlas-muted">
                    {l.suburb && <span>{l.suburb}</span>}
                    {l.price && (
                      <span className="text-atlas-text"> · {l.price}</span>
                    )}
                    {l.erfSize && <span> · {l.erfSize}</span>}
                    {l.bedrooms && ` · ${l.bedrooms} bed`}
                    {l.bathrooms && ` · ${l.bathrooms} bath`}
                  </p>
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded border border-atlas-accent bg-atlas-accent/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-atlas-text transition hover:bg-atlas-accent hover:text-white"
                >
                  View listing →
                </a>
              </li>
            ))}
          </ol>
        </div>
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
