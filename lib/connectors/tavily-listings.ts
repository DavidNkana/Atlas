/**
 * Day 22 — Tavily Listings connector.
 *
 * Architecture decision: Gemini Search stays 100% unchanged as
 * the reasoning engine (suburb names, prose, lat/lng). This
 * connector adds a SECOND pipeline that uses Tavily's advanced
 * search + page extraction to pull REAL per-listing data from
 * Property24 + Private Property. The two engines merge in
 * /api/ask via Promise.all — Gemini gives us the WHY, this
 * connector gives us the WHAT'S AVAILABLE.
 *
 * Why two engines, not one: Gemini's Google grounding returns
 * prose + URLs but no structured per-listing fields. Tavily
 * extract returns erf number + price + address but no prose
 * reasoning. Combined: Perplexity-shape output.
 *
 * Free tier discipline: Tavily free is 1000 credits/mo.
 * Per-query budget here is hard-capped at 10 credits:
 *   - 1 search across both portals (~5 credits)
 *   - 3 extractions on top hits (~5 credits)
 * That gives ~100 queries/mo headroom for testing + demos.
 *
 * Privacy: agent names and agency names are STRIPPED in the
 * card UI. The portal name + listing URL only. Reason: estate
 * agent contact info has POPIA exposure and Atlas hasn't
 * negotiated agency partnerships yet.
 */

import { detectCity } from "../stub/detect";

export interface LiveListing {
  id: string;
  suburb: string | null;
  city: string;
  portal: SaPortalId;
  url: string;
  price: string | null;
  priceAmount: number | null; // numeric for sorting, ZAR
  erfSize: string | null; // human-readable e.g. "2.4 ha" or "1,250 m²"
  erfSizeM2: number | null; // numeric for sorting, in m²
  bedrooms: number | null;
  bathrooms: number | null;
  address: string | null;
  title: string; // raw listing title from portal
  snippet: string; // short excerpt from the page
  matchTier: 1 | 2 | 3; // exact, fuzzy, city-only
}

export interface ListingsFetchOptions {
  city: { id: string; name: string; country: string };
  suburb: string | null;
  vertical: string;
  /** Optional price band hint from REAL_SITE_CATALOG, e.g. "R 12M - R 45M" */
  priceBand?: string | null;
  /** Optional plot size hint from REAL_SITE_CATALOG, e.g. 2.5 (hectares) */
  plotSizeHectares?: number | null;
  /** Free-tier credit cap. Default 10. */
  creditBudget?: number;
  /** Max listings per suburb. Default 3. */
  maxListings?: number;
}

interface TavilySearchHit {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
}

interface TavilyExtractResult {
  url: string;
  raw_content: string;
}

/** Map Atlas verticals → search keywords for property portals. */
const VERTICAL_KEYWORDS: Record<string, string[]> = {
  gas_station: ["gas station", "petrol station", "filling station", "fuel station"],
  restaurant: ["restaurant", "food", "hospitality"],
  warehouse: ["warehouse", "logistics", "distribution", "industrial"],
  retail_shop: ["retail", "shop", "store", "commercial"],
  residential_land: ["residential", "house", "home", "erf", "vacant land"],
  commercial_land: ["commercial", "office", "mixed use"],
  industrial_land: ["industrial", "factory", "warehouse", "erf"],
  agricultural_land: ["farm", "agricultural", "smallholding", "erf"],
  mixed_use_land: ["mixed use", "commercial residential"],
  civic_land: ["school", "clinic", "civic", "institutional", "place of worship"],
};

/**
 * Day 22 v6 — South African property portals indexed by Tavily.
 *
 * Verified 2026-06-20: each portal returns real listing URLs
 * for a vacant-land query. PropertyFinder SA returns 0 — their
 * site blocks Google/Tavily indexing — so we exclude it.
 *
 * Each entry: { domain, label, vacantLandPath }
 *   vacantLandPath is the URL slug for vacant-land searches
 *   (e.g. /vacant-land-for-sale/sandton/...). Used to build
 *   portal-specific URLs when the user wants land only.
 */
