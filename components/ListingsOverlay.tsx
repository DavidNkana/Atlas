"use client";

/**
 * Atlas — Listings Overlay (Day 10+ Path 4; Day 11 cross-user;
 * Day 22 v15 — Tavily live portal listings; Day 23 — visual redesign).
 *
 * The "Listings in this area" section on the result page. Two layouts
 * based on data source:
 *
 *   1. **YOUR LISTINGS** (Atlas user-added plots — owner's own + other
 *      users' market plots): rendered as a HORIZONTAL BELT that
 *      scrolls left/right with two buttons (prev/next) anchored at
 *      each end. Each card shows image (placeholder SVG), title (suburb
 *      + city), price (formatted per currency), and listing type
 *      badge.
 *
 *   2. **FROM SA PROPERTY PORTALS** (Tavily listings): rendered as a
 *      GRID (3 columns on desktop, 1 on mobile). Same card structure
 *      with image placeholder, portal badge, title, price.
 *
 * Day 23 visual upgrade — image placeholders. The Plot schema and
 * Tavily response don't carry image URLs, so each card renders a
 * generated SVG hero (house for for_sale, gavel for auction, document
 * for tender, lock for off-market, etc.) styled with the appropriate
 * gradient. Real images can be wired in later without changing the
 * component API.
 *
 * Plots are private to their owner by default. The user can toggle
 * `publishToMarket` + `revealContact` per-listing via AddListingModal.
 */

import { useEffect, useRef, useState } from "react";
import { AddListingModal } from "./AddListingModal";
import type { PlotCard as ModalPlotCard } from "./AddListingModal";

// ListingsOverlay's PlotCard extends the modal's PlotCard with
// privacy flags + an ownership marker. Market plots come in
// pre-filtered from the server.
export interface PlotCard extends ModalPlotCard {
  publishToMarket?: boolean;
  revealContact?: boolean;
  notes?: string | null;
  ownership: "owner" | "market";
}

// Day 22 v15: Tavily live portal listing. Lighter than the
// LiveListingsGrid card — same data fields, same card structure.
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
  property24: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  privateproperty: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  gumtree: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  bidx1: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  pamgolding: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  seeff: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  chaseveritt: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

