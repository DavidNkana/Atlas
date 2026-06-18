/**
 * Day 10+ — Property24 URL parser.
 *
 * Property24 listing URLs look like:
 *   https://www.property24.com/for-sale/sandton/johannesburg/sandton/b8/listing-12345
 *   https://www.property24.com/to-rent/cape-town/sea-point/p24-987654
 *   https://www.property24.com/for-sale/lusaka/lusaka/ibex-hill/p24-456789
 *
 * We can reliably extract:
 *   - city:        the second-to-last path segment before the listing id
 *   - suburb:      the segment before that (or the listing slug)
 *   - listingType: "for_sale" or "to_rent" from the first path segment
 *
 * We DON'T fetch the URL (would require server-side fetch + HTML
 * parsing, which is heavier and risks IP blocks). The user fills
 * in the price + size manually after we pre-fill the rest.
 *
 * For non-Property24 URLs we return null and the UI prompts the
 * user to fill in the form manually.
 */

export interface ParsedListingUrl {
  city: string;
  suburb: string;
  listingType: "for_sale" | "to_rent" | "auction" | "off_market";
  /** The listing ID if we can extract it — used for dedup key */
  externalId: string | null;
}

const URL_RE = /^https?:\/\/(?:www\.)?property24\.com\//i;

export function parseProperty24Url(rawUrl: string): ParsedListingUrl | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!URL_RE.test(trimmed)) return null;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }

  // /for-sale/<suburb?>/<city>/<slug>/<id>
  // /to-rent/<suburb?>/<city>/<slug>/<id>
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  // listingType from first segment
  const typeRaw = (parts[0] ?? "").toLowerCase();
  let listingType: ParsedListingUrl["listingType"] = "for_sale";
  if (typeRaw === "to-rent" || typeRaw === "to_rent") listingType = "to_rent";
  else if (typeRaw === "auction") listingType = "auction";
  else if (typeRaw === "off-market" || typeRaw === "off_market") listingType = "off_market";

  // Find the segment that looks like a city (heuristic: the
  // segment right before the listing-id segment). Common
  // patterns:
  //   /for-sale/sandton/johannesburg/sandton/b8/listing-12345
  //   /for-sale/cape-town/sea-point/p24-987654
  //   /for-sale/lusaka/lusaka/ibex-hill/p24-456789
  //
  // Strategy: skip the type segment, then look for segments
  // that match a known city OR are 1-2 words long. Heuristic.
  const after = parts.slice(1);

  // The LAST segment is usually the listing id (e.g. "listing-12345"
  // or "p24-987654" or just a slug). We strip it.
  const last = after[after.length - 1] ?? "";
  const isIdSegment =
    /^listing-\d+$/i.test(last) ||
    /^p\d+-\d+$/i.test(last) ||
    /^p24-\d+$/i.test(last) ||
    /^b\d+$/i.test(last);
  const middle = isIdSegment ? after.slice(0, -1) : after;

  // Now the structure is [suburb, city, ...] OR [city, suburb, ...].
  // We pick the LONGER segment as the suburb (suburbs are usually
  // more specific, e.g. "sandton-cbd" vs "sandton" city).
  // If we can't decide, we use the second segment as the city.
  if (middle.length === 1) {
    return {
      city: humanize(middle[0]),
      suburb: humanize(middle[0]),
      listingType,
      externalId: last || null,
    };
  }
  if (middle.length === 2) {
    return {
      city: humanize(middle[1]),
      suburb: humanize(middle[0]),
      listingType,
      externalId: last || null,
    };
  }
  // 3+ segments: take first as suburb, second as city. Discard the
  // rest (often a sub-area or a slug).
  return {
    city: humanize(middle[1]),
    suburb: humanize(middle[0]),
    listingType,
    externalId: last || null,
  };
}

/**
 * "sandton-cbd" → "Sandton CBD", "sea-point" → "Sea Point".
 * Strips dashes/underscores and title-cases each word.
 */
function humanize(slug: string): string {
  if (!slug) return "";
  return slug
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ")
    .trim();
}

/**
 * Detect currency from the URL host. Property24 has country-
 * specific subdomains (.co.za, .co.zm, .co.ke, .com.ng, etc.).
 * Returns null for the international .com domain.
 */
export function currencyFromUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.endsWith(".co.za") || host.includes("southafrica")) return "ZAR";
  if (host.endsWith(".co.zm") || host.includes("zambia")) return "ZMW";
  if (host.endsWith(".co.ke") || host.includes("kenya")) return "KES";
  if (host.endsWith(".com.ng") || host.includes("nigeria")) return "NGN";
  return null;
}