export const SA_PORTALS = [
  {
    id: "property24",
    label: "Property24",
    domain: "property24.com",
    vacantLandPath: "vacant-land-for-sale",
    salePath: "for-sale",
  },
  {
    id: "privateproperty",
    label: "Private Property",
    domain: "privateproperty.co.za",
    vacantLandPath: "land-for-sale",
    salePath: "for-sale",
  },
  {
    id: "gumtree",
    label: "Gumtree SA",
    domain: "gumtree.co.za",
    vacantLandPath: "land-plots-for-sale",
    salePath: "for-sale",
  },
  {
    id: "bidx1",
    label: "BidX1 Auctions",
    domain: "bidx1.com",
    vacantLandPath: "property-for-auction",
    salePath: "property-for-auction",
  },
  {
    id: "pamgolding",
    label: "Pam Golding",
    domain: "pamgolding.co.za",
    vacantLandPath: "vacant-land-properties-for-sale",
    salePath: "properties-for-sale",
  },
  {
    id: "seeff",
    label: "Seeff",
    domain: "seeff.com",
    vacantLandPath: "vacant-land",
    salePath: "for-sale",
  },
  {
    id: "chaseveritt",
    label: "Chas Everitt",
    domain: "chaseveritt.co.za",
    vacantLandPath: "vacant-land",
    salePath: "for-sale",
  },
] as const;

export type SaPortalId = (typeof SA_PORTALS)[number]["id"];

/**
 * Day 22 v6 — Build portal-aware search queries for ALL indexed
 * SA portals. Returns one query per portal (currently 6 indexed
 * by Tavily). Vertical keywords + city + optional price/erf.
 *
 * Vacant-land verticals (gas_station, warehouse, commercial,
 * industrial, civic) include "vacant land" as a secondary keyword
 * so portals return their vacant-land grid pages instead of houses.
 */
export function buildListingsQuery(opts: ListingsFetchOptions): {
  queries: Array<{ portal: SaPortalId; query: string; label: string }>;
} {
  const verticalKws = VERTICAL_KEYWORDS[opts.vertical] ?? ["property"];
  const primaryKw = verticalKws[0];
  const landVerticals = ["gas_station", "warehouse", "commercial_land", "industrial_land", "civic_land"];
  const wantLand = landVerticals.includes(opts.vertical);
  const secondaryKw = wantLand ? "vacant land" : verticalKws[1] ?? primaryKw;

  const city = opts.city.name;
  const locationParts = opts.suburb ? `${opts.suburb} ${city}` : city;

  let sizeHint = "";
  if (opts.plotSizeHectares && opts.plotSizeHectares >= 0.1) {
    const m2 = Math.round(opts.plotSizeHectares * 10_000);
    sizeHint = ` erf ${m2.toLocaleString()} m2`;
  }

  const base = `${primaryKw} ${secondaryKw} ${locationParts}${sizeHint}`.trim();

  return {
    queries: SA_PORTALS.map((p) => ({
      portal: p.id,
      query: `site:${p.domain} ${base}`.trim(),
      label: p.label,
    })),
  };
}

/**
 * Day 22 — Parse a price string from Property24/PrivateProperty
 * into a numeric ZAR amount. Handles "R 18,500,000", "R18.5M",
 * "R 1.8 million", etc.
 */
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = String(text).trim();
  // Match "R 18,500,000" or "R18 500 000"
  const fullMatch = t.match(/R\s*([\d,]+)\s*(?!\.)/);
  if (fullMatch) {
    const num = parseInt(fullMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(num) && num > 1000) return num;
  }
  // Match "R 1.8M" / "R 2.5 million"
  const mMatch = t.match(/R\s*([\d.]+)\s*M\b/i);
  if (mMatch) {
    return Math.round(parseFloat(mMatch[1]) * 1_000_000);
  }
  // Match "R 850K"
  const kMatch = t.match(/R\s*([\d.]+)\s*K\b/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1_000);
  }
  return null;
}

