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
  portal: "property24" | "privateproperty";
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

const PORTAL_DOMAINS = {
  property24: "property24.com",
  privateproperty: "privateproperty.co.za",
} as const;

/**
 * Day 22 — Build a portal-aware search query.
 * Includes the vertical keywords + city + optional price/erf hints.
 */
export function buildListingsQuery(opts: ListingsFetchOptions): {
  property24Query: string;
  privatePropertyQuery: string;
} {
  const verticalKw = (VERTICAL_KEYWORDS[opts.vertical] ?? ["property"])[0];
  const city = opts.city.name;
  const locationParts = opts.suburb
    ? `${opts.suburb} ${city}`
    : city;

  let hint = "";
  if (opts.priceBand) {
    hint += ` ${opts.priceBand}`;
  }
  if (opts.plotSizeHectares) {
    // Convert ha → m² for portal search syntax (Property24 uses m²)
    const m2 = Math.round(opts.plotSizeHectares * 10_000);
    hint += ` erf ${m2.toLocaleString()} m²`;
  }

  const base = `${verticalKw} ${locationParts}${hint}`.trim();

  return {
    property24Query: `site:${PORTAL_DOMAINS.property24} ${base} for sale`,
    privatePropertyQuery: `site:${PORTAL_DOMAINS.privateproperty} ${base} for sale`,
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
  portal: "property24" | "privateproperty",
  cityName: string,
): LiveListing | null {
  if (!raw || raw.length < 50) return null;

  const id = `${portal}-${hashUrl(url)}`;
  const titleMatch = raw.match(/^(?:#\s+|Title:\s*)?(.+?)(?:\n|$)/m);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 120) : "Property listing";

  // Price — first R-amount in the document
  const priceMatch = raw.match(/R\s*[\d,.]+\s*[MK]?\b/i);
  const priceText = priceMatch ? priceMatch[0] : null;
  const priceAmount = parsePrice(priceText);

  // Erf size — first ha or m² match
  const erfMatch =
    raw.match(/([\d.,]+\s*(?:ha|hectare|hectares)\b)/i) ??
    raw.match(/([\d,]+\s*(?:m²|sqm|sq\s*m)\b)/i);
  const erfText = erfMatch ? erfMatch[1] : null;
  const erf = parseErfSize(erfText);

  // Bedrooms / bathrooms — only on residential listings
  const bedMatch = raw.match(/(\d+)\s*(?:bed|bedroom)/i);
  const bathMatch = raw.match(/(\d+)\s*(?:bath|bathroom)/i);

  // Address — first line that looks like a street address
  const addrMatch = raw.match(
    /\d+[A-Z]?\s+[A-Z][a-zA-Z\s]+(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Crescent|Cres|Close|Way)\b[^,\n]*,\s*[A-Za-z\s]+/,
  );

  // Suburb detection — first capitalized phrase after city name
  // Simple heuristic: pick the first 2-3 word capitalized phrase
  // that isn't "South Africa", "Property24", etc.
  const suburbMatch = raw.match(
    new RegExp(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})\\s*,?\\s*${escapeRegExp(cityName)}`, "i"),
  );
  const suburb = suburbMatch ? suburbMatch[1].trim() : null;

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
    snippet: raw.slice(0, 240).replace(/\s+/g, " ").trim(),
    matchTier: 3, // recomputed in matcher
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Stable hash for an ID — no need for crypto. */
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
    // Step 1: parallel search across both portals (~5 credits each,
    // so 10 total — but cap is 10 for the whole query)
    const [p24Hits, ppHits] = await Promise.all([
      tavilySearch(queries.property24Query, 3, apiKey).catch(() => []),
      tavilySearch(queries.privatePropertyQuery, 3, apiKey).catch(() => []),
    ]);

    const allHits = [...p24Hits, ...ppHits];
    if (allHits.length === 0) return [];

    // Step 2: extract up to 3 URLs (1 credit each on free tier)
    const urlsToExtract = allHits.slice(0, maxListings).map((h) => h.url);
    const extracted = await tavilyExtract(urlsToExtract, apiKey).catch(() => []);

    // Step 3: parse each extracted page
    const listings: LiveListing[] = [];
    for (let i = 0; i < extracted.length; i++) {
      const ex = extracted[i];
      const portal = ex.url.includes("property24.com")
        ? "property24"
        : "privateproperty";
      const parsed = parseListingFromExtract(ex.url, ex.raw_content, portal, opts.city.name);
      if (parsed) listings.push(redactAgentInfo(parsed));
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