// Day 23 — Hero placeholder SVG for a listing card. The visual
// depends on listingType so the user gets a different vibe per
// category: for_sale (house), auction (gavel), tender (document),
// off-market (lock). Falls back to a generic home icon if unknown.
function ListingHero({
  type,
  isOwner,
}: {
  type: string | null | undefined;
  isOwner?: boolean;
}) {
  const t = (type ?? "").toLowerCase();
  const gradient = isOwner
    ? "from-atlas-accent/30 to-atlas-accent2/20"
    : "from-emerald-500/25 to-emerald-700/15";
  return (
    <div
      className={`relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br ${gradient}`}
    >
      <svg
        viewBox="0 0 80 60"
        className="absolute inset-0 m-auto h-3/5 w-3/5 text-atlas-text/60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {t === "auction" ? (
          <>
            <path d="M 14 22 L 40 8 L 66 22" />
            <line x1="40" y1="8" x2="40" y2="36" />
            <path d="M 28 36 L 52 36" />
            <line x1="34" y1="42" x2="46" y2="42" />
            <line x1="40" y1="36" x2="40" y2="50" />
          </>
        ) : t === "tender" ? (
          <>
            <rect x="18" y="14" width="44" height="36" rx="2" />
            <line x1="18" y1="24" x2="62" y2="24" />
            <line x1="18" y1="32" x2="62" y2="32" />
            <line x1="18" y1="40" x2="48" y2="40" />
          </>
        ) : t === "off-market" || t === "private" ? (
          <>
            <rect x="26" y="28" width="28" height="20" rx="2" />
            <path d="M 32 28 L 32 22 Q 32 14 40 14 Q 48 14 48 22 L 48 28" />
            <circle cx="40" cy="38" r="2" fill="currentColor" />
            <line x1="40" y1="40" x2="40" y2="44" />
          </>
        ) : (
          // default: for_sale — house icon
          <>
            <path d="M 14 32 L 40 14 L 66 32" />
            <path d="M 18 30 L 18 50 L 62 50 L 62 30" />
            <rect x="34" y="38" width="12" height="12" />
            <line x1="40" y1="38" x2="40" y2="50" />
          </>
        )}
      </svg>
      {/* subtle vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-atlas-bg/40 via-transparent to-transparent" />
    </div>
  );
}

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

  // Filter Tavily listings to drop banner/junk entries.
  const realTavilyListings: TavilyListing[] = (initialTavilyListings ?? []).filter(
    (l) => {
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
        !l.title.toLowerCase().includes("my properties");
      return hasPrice || hasErf || hasAddress || hasRealTitle;
    },
  );

  return (
    <section className="mt-6">
      <Header
        ownerCount={owner.length}
        marketCount={market.length}
        tavilyCount={realTavilyListings.length}
        cityFilter={cityFilter}
        onAddClick={() => setModalOpen(true)}
      />

      {owner.length + market.length > 0 && (
        <ListingsBelt
          owner={owner}
          market={market}
          cityFilter={cityFilter}
        />
      )}

      {realTavilyListings.length > 0 && (
        <TavilyListingsGrid listings={realTavilyListings} />
      )}

      {owner.length === 0 &&
        market.length === 0 &&
        realTavilyListings.length === 0 && (
          <EmptyState />
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

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Header({
  ownerCount,
  marketCount,
  tavilyCount,
  cityFilter,
  onAddClick,
}: {
  ownerCount: number;
  marketCount: number;
  tavilyCount: number;
  cityFilter: string | null;
  onAddClick: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-atlas-text">
          Listings in this area
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-atlas-muted">
          {ownerCount} yours · {marketCount} from Atlas users
          {tavilyCount > 0 ? ` · ${tavilyCount} from SA portals` : ""}
          {cityFilter ? ` · ${cityFilter}` : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={onAddClick}
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
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add a listing
      </button>
    </div>
  );
}

/* Day 23 — Horizontal belt of listings. Owner plots first, then
   market plots separated by a subtle divider. Each card is 288px
   wide, scrolls horizontally with prev/next buttons anchored at
   each end. Buttons disable when there's nothing to scroll to. */
function ListingsBelt({
  owner,
  market,
  cityFilter,
}: {
  owner: PlotCard[];
  market: PlotCard[];
  cityFilter: string | null;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [owner.length, market.length]);

  function scrollByOne(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    // Scroll by ~one card width + gap. Each card is w-72 (288px) +
    // gap-3 (12px) = 300px. Use 320 to clear one card comfortably.
    el.scrollBy({ left: direction * 320, behavior: "smooth" });
  }

  return (
    <div className="relative mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
          Your listings
        </h3>
        <span className="font-mono text-[10px] text-atlas-muted">
          {owner.length + market.length} listing
          {owner.length + market.length === 1 ? "" : "s"}
          {cityFilter ? ` · ${cityFilter}` : ""}
        </span>
      </div>
      <div className="relative">
        {/* Left arrow */}
        <button
          type="button"
          onClick={() => scrollByOne(-1)}
          disabled={!canScrollLeft}
          aria-label="Scroll listings left"
          className={`absolute -left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-atlas-border bg-atlas-surface text-atlas-text shadow-lg transition ${
            canScrollLeft
              ? "hover:border-atlas-accent hover:text-atlas-accent"
              : "opacity-30 cursor-not-allowed"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Belt */}
        <div
          ref={scrollerRef}
          className="flex gap-3 overflow-x-auto overflow-y-hidden scroll-smooth px-1 py-2 [scrollbar-width:thin]"
          style={{ scrollbarColor: "rgba(99,102,241,0.4) transparent" }}
        >
          {owner.map((p) => (
            <PlotCardBelt key={p.id} plot={p} variant="owner" />
          ))}
          {market.length > 0 && owner.length > 0 && (
            // Divider between owner and market — small "from Atlas users" tag
            <div className="flex shrink-0 items-center justify-center self-stretch px-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/70 [writing-mode:vertical-rl]">
                Atlas&nbsp;users
              </span>
            </div>
          )}
          {market.map((p) => (
            <PlotCardBelt key={p.id} plot={p} variant="market" />
          ))}
        </div>

        {/* Right arrow */}
        <button
          type="button"
          onClick={() => scrollByOne(1)}
          disabled={!canScrollRight}
          aria-label="Scroll listings right"
          className={`absolute -right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-atlas-border bg-atlas-surface text-atlas-text shadow-lg transition ${
            canScrollRight
              ? "hover:border-atlas-accent hover:text-atlas-accent"
              : "opacity-30 cursor-not-allowed"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function PlotCardBelt({
  plot,
  variant,
}: {
  plot: PlotCard;
  variant: "owner" | "market";
}) {
  const priceStr =
    plot.priceAmount != null
      ? formatMoney(plot.priceAmount, plot.currency)
      : "Price on request";
  const sizeStr =
    plot.sizeM2 != null ? `${plot.sizeM2.toLocaleString()} m²` : null;
  const listingLabel = plot.listingType === "for_sale"
    ? "For sale"
    : plot.listingType === "auction"
      ? "Auction"
      : plot.listingType === "tender"
        ? "Tender"
        : "Off-market";

  return (
    <article
      className={`relative flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-atlas-surface transition hover:border-atlas-accent/60 ${
        variant === "market"
          ? "border-emerald-500/30"
          : "border-atlas-border"
      }`}
    >
      <ListingHero type={plot.listingType} isOwner={variant === "owner"} />

      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-atlas-text">
            {plot.suburb}, {plot.city}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              variant === "market"
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {listingLabel}
          </span>
          {variant === "market" && (
            <span className="inline-flex shrink-0 rounded-full bg-atlas-surface px-2 py-0.5 text-[10px] font-medium text-atlas-muted">
              Atlas market
            </span>
          )}
        </div>

        <p className="text-sm">
          <span className="font-semibold text-atlas-text">{priceStr}</span>
          {sizeStr && (
            <span className="text-atlas-muted"> · {sizeStr}</span>
          )}
        </p>

        {plot.agentName && (
          <p className="truncate text-[10px] text-atlas-muted">
            {plot.agentName}
          </p>
        )}

        <ListingCtaButton plot={plot} />
      </div>
    </article>
  );
}

/**
 * Day 23 — Listing CTA button.
 *
 * Renders the bottom-right action on a plot card. Three modes:
 *   1. plot has sourceUrl → "View listing" link, opens portal in new tab
 *   2. no sourceUrl but has lat/lng → "View on map" link, opens Google Maps
 *   3. no sourceUrl and no lat/lng → "No link available" small tag
 *
 * Renders as an inline-flex pill. Kept tiny (h-6) so it doesn't crowd
 * the card. For a future iteration: capture click events on the whole
 * card via onClick on the parent <article>, but that requires hoisting
 * state up to the result page.
 */
function ListingCtaButton({ plot }: { plot: PlotCard }) {
  if (plot.sourceUrl) {
    return (
      <a
        href={plot.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 self-start rounded border border-atlas-accent/40 bg-atlas-accent/10 px-2.5 py-1 text-[10px] font-medium text-atlas-accent transition hover:bg-atlas-accent/20"
      >
        View listing
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </a>
    );
  }
  // No URL — fall back to Google Maps using lat/lng if available.
  if (plot.lat != null && plot.lng != null) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${plot.lat},${plot.lng}`;
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 self-start rounded border border-atlas-border bg-atlas-bg px-2.5 py-1 text-[10px] font-medium text-atlas-muted transition hover:border-atlas-accent hover:text-atlas-text"
        title={`Open ${plot.suburb ?? "this location"} on Google Maps`}
      >
        View on map
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </a>
    );
  }
  // Last resort — no link available at all.
  return (
    <span className="mt-1.5 inline-flex items-center self-start rounded border border-dashed border-atlas-border/60 px-2.5 py-1 text-[10px] text-atlas-muted">
      No link available
    </span>
  );
}

/* Day 23 — Grid of Tavily (SA portal) listings. 3-col on desktop,
   2-col on tablet, 1-col on mobile. Same card shape as the belt
   cards but in a grid layout. */
function TavilyListingsGrid({ listings }: { listings: TavilyListing[] }) {
  return (
    <div className="mt-4 border-t border-atlas-border/40 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-atlas-muted">
          From SA property portals
        </h3>
        <span className="font-mono text-[10px] text-atlas-muted">
          {listings.length} listing{listings.length === 1 ? "" : "s"} · powered by Tavily
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <TavilyCard key={l.id} listing={l} />
        ))}
      </ul>
    </div>
  );
}

function TavilyCard({ listing: l }: { listing: TavilyListing }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-atlas-border bg-atlas-surface transition hover:border-atlas-accent/60">
      <ListingHero type="for_sale" />

      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
              PORTAL_BADGE[l.portal] ??
              "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
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
        </div>

        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-atlas-text">
          {l.title}
        </p>

        {l.address && (
          <p className="truncate font-mono text-[10px] text-atlas-muted">
            {l.address}
          </p>
        )}

        <p className="text-sm">
          {l.suburb && (
            <span className="text-atlas-muted">{l.suburb}</span>
          )}
          {l.price && (
            <span className="font-semibold text-atlas-text">
              {l.suburb ? " · " : ""}
              {l.price}
            </span>
          )}
          {l.erfSize && <span className="text-atlas-muted"> · {l.erfSize}</span>}
        </p>

        {(l.bedrooms || l.bathrooms) && (
          <p className="text-[10px] text-atlas-muted">
            {l.bedrooms ? `${l.bedrooms} bed` : ""}
            {l.bedrooms && l.bathrooms ? " · " : ""}
            {l.bathrooms ? `${l.bathrooms} bath` : ""}
          </p>
        )}

        <a
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 self-start rounded border border-atlas-accent/40 bg-atlas-accent/10 px-2.5 py-1 text-[10px] font-medium text-atlas-accent transition hover:bg-atlas-accent/20"
        >
          View listing
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        </a>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-atlas-border bg-atlas-surface/50 p-6 text-center">
      <p className="text-xs text-atlas-muted">
        No listings yet. Add a Property24 URL you&apos;re watching, or fill
        in the details of a plot you know about. Listings you add are
        shared with the Atlas market by default (you can toggle this off).
      </p>
    </div>
  );
}

function formatMoney(value: number, currency: string): string {
  const compact = (v: number, suffix: string) =>
    v >= 1_000_000
      ? `${currency} ${(v / 1_000_000).toFixed(2)}M`
      : v >= 1_000
        ? `${currency} ${Math.round(v / 1_000)}K`
        : `${currency} ${v.toLocaleString()}`;
  if (currency === "ZAR") return compact(value, "R").replace(/^R /, "R ").replace(/R /, "R ");
  if (currency === "ZMW") return compact(value, "K");
  if (currency === "NGN") return compact(value, "₦");
  if (currency === "KES") return compact(value, "KSh");
  return compact(value, currency);
}