/**
 * Day 22 — Parse erf/plot size string into m².
 * Handles "2.4 ha", "2,500 m²", "1.25 hectare".
 */
export function parseErfSize(text: string | null | undefined): {
  display: string | null;
  m2: number | null;
} {
  if (!text) return { display: null, m2: null };
  const t = String(text).trim();
  // "2.4 ha" / "2.4 hectare" / "2.4 hectares"
  const haMatch = t.match(/([\d.]+)\s*(?:ha|hectare|hectares)\b/i);
  if (haMatch) {
    const ha = parseFloat(haMatch[1]);
    return { display: `${ha} ha`, m2: Math.round(ha * 10_000) };
  }
  // "1,250 m²" / "1250 sqm" / "1,250 sq m"
  const m2Match = t.match(/([\d,]+)\s*(?:m²|sqm|sq\s*m|square\s*meters?)/i);
  if (m2Match) {
    const num = parseInt(m2Match[1].replace(/,/g, ""), 10);
    return { display: `${num.toLocaleString()} m²`, m2: num };
  }
  return { display: t, m2: null };
}

/**
 * Day 22 — Parse a Property24 or PrivateProperty extracted page
 * into a LiveListing. Falls back gracefully — if any field is
 * missing, we still keep the listing with nulls (better to
 * show a partial listing than drop it).
 */
