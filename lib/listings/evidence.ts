import { fetchLiveListings, type LiveListing } from "@/lib/connectors/tavily-listings";
import type { ListingEvidence } from "@/lib/models/types";
import { withTimeout } from "@/lib/util/timeout";

export const LISTING_EVIDENCE_TIMEOUT_MS = 8_000;

export type ListingEvidenceFetchResult = {
  evidence: ListingEvidence[];
  liveListings: LiveListing[];
  diagnostic?: "listing_evidence_gap";
};

function normalizeListing(listing: LiveListing, fetchedAt: string): ListingEvidence | null {
  if (!listing.id || !listing.url || !listing.title) return null;
  return {
    id: listing.id,
    portal: listing.portal,
    url: listing.url,
    title: listing.title.slice(0, 240),
    city: listing.city || null,
    suburb: listing.suburb,
    address: listing.address,
    priceAmount: listing.priceAmount,
    priceDisplay: listing.price,
    currency: listing.priceAmount != null || listing.price ? "ZAR" : null,
    erfSize: listing.erfSize,
    erfSizeM2: listing.erfSizeM2,
    fetchedAt: listing.fetchedAt ?? fetchedAt,
  };
}

export async function fetchListingEvidence(opts: {
  city: { name: string; country: string };
  suburb: string | null;
  vertical: string;
  question: string;
}): Promise<ListingEvidenceFetchResult> {
  try {
    const fetchedAt = new Date().toISOString();
    const listings = await withTimeout(
      fetchLiveListings({
        city: { id: "", name: opts.city.name, country: opts.city.country },
        suburb: opts.suburb,
        vertical: opts.vertical,
        question: opts.question,
        creditBudget: 6,
        maxListings: 3,
      }),
      LISTING_EVIDENCE_TIMEOUT_MS,
      "listing-evidence",
    );
    const fetchedListings = listings.map((listing) => ({ ...listing, fetchedAt }));
    const evidence = fetchedListings
      .map((listing) => normalizeListing(listing, fetchedAt))
      .filter((item): item is ListingEvidence => item !== null)
      .slice(0, 4);
    return evidence.length > 0
      ? { evidence, liveListings: fetchedListings.slice(0, 4) }
      : { evidence: [], liveListings: [], diagnostic: "listing_evidence_gap" };
  } catch {
    // Deliberately do not return upstream messages or bodies to the client/model.
    return { evidence: [], liveListings: [], diagnostic: "listing_evidence_gap" };
  }
}
