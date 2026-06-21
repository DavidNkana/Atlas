"use client";

/**
 * Day 22 v15 — Top-level Live Listings grid.
 *
 * Renders ALL live listings from the response as a dedicated
 * section on the result page. Lives ABOVE the ranked sites so
 * developers see it even if per-site wiring has bugs.
 *
 * Per-listing card shows:
 *   - Portal badge (Property24 / Private Property / Pam Golding / etc)
 *   - Match tier (exact / fuzzy / city)
 *   - Title + address
 *   - Price + erf size
 *   - "View →" link to the actual portal page
 */

interface LiveListing {
  id: string;
  suburb: string | null;
  portal: string;
  url: string;
  price: string | null;
  erfSize: string | null;
  erfSizeM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  address: string | null;
  title: string;
  snippet: string;
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

export default function LiveListingsGrid({
  listings,
  cityName,
}: {
  listings: LiveListing[];
  cityName: string | null;
}) {
  if (!listings || listings.length === 0) return null;

  // Filter out junk entries (no price AND no erfSize AND no address
  // AND no real title — those are banner fragments from grid pages)
  const real = listings.filter((l) => {
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
      !l.title.toLowerCase().includes("monthly bond");
    return hasPrice || hasErf || hasAddress || hasRealTitle;
  });

  if (real.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-atlas-text">
            Live listings in {cityName ?? "this area"}
          </h2>
          <p className="text-[10px] text-atlas-muted">
            {real.length} real listing{real.length === 1 ? "" : "s"} from SA property portals
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-atlas-muted">
          Powered by Tavily
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {real.map((l) => (
          <li
            key={l.id}
            className="flex flex-col gap-2 rounded border border-atlas-border/40 bg-atlas-surface/40 p-3 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                  PORTAL_BADGE[l.portal] ?? "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
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
              <p className="font-mono text-[9px] text-rose-400">
                ⚠ {(l as any).disqualifyReason}
              </p>
            )}
            {(l as any).propertyType && (
              <p className="font-mono text-[9px] uppercase tracking-wider text-atlas-muted">
                {(l as any).propertyType}
              </p>
            )}
            <p className="line-clamp-2 text-sm font-medium text-atlas-text">
              {l.title}
            </p>
            {l.address && (
              <p className="truncate font-mono text-[10px] text-atlas-muted">
                {l.address}
              </p>
            )}
            {l.suburb && (
              <p className="font-mono text-[10px] text-atlas-muted">
                {l.suburb}
                {l.erfSize ? ` · ${l.erfSize}` : ""}
              </p>
            )}
            <div className="flex items-baseline justify-between gap-2 border-t border-atlas-border/30 pt-2">
              <div className="flex flex-col">
                {l.price && (
                  <span className="font-mono text-sm font-semibold text-atlas-text">
                    {l.price}
                  </span>
                )}
                {l.bedrooms && (
                  <span className="text-[10px] text-atlas-muted">
                    {l.bedrooms} bed{l.bathrooms ? ` · ${l.bathrooms} bath` : ""}
                  </span>
                )}
              </div>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded border border-atlas-border bg-atlas-bg px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-atlas-text transition hover:border-atlas-accent hover:bg-atlas-accent hover:text-white"
              >
                View listing →
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