export function parseListingFromExtract(
  url: string,
  raw: string,
  portal: SaPortalId,
  cityName: string,
): LiveListing | null {
  if (!raw || raw.length < 50) return null;

  const id = `${portal}-${hashUrl(url)}`;

  // Day 22 v4: skip past the boilerplate. Property24/PrivateProperty
  // pages render a header + cookie warning + nav menu BEFORE listing
  // cards. Cut everything before the first real listing marker:
  //   - Property24 starts listings after "Property for sale in" /
  //     "Properties for sale in" / "Listed by"
  //   - PrivateProperty starts after "Property details for" / "Properties"
  // We find the EARLIEST such marker and parse from there.
  const LISTING_MARKERS = [
    /Properties for sale in\s+/i,
    /Property for sale in\s+/i,
    /Listed by\s+/i,
    /Property details for\s+/i,
    /\bListings\b.*\bfor sale\b/i,
    /\d+\s+results?\s+found/i,
    /R\s*[\d,]{6,}/i, // any 6-digit+ rand amount (real listing price)
  ];
  let cutIndex = 0;
  for (const marker of LISTING_MARKERS) {
    const m = raw.match(marker);
    if (m && typeof m.index === "number") {
      // back up a bit so we don't lose the first line of context
      cutIndex = Math.max(cutIndex, m.index - 60);
    }
  }
  // Skip the boilerplate section
  const body = raw.slice(cutIndex);

  // Price: find ALL R-amounts and pick the largest 6-digit+ one.
  // Banner text like "R 1 " from "Please note that you are using an
  // outdated browser..." has <6 digits — those are noise.
  const priceCandidates: Array<{ text: string; amount: number }> = [];
  const priceRegex = /R\s*([\d,]+(?:\.\d+)?)\s*([MKk])?\b/g;
  let pm: RegExpExecArray | null;
  while ((pm = priceRegex.exec(body)) !== null) {
    const raw_n = pm[1].replace(/,/g, "");
    const num = parseFloat(raw_n);
    if (isNaN(num)) continue;
    let amount = num;
    if (pm[2]) {
      const suffix = pm[2].toUpperCase();
      if (suffix === "M") amount = num * 1_000_000;
      else if (suffix === "K") amount = num * 1_000;
    }
    // Only accept realistic SA property prices: 100k to 500M
    if (amount < 100_000 || amount > 500_000_000) continue;
    priceCandidates.push({ text: pm[0], amount });
  }
  // Largest amount wins (real listings are R 1M+; banner noise is <R 100k)
  priceCandidates.sort((a, b) => b.amount - a.amount);
  const bestPrice = priceCandidates[0] ?? null;
  const priceText = bestPrice?.text ?? null;
  const priceAmount = bestPrice?.amount ?? null;

  // Title: find the first line after cutIndex that looks like a
  // listing description. Reject cookie/banner lines.
  const bodyLines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const TITLE_BLACKLIST = [
    /^Please note/i,
    /^Looking to/i,
    /^Sign in/i,
    /^Register/i,
    /^Cookie/i,
    /^Menu/i,
    /^Home\s*$/i,
    /^Property24/i,
    /^Private Property/i,
    /^South Africa$/i,
    /^Loading/i,
    /^Skip to/i,
    /^For sale in/i, // nav link
    /^To rent in/i,
    /^On Show/i,
    /^Auctions? in/i,
    /^Repossessions? in/i,
    /\.svg\?/i, // asset path fragments
    /^\s*on_read_more/i,
    /^\s*[a-z_]+\.svg$/i,
    /^\[?(http|https):/i, // raw URLs
    /^!\[/i, // markdown image syntax
    /subject to .+ Terms/i,
    /acebook\]/i, // markdown link fragments
    /^\s*[\w-]+\s*$/i, // single-word lines (usually nav/junk)
  ];
  let title = "Property listing";
  for (const line of bodyLines.slice(0, 80)) {
    if (line.length < 12 || line.length > 200) continue;
    if (TITLE_BLACKLIST.some((re) => re.test(line))) continue;
    // Skip lines that are just nav-link style "X in Y"
    if (/^[A-Z][a-z]+\s+in\s+[A-Z][a-z]+$/i.test(line) && line.length < 40) continue;
    // Skip pure price lines
    if (/^R\s*[\d,.]+/.test(line)) continue;
    // Skip lines that are all caps short
    if (line === line.toUpperCase() && line.length < 30) continue;
    title = line.slice(0, 140);
    break;
  }

  // Erf size — first ha or m² match in body
  const erfMatch =
    body.match(/([\d.,]+)\s*(?:ha|hectare|hectares)\b/i) ??
    body.match(/([\d,]+)\s*(?:m²|sqm|sq\s*m|square\s*meters?)\b/i);
  const erfText = erfMatch ? erfMatch[1] : null;
  const erf = parseErfSize(erfText);

  // Bedrooms / bathrooms — only on residential listings
  const bedMatch = body.match(/(\d+)\s*(?:bed(?:room)?s?)\b/i);
  const bathMatch = body.match(/(\d+)\s*(?:bath(?:room)?s?)\b/i);

  // Address — find a line with street number + road type in the body
  const addrMatch = body.match(
    /\d+[A-Z]?\s+[A-Z][a-zA-Z\s'-]+(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Crescent|Cres|Close|Way|Place|Pl)\b[^,\n]{0,60}/,
  );

  // Suburb detection — find a phrase like "in {Suburb}" or "in {City}"
  // near the title. Skip generic phrases like "for sale in".
  const suburbCandidates = [
    body.match(/\bin\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})\b(?!\s+for\s+sale)/),
    body.match(/\b([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2}),\s*(?:Gauteng|Western Cape|KwaZulu-Natal|Eastern Cape|Limpopo|Mpumalanga|North West|Free State)/),
  ];
  let suburb: string | null = null;
  for (const m of suburbCandidates) {
    if (m && m[1]) {
      const candidate = m[1].trim();
      // Reject generic / blacklisted phrases
      if (/^(Property|Listed|For Sale|Results?|Loading|South Africa|Property24|Private Property|Repossess|Auction|Bedroom|Bathroom)$/i.test(candidate)) continue;
      if (candidate.length < 3 || candidate.length > 50) continue;
      suburb = candidate;
      break;
    }
  }

  return {
    id,
    suburb,
    city: cityName,
    portal,
    url,
    price: priceText,
    priceAmount,
    erfSize: erf.display,
    erfSizeM2: erf.m2,
    bedrooms: bedMatch ? parseInt(bedMatch[1], 10) : null,
    bathrooms: bathMatch ? parseInt(bathMatch[1], 10) : null,
    address: addrMatch ? addrMatch[0].trim().slice(0, 200) : null,
    title,
    snippet: body.slice(0, 240).replace(/\s+/g, " ").trim(),
    matchTier: 3, // recomputed in matcher
  };
}

/**
 * Day 22 v8 — Parse a grid page (search results page) into
 * MANY listings. Property24 / PrivateProperty / Pam Golding all
 * return 20-60 listings per grid page. Tavily extracts the whole
 * page as one markdown blob; we split on listing separators and
 * parse each chunk with parseListingFromExtract.
 *
 * Listing separator: a price line "R 1 149 000" followed by a
 * short title-like line. We split on the price pattern and grab
 * the next 600 chars after each price (enough for a full listing
 * card).
 */
export function parseListingsFromGridPage(
  url: string,
  raw: string,
  portal: SaPortalId,
  cityName: string,
): LiveListing[] {
  if (!raw || raw.length < 50) return [];

  // Find all positions of "R <amount>" patterns (>= R 100k to skip
  // banner noise like "R 1 "). Each one is the start of a listing card.
  const priceMatches = Array.from(
    raw.matchAll(/\bR\s*[\d][\d,]+(?:\.\d+)?\s*(?:[Mm]|[Kk])?\b/g),
  ).filter((m) => {
    // Require at least 6 digits in the amount
    const digits = m[0].replace(/\D/g, "");
    return digits.length >= 6;
  });

  if (priceMatches.length === 0) {
    // No prices — fall back to single-listing parse (might be a detail page)
    const single = parseListingFromExtract(url, raw, portal, cityName);
    return single ? [single] : [];
  }

  const listings: LiveListing[] = [];
  for (let i = 0; i < priceMatches.length; i++) {
    const start = priceMatches[i].index ?? 0;
    // Each listing card spans ~600 chars from the price line forward
    const end =
      i + 1 < priceMatches.length
        ? priceMatches[i + 1].index ?? raw.length
        : Math.min(start + 1200, raw.length);
    const chunk = raw.slice(Math.max(0, start - 200), end);
    const parsed = parseListingFromExtract(url, chunk, portal, cityName);
    if (parsed && parsed.priceAmount && parsed.priceAmount > 100_000) {
      // Re-id with chunk index so multiple listings from the same
      // page don't collide on the same hash.
      parsed.id = `${portal}-${hashUrl(url)}-${i}`;
      // Day 22 v11: extract listing-specific URL from the chunk.
      // Pam Golding + Seeff + PrivateProperty grid pages link to
      // /property-details/<slug>/<code> — that's the deep link
      // to that ONE listing. Without this, all listings on a grid
      // page share the same URL.
      const listingUrl = extractListingUrlFromChunk(chunk, url);
      if (listingUrl) parsed.url = listingUrl;
      listings.push(parsed);
    }
  }
  return listings;
}

/**
 * Day 22 v11: pull the listing-specific URL out of a grid-page
 * chunk. Most SA portals embed individual listing links as
 * markdown `[text](URL)` pairs right after the title. The URL
 * typically contains a portal-specific code (KTP..., EN..., T...,
 * /listing/, /property-details/, etc).
 *
 * Strategy: scan the chunk for markdown links and pick the FIRST
 * one whose path looks like a listing detail page (not the grid
 * page itself).
 */
function extractListingUrlFromChunk(chunk: string, gridUrl: string): string | null {
  const allLinks = Array.from(chunk.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g));
  // Patterns that indicate a listing detail page
  const LISTING_DETAIL_PATTERNS = [
    /\/property-details\//i, // Pam Golding, Seeff
    /\/listing\//i, // Property24 detail
    /\/for-sale\/[^/]+\/[^/]+\/\d+\/?/i, // Property24 grid detail
    /\/to-rent\/[^/]+\/[^/]+\/\d+\/?/i,
    /\/commercial-property-for-sale\/[^/]+\/\d+/i,
    /\/commercial-property-to-rent\/[^/]+\/\d+/i,
    /\/properties\//i,
    /\/[Tt]\d{6,}/i, // PrivateProperty T1234567
    /\/[Ee][Nn]\d{6,}/i, // Pam Golding EN1234567
    /\/[Kk][Tt][Pp]\d{6,}/i, // Pam Golding KTP1234567
  ];
  for (const m of allLinks) {
    const candidate = m[2];
    if (candidate === gridUrl) continue;
    if (LISTING_DETAIL_PATTERNS.some((re) => re.test(candidate))) {
      return candidate;
    }
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Stable hash for an ID — no need for crypto. */
/**
 * Fallback: detect portal from URL when _portal hint is missing
 * (e.g. Tavily redirects a URL across domains).
 */
function inferPortalFromUrl(url: string): SaPortalId {
  const lower = url.toLowerCase();
  if (lower.includes("property24.com")) return "property24";
  if (lower.includes("privateproperty.co.za")) return "privateproperty";
  if (lower.includes("gumtree.co.za")) return "gumtree";
  if (lower.includes("bidx1.com")) return "bidx1";
  if (lower.includes("pamgolding.co.za")) return "pamgolding";
  if (lower.includes("seeff.com")) return "seeff";
  if (lower.includes("chaseveritt.co.za")) return "chaseveritt";
  // Unknown — label as property24 as fallback (most common)
  return "property24";
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * Day 22 — Match listings to a target suburb using a 3-tier system.
 *
 *   Tier 1 — exact suburb name match (case-insensitive, whole word)
 *   Tier 2 — fuzzy: suburb prefix or shared-word overlap
 *   Tier 3 — city-only match (listing suburb unknown or different)
 *
 * Returns the highest-tier match per listing. Tier 1 always
 * beats Tier 2 even if Tier 2 has more keyword overlap.
 */
export function rankListingsByMatch(
  listings: LiveListing[],
  targetSuburb: string | null,
  targetCity: string,
): LiveListing[] {
  if (!targetSuburb) {
    return listings.map((l) => ({ ...l, matchTier: 3 }));
  }

  const target = normalizeSuburb(targetSuburb);
  const targetWords = target.split(/\s+/).filter((w) => w.length > 2);

  return listings
    .map((listing) => {
      const listingSuburb = listing.suburb ? normalizeSuburb(listing.suburb) : "";
      const listingWords = listingSuburb.split(/\s+/).filter((w) => w.length > 2);

      // Tier 1: exact whole-word match
      if (listingSuburb && listingSuburb === target) {
        return { ...listing, matchTier: 1 as const };
      }

      // Tier 2: shared words (>=1 word in common, length>3) OR
      // target is a prefix of listingSuburb OR vice versa
      const sharedWords = listingWords.filter((w) => targetWords.includes(w));
      const isPrefix =
        listingSuburb.startsWith(target) || target.startsWith(listingSuburb);
      if (sharedWords.length >= 1 || isPrefix) {
        return { ...listing, matchTier: 2 as const };
      }

      // Tier 3: city match (fallback)
      return { ...listing, matchTier: 3 as const };
    })
    .sort((a, b) => {
      // Primary sort: tier ascending (1 first)
      if (a.matchTier !== b.matchTier) return a.matchTier - b.matchTier;
      // Secondary sort: portal preference (Property24 first, then Private Property)
      if (a.portal !== b.portal) {
        return a.portal === "property24" ? -1 : 1;
      }
      // Tertiary sort: price ascending (cheaper first within same tier+portal)
      if (a.priceAmount !== null && b.priceAmount !== null) {
        return a.priceAmount - b.priceAmount;
      }
      return 0;
    });
}

function normalizeSuburb(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Day 22 — Strip agent + agency names from a listing's display
 * fields. Privacy: we show portal + URL only. Even if the
 * extract returns "Pam Golding Properties", we drop it.
 */
export function redactAgentInfo(listing: LiveListing): LiveListing {
  // Strip common agency patterns from title + snippet
  const agencyPatterns = [
    /\bPam\s+Golding\s+(?:Properties)?\b/gi,
    /\bSotheby'?s?\b/gi,
    /\bSeeff\s+(?:Properties)?\b/gi,
    /\bLew\s+Geffen\s+Sotheby'?s?\b/gi,
    /\bChas\s+Everitt\b/gi,
    /\bRE\s*\/?\s*MAX\s+[A-Za-z]+\b/gi,
    /\bContact\s+\w+[\w\s]*?(?=\.|,|\n|$)/gi,
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:Properties|Property|Real\s+Estate)\b/g,
  ];

  let title = listing.title;
  let snippet = listing.snippet;
  for (const pat of agencyPatterns) {
    title = title.replace(pat, "[Agency]");
    snippet = snippet.replace(pat, "[Agency]");
  }

  return {
    ...listing,
    title: title.trim(),
    snippet: snippet.trim(),
  };
}

/**
 * Day 22 — Main entry point. Searches both portals, extracts the
 * top hits, parses into structured LiveListing, ranks by suburb
 * match tier. Honors the credit budget.
 *
 * Returns empty array if TAVILY_API_KEY is not set (graceful).
 */
export async function fetchLiveListings(
  opts: ListingsFetchOptions,
): Promise<LiveListing[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("[tavily-listings] TAVILY_API_KEY not set, skipping");
    return [];
  }

  const budget = opts.creditBudget ?? 10;
  const maxListings = opts.maxListings ?? 3;

  const queries = buildListingsQuery(opts);

  try {
    // Step 1: parallel search across ALL SA portals indexed by
    // Tavily (6 currently). Property24, Private Property, Gumtree
    // SA, BidX1, Pam Golding, Seeff. Each search ~3 credits on
    // free tier — capped per query by opts.creditBudget.
    //
    // We only run a subset if creditBudget is tight. Otherwise
    // we run all portals in parallel.
    const queriesToRun = opts.creditBudget && opts.creditBudget < queries.queries.length * 2
      ? queries.queries.slice(0, Math.max(2, Math.floor(opts.creditBudget / 2)))
      : queries.queries;

    const portalResults = await Promise.allSettled(
      queriesToRun.map((q) =>
        tavilySearch(q.query, 2, apiKey).then((hits) =>
          hits.map((h) => ({ ...h, _portal: q.portal })),
        ),
      ),
    );

    const allHits: Array<TavilySearchHit & { _portal: SaPortalId }> = [];
    for (const r of portalResults) {
      if (r.status === "fulfilled") allHits.push(...r.value);
    }
    if (allHits.length === 0) return [];

    // Day 22 v5: filter out editorial/article URLs. Property24's
    // /articles/* paths are blog content (e.g. "where to buy
    // property near top schools") — they don't have listings.
    // Same for /news/* / /advice/* on most portals. Only keep
    // URLs that look like actual listing detail or search result
    // pages (have erf ID digits or /for-sale/ /to-rent/ in path).
    const LISTING_URL_HINTS = [
      /\/for-sale\//i,
      /\/to-rent\//i,
      /\/commercial-property-for-sale\//i,
      /\/commercial-property-to-rent\//i,
      /\/vacant-land-for-sale\//i,
      /\/land-for-sale\//i,
      /\/land-plots-for-sale\//i,
      /\/properties-for-sale\//i,
      /\/for-sale\/\d/i, // numeric listing ID
      /\/listing\//i,
      /\/property\/\d/i,
      /\/property-search\//i,
      /\/auction\//i,
      /\/results\//i,
    ];
    const filteredHits = allHits.filter((h) => {
      // Reject explicit editorial URLs
      if (/\/articles?\//i.test(h.url)) return false;
      if (/\/news\//i.test(h.url)) return false;
      if (/\/advice\//i.test(h.url)) return false;
      if (/\/editorial\//i.test(h.url)) return false;
      // Accept if it has a listing-path hint
      return LISTING_URL_HINTS.some((re) => re.test(h.url));
    });
    // If filter rejected everything, fall back to unfiltered list
    // (better to show editorial pages than show nothing — David can
    // still see real Property24 content even if it's an article).
    const hitsToUse = filteredHits.length > 0 ? filteredHits : allHits;

    // Step 2: extract up to 3 URLs (1 credit each on free tier)
    const urlsToExtract = hitsToUse.slice(0, maxListings).map((h) => h.url);
    const extracted = await tavilyExtract(urlsToExtract, apiKey).catch(() => []);

    // Step 3: parse each extracted page. Map URL back to its
    // originating portal via the _portal hint we attached earlier.
    const urlToPortal = new Map<string, SaPortalId>();
    for (const h of hitsToUse) {
      if (h._portal) urlToPortal.set(h.url, h._portal);
    }

    const listings: LiveListing[] = [];
    for (let i = 0; i < extracted.length; i++) {
      const ex = extracted[i];
      const portal = urlToPortal.get(ex.url) ?? inferPortalFromUrl(ex.url);

      // Day 22 v8: each grid page contains MANY listings (Property24
      // and PrivateProperty return 20-60 results per page). Split
      // the page on listing boundaries and parse each as a
      // separate LiveListing. This is the right fix — a search
      // grid page IS a list of listings.
      const pageListings = parseListingsFromGridPage(
        ex.url,
        ex.raw_content,
        portal,
        opts.city.name,
      );
      for (const l of pageListings) listings.push(redactAgentInfo(l));
    }

    // Step 4: rank by suburb match
    return rankListingsByMatch(listings, opts.suburb, opts.city.name).slice(0, maxListings);
  } catch (err) {
    console.error("[tavily-listings] fetch error:", err);
    return [];
  }
}

/**
 * Thin Tavily /search wrapper. Returns up to `count` results.
 * Costs ~5 credits per call on free tier.
 */
async function tavilySearch(
  query: string,
  count: number,
  apiKey: string,
): Promise<TavilySearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: count,
      search_depth: "advanced",
      include_raw_content: false,
      topic: "general",
    }),
  });
  if (!res.ok) {
    console.warn(`[tavily] search ${res.status}: ${await res.text().catch(() => "")}`);
    return [];
  }
  const data = await res.json();
  return (data.results ?? []) as TavilySearchHit[];
}

/**
 * Thin Tavily /extract wrapper. Takes an array of URLs and
 * returns structured content for each. Costs ~1 credit per URL.
 */
async function tavilyExtract(
  urls: string[],
  apiKey: string,
): Promise<TavilyExtractResult[]> {
  if (urls.length === 0) return [];
  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      urls,
    }),
  });
  if (!res.ok) {
    console.warn(`[tavily] extract ${res.status}: ${await res.text().catch(() => "")}`);
    return [];
  }
  const data = await res.json();
  return (data.results ?? []) as TavilyExtractResult[];
}

/**
 * Convenience: detect city + return listings in one call.
 * Most callers should use this instead of fetchLiveListings directly.
 */
export async function fetchLiveListingsForQuestion(
  question: string,
  vertical: string,
  bestCatalogEntry?: {
    priceBand?: string | null;
    plotSizeHectares?: number | null;
    suburb?: string | null;
  },
): Promise<LiveListing[]> {
  const city = detectCity(question);
  if (!city) return [];

  return fetchLiveListings({
    city,
    suburb: bestCatalogEntry?.suburb ?? null,
    vertical,
    priceBand: bestCatalogEntry?.priceBand ?? null,
    plotSizeHectares: bestCatalogEntry?.plotSizeHectares ?? null,
  });
}
