import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import {
  fetchTavilyWebAnswer,
  extractTavilyUrls,
  bustTavilyWebCache,
  TavilyQuotaError,
} from "@/lib/connectors/tavily-search";

/**
 * POST /api/agents/scrape
 *
 * Scrapes real estate agents from Property24 and Private Property
 * agent profile pages. The flow:
 *
 *  1. Find the AGENT DIRECTORY for the city (e.g.
 *     https://www.property24.com/estate-agents/sandton/...)
 *  2. Extract ALL agent profile URLs from that directory page
 *  3. Visit each profile and extract the agent's name, agency, phone, email
 *
 * Each agent's full contact info is on their individual profile page
 * (e.g. /estate-agents/o-yes-properties/laleh-golestani/483697).
 *
 * Tavily's "answer" field is used as a fallback when /extract
 * gets blocked by Cloudflare.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOURCES = [
  {
    id: "property24",
    name: "Property24",
    domain: "property24.com",
    // Query shape: short natural-language phrases. include_domains is set
    // on the Tavily call, so we don't repeat `site:` here.
    // LCP-90 quota guard: only 1 primary hint per (city × source).
    // The free Tavily tier throttles hard (~432 after 5 calls/min) so
    // we used to burn 4-8 hints × 2 sources × 12 cities = ~190 search
    // calls per scrapeAll. Now: 2 hints × 2 sources × 12 = 48 max,
    // and the route stops at the first hit that yields >= limit URLs.
    directoryHints: (city: string, subAreas: string[]) => [
      `${city} estate agents contact`,
      ...(subAreas.length > 0
        ? [`${subAreas[0]} estate agents contact`]
        : []),
    ],
    profileUrlMatch: /^https?:\/\/(?:www\.)?property24\.com\/estate-agents\/[^/]+\/[^/]+\/\d+/i,
    profilePathPrefix: "https://www.property24.com/estate-agents/",
  },
  {
    id: "privateproperty",
    name: "Private Property",
    domain: "privateproperty.co.za",
    directoryHints: (city: string, subAreas: string[]) => [
      `${city} estate agents contact`,
      ...(subAreas.length > 0
        ? [`${subAreas[0]} estate agents contact`]
        : []),
    ],
    profileUrlMatch: /^https?:\/\/(?:www\.)?privateproperty\.co\.za\/[^/]+\/[^/]+\/\d+/i,
    profilePathPrefix: "",
  },
] as const;

const SUB_AREAS: Record<string, string[]> = {
  johannesburg: ["Sandton", "Rosebank", "Parktown", "Melrose", "Hyde Park", "Morningside", "Rivonia", "Illovo"],
  sandton: ["Sandown", "Morningside", "Rivonia", "Hyde Park", "Benmore", "Illovo", "Wynberg"],
  cape_town: ["Sea Point", "Camps Bay", "Claremont", "Newlands", "Constantia", "Durbanville", "Bellville", "Goodwood"],
  durban: ["Umhlanga", "Umhlanga Ridge", "Umhlanga Rocks", "Durban North"],
  pretoria: ["Hatfield", "Brooklyn", "Menlyn", "Centurion", "Arcadia"],
  lusaka: ["Rhodes Park", "Longacres", "Ibex Hill", "Woodlands", "Chilenje", "Kabwata"],
};

// All major SA cities + sub-areas for a "scrape all of SA" run.
const SA_CITIES: string[] = [
  "Sandton", "Johannesburg", "Pretoria", "Cape Town", "Durban", "Stellenbosch",
  "Bloemfontein", "Port Elizabeth", "East London", "Knysna", "George", "Nelspruit",
  "Polokwane", "Nelspruit", "Rustenburg", "Kimberley", "Potchefstroom", "Klerksdorp",
  "Welkom", "Vereeniging", "Centurion", "Midrand", "Pietermaritzburg", "Richards Bay",
  "Newcastle", "Bethlehem", "Vryheid", "Upington", "George", "Knysna", "Mossel Bay",
  "Oudtshoorn", "Worcester", "Paarl", "Stellenbosch", "Somerset West", "Hermanus",
  "Vredendal", "Springbok", "Upington", "Kuruman", "Vryburg", "Potchefstroom",
];

const ZA_CITY_MAP: Record<string, string[]> = {
  sandton: ["Sandown", "Morningside", "Rivonia", "Hyde Park", "Benmore", "Illovo", "Wynberg"],
  johannesburg: ["Rosebank", "Parktown", "Melrose", "Hyde Park", "Morningside", "Rivonia", "Illovo", "Sandown"],
  pretoria: ["Hatfield", "Brooklyn", "Menlyn", "Centurion", "Arcadia", "Sunnyridge", "Silver Lakes"],
  cape_town: ["Sea Point", "Camps Bay", "Claremont", "Newlands", "Constantia", "Durbanville", "Bellville", "Goodwood", "Century City", "Woodstock"],
  durban: ["Umhlanga", "Umhlanga Ridge", "Umhlanga Rocks", "Durban North", "Mornton", "Musgrave"],
  stellenbosch: ["Die Boord", "Universiteitsoord", "Stellenbosch Central"],
  bloemfontein: ["Universitas", "Pellissier", "Fichardt Park", "Spitskop"],
  port_elizabeth: ["Summerstrand", "Humerail", "Lorraine", "Mill Park"],
  east_london: ["Quigney", "Southernwood", "Vincent", "Nahoon"],
  polokwane: ["Bendor", "Welgelegen", "Flora Park", "Sterpark"],
  nelspruit: ["West Acres", "Riverside", "Steiltes", "Nelspruit Central"],
  rustenburg: ["Rustenburg Central", "Cashan", "Proteapark", "Geelhoutpark"],
  potchefstroom: ["Potchefstroom Central", "Baillie Park", "Van Der Hoffpark"],
  vereeniging: ["Vereeniging Central", "Three Rivers", "Duncanville"],
  pietermaritzburg: ["Pietermaritzburg Central", "Scottsville", "Chase Valley", "Wembley"],
};

function getSubAreas(city: string): string[] {
  const c = city.toLowerCase();
  for (const [key, areas] of Object.entries(SUB_AREAS)) {
    if (c.includes(key)) return areas;
  }
  return [city];
}

interface ExtractedAgent {
  name: string;
  agency: string | null;
  phone: string | null;
  email: string | null;
  profileUrl: string | null;
  city: string | null;
  area: string | null;
}

// Words that indicate a navigation/UI page, NOT a person.
// Applied as a post-filter so URLs like
// /estate-agents/some-agency/find-estate/12345 don't get
// saved as the agent "Find Estate".
const NON_NAME_WORDS = new Set([
  "real", "estate", "find", "search", "results", "agents", "agent",
  "property", "properties", "contact", "directory", "listing", "listings",
  "profile", "profiles", "for", "sale", "rent", "browse", "all", "top",
  "view", "show", "page", "home", "about", "contact", "help", "login",
  "register", "search", "results", "commercial", "residential",
]);

function looksLikeRealName(name: string): boolean {
  if (!name) return false;
  const words = name.toLowerCase().split(/\s+/);
  // Reject if ANY word is a known non-name / navigational term.
  if (words.some((w) => NON_NAME_WORDS.has(w))) return false;
  return true;
}

// Extract a clean agent name from a profile URL like
// /estate-agents/o-yes-properties/laleh-golestani/483697
// or /agents/agency/agent-slug/12345
function nameFromProfileUrl(url: string): string | null {
  // Strip query and hash
  const u = url.split(/[?#]/)[0];
  const parts = u.split("/").filter(Boolean);
  // Take the last meaningful slug (before the numeric ID)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) continue;
    const slug = parts[i];
    // Convert "laleh-golestani" -> "Laleh Golestani"
    const name = slug
      .replace(/-/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    if (name && name.length > 4 && looksLikeRealName(name)) return name;
    // If this slug is junk (e.g. "find-estate", "real-estate"), don't
    // try earlier path segments — they're agency/category names.
    return null;
  }
  return null;
}

// Property24 + PrivateProperty agent profile HTML patterns.
// Each agent has a profile page with full contact info displayed.
function extractAgentFromProfilePage(html: string, url: string): ExtractedAgent | null {
  // Try the URL name first
  const urlName = nameFromProfileUrl(url);
  if (!urlName) return null;

  // Validate it's actually a name (first and last name)
  if (!/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(urlName)) return null;

  // Phone numbers: look for the contact section
  const phoneMatches = [
    ...html.matchAll(/tel:["']?([+\d\s()-]{8,20})/gi),
  ];
  let mobile: string | null = null;
  let work: string | null = null;
  for (const m of phoneMatches) {
    const num = m[1].replace(/["'\s]/g, "").trim();
    if (!mobile && /^0[0-9]/.test(num)) mobile = num;
    else if (!work && /^0[0-9]/.test(num)) work = num;
  }
  const phone = mobile || work || (phoneMatches[0] ? phoneMatches[0][1].trim() : null);

  // Email
  const emailMatch = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const email = emailMatch ? emailMatch[1] : null;

  // Agency: usually shown near the top or in the URL path
  let agency: string | null = null;
  const agencyMatch = html.match(/Pam Golding Properties|Seeff|Chas\s*Everitt|Chase\s*Versitt|Century\s*21|Engel.*Völkers|Rawson|RE\/MAX|RE\/MAX|Sotheby|Lew\s*Geffen|Jawitz|Harcourts|Tyson|Coldwell\s*Banker|O\s*Yes\s*Properties|Traven\s*Properties|Keller\s*Williams/i);
  if (agencyMatch) agency = agencyMatch[0];

  // Extract agency from URL path: /estate-agents/{agency}/{name}/{id}
  const pathMatch = url.match(/\/estate-agents\/([^/]+)\//);
  if (!agency && pathMatch) {
    const agencySlug = pathMatch[1].replace(/-/g, " ");
    agency = agencySlug
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return {
    name: urlName,
    agency,
    phone,
    email,
    profileUrl: url,
    city: null,
    area: null,
  };
}

// Extract multiple agents from a single page (directory page or search answer)
// Extract agents from URLs only — works even when /extract fails
// because the URL itself contains the name slug.
function extractAgentsFromUrlsOnly(urls: string[]): ExtractedAgent[] {
  const seen = new Set<string>();
  const out: ExtractedAgent[] = [];
  for (const url of urls) {
    const name = nameFromProfileUrl(url);
    if (!name) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    let agency: string | null = null;
    const pathMatch = url.match(/\/estate-agents\/([^/]+)\//);
    if (pathMatch) {
      agency = pathMatch[1]
        .replace(/-/g, " ")
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    out.push({
      name,
      agency,
      phone: null,
      email: null,
      profileUrl: url,
      city: null,
      area: null,
    });
  }
  return out;
}

// Fetch phone + email for each agent via a per-agent Tavily search.
// Property24's "answer" field often contains the agent's contact info.
async function enrichAgentsWithContact(
  agents: ExtractedAgent[],
  city: string,
  sourceId: string,
): Promise<ExtractedAgent[]> {
  if (!process.env.TAVILY_API_KEY) return agents;
  for (const a of agents) {
    if (a.phone) continue;
    try {
      const query = sourceId === "property24"
        ? `site:property24.com "${a.name}" ${a.agency ?? ""} ${city} phone contact mobile office email`
        : `site:privateproperty.co.za "${a.name}" ${city} contact phone email`;
      const result = await fetchTavilyWebAnswer(query, { maxResults: 1 });
      if (!result) continue;
      const text = result.answer ?? "";
      const phoneMatch = text.match(/(\+27|0)\s?[\d\s()-]{8,15}/);
      if (phoneMatch) a.phone = phoneMatch[0].trim();
      const emailMatch = text.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) a.email = emailMatch[0];
    } catch {}
  }
  return agents;
}

function extractAgentsFromProfileUrls(urls: string[]): ExtractedAgent[] {
  return extractAgentsFromUrlsOnly(urls);
}

export async function POST(req: NextRequest) {
  const { userId } = getAuth(req);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const city: string = (body?.city || "Sandton").trim();
  const scrapeAll = body?.scrapeAll === true || body?.scrapeAll === "true";
  const sources: string[] = Array.isArray(body?.sources) && body.sources.length > 0
    ? body.sources
    : SOURCES.map((s) => s.id);
  const limit: number = Math.min(body?.limit ?? 50, 100);

  // For "scrape all of SA", iterate through the top cities
  // sequentially. Each city is one synchronous loop through the
  // existing extraction logic. The full SA run is bounded by
  // Vercel's maxDuration of 300s — so we cap at ~10 cities per
  // request. For the full list, the user runs multiple requests.
  const targetCities = scrapeAll
    ? SA_CITIES.slice(0, 12) // ~10 min budget, 12 cities
    : [city];

  if (!process.env.TAVILY_API_KEY) {
    return NextResponse.json({ error: "TAVILY_API_KEY not set" }, { status: 500 });
  }

  // Safety belt: bust the in-memory Tavily cache at the start of every
  // scrape request. The previous bug surfaced because a stale empty
  // result was cached for 30 min and short-circuited all subsequent
  // calls. We always want a fresh Tavily answer here.
  bustTavilyWebCache();

  // Ensure the Agent table exists. Vercel doesn't auto-run Prisma
  // migrations, so we create it on-demand the first time a route
  // needs it. Safe to run repeatedly — IF NOT EXISTS is idempotent.
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Agent" (
        id            TEXT PRIMARY KEY,
        source        TEXT NOT NULL,
        name          TEXT NOT NULL,
        agency        TEXT,
        phone         TEXT,
        email         TEXT,
        areas         TEXT,
        "profileUrl"  TEXT,
        city          TEXT,
        "rawJson"     JSONB,
        "scrapedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    console.error("[agents] table-create failed:", e instanceof Error ? e.message : String(e));
  }

  let totalSaved = 0;
  let urlsFound = 0;
  let pagesExtracted = 0;
  let agentsFound = 0;
  let firstPagePreview: string | null = null;
  const errors: string[] = [];

  // Outer loop: iterate across cities when scrapeAll=true.
  // Vercel maxDuration is 300s. ~25s/city × 12 cities = 300s budget.
  // Each city gets its own stale-data wipe + sub-area expansion +
  // Tavily search + Tavily enrichment + Prisma upsert.
  for (const targetCity of targetCities) {
    for (const sourceId of sources) {
      const src = SOURCES.find((s) => s.id === sourceId);
      if (!src) continue;

      try {
        // Clear stale records for this city+source combo first.
        // The route was iterated multiple times with looser regexes that
        // inserted junk like "Find Estate" / "Real Estate". We delete them
        // so the user only ever sees the latest clean scrape.
        try {
          const deleted = await prisma.agent.deleteMany({ where: { source: sourceId, city: targetCity } });
          console.log(`[agents] deleted ${deleted.count} stale ${sourceId} records for ${targetCity}`);
        } catch (e) {
          console.error("[agents] deleteMany failed:", e instanceof Error ? e.message : String(e));
        }

        // 1. Find agent PROFILE URLs (not listing URLs)
        const subAreas = getSubAreas(targetCity);
        const hints = src.directoryHints(targetCity, subAreas);
        const allUrls: string[] = [];
        const seenUrls = new Set<string>();
        for (const hint of hints) {
          if (allUrls.length >= limit) break;
          const searchAnswer = await fetchTavilyWebAnswer(hint, {
            maxResults: Math.min(20, limit),
            includeDomains: [src.domain],
          });
          if (!searchAnswer) continue;
          for (const s of searchAnswer.sources ?? []) {
            if (s?.url && src.profileUrlMatch.test(s.url) && !seenUrls.has(s.url)) {
              seenUrls.add(s.url);
              allUrls.push(s.url);
            }
          }
        }
        urlsFound += allUrls.length;
        if (allUrls.length === 0) {
          errors.push(`${sourceId}/${targetCity}: no agent profile URLs found`);
          continue;
        }

// 2. Try to extract agent info from each profile page
      const agentsAll: ExtractedAgent[] = [];
      let extracted: { url: string; rawContent: string }[] = [];
      try {
        // advanced depth returns fuller HTML — better chance of finding
        // phone numbers even when "Show contact" gates them in the UI.
        const result = await extractTavilyUrls(allUrls, { extractDepth: "advanced" });
        if (result && result.results.length > 0) {
            extracted = result.results
              .map((r) => ({ url: r.url, rawContent: r.rawContent ?? "" }))
              .filter((p) => p.rawContent.length > 100);
            pagesExtracted += extracted.length;
          }
        } catch (e) {
          errors.push(`${sourceId}/${targetCity}: extractTavilyUrls failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        // 3. Extract agents from URL pattern (works even if /extract failed)
        // The URL pattern itself is the most reliable signal: the slug encodes the name.
        const urlOnly = extractAgentsFromUrlsOnly(allUrls);
        agentsAll.push(...urlOnly);

        // 4. Extract from page content if available (gives us phones + emails)
        for (const p of extracted) {
          if (!p.rawContent) continue;
          if (!firstPagePreview) firstPagePreview = p.rawContent.slice(0, 500);
          // The page confirms the agent's existence and adds phone/email
          const agent = extractAgentFromProfilePage(p.rawContent, p.url);
          if (agent) {
            // Merge with URL-only entry to fill phone/email gaps
            const idx = agentsAll.findIndex((a) => a.name.toLowerCase() === agent.name.toLowerCase());
            if (idx >= 0) {
              agentsAll[idx] = {
                ...agentsAll[idx],
                ...agent,
                phone: agentsAll[idx].phone || agent.phone,
                email: agentsAll[idx].email || agent.email,
              };
            } else {
              agentsAll.push(agent);
            }
          }
        }
        agentsFound += agentsAll.length;

        // 5. Per-agent phone + email enrichment via Tavily answer field
        await enrichAgentsWithContact(agentsAll, targetCity, sourceId);

        // 6. Dedupe and save
        const seen = new Set<string>();
        for (const a of agentsAll) {
          if (!a.name) continue;
          const key = a.name.toLowerCase().trim();
          if (seen.has(key)) continue;
          seen.add(key);
          const id = `${sourceId}_${key.replace(/[^a-z0-9]+/g, "_").slice(0, 60)}`;
          try {
            await prisma.agent.upsert({
              where: { id },
              create: {
                id, source: sourceId, name: a.name,
                agency: a.agency, phone: a.phone, email: a.email,
                areas: a.area ?? "",
                profileUrl: a.profileUrl, city: a.city || targetCity,
                rawJson: a as any,
              },
              update: {
                agency: a.agency, phone: a.phone, email: a.email,
                areas: a.area ?? "",
                profileUrl: a.profileUrl, scrapedAt: new Date(),
              },
            });
            totalSaved += 1;
          } catch (dbErr) {
            const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            errors.push(`db: ${msg.split("\n")[0].slice(0, 200)}`);
          }
        }
      } catch (e) {
        // LCP-90 quota guard: if Tavily hit its rate limit / monthly
        // credit cap, stop the whole scrape right now. Continuing would
        // burn more calls and 432 every subsequent request, producing
        // a useless "0 saved" response. Surface the quota error so the
        // UI can show a clear message.
        if (e instanceof TavilyQuotaError) {
          return NextResponse.json({
            ok: false,
            quotaExceeded: true,
            tavilyStatus: e.status,
            message: e.message,
            hint: e.hint,
            city,
            saved: totalSaved,
            partial: {
              citiesCompleted: targetCities.indexOf(targetCity),
              totalCities: targetCities.length,
              urlsFound,
              pagesExtracted,
              agentsFound,
            },
            debug: {
              urlsFound,
              pagesExtracted,
              agentsFound,
              firstPagePreview: firstPagePreview ? firstPagePreview.replace(/\s+/g, " ").slice(0, 400) : null,
            },
            errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
          }, { status: 429 });
        }
        errors.push(`${sourceId}/${targetCity}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true, city, saved: totalSaved,
    debug: {
      urlsFound,
      pagesExtracted,
      agentsFound,
      firstPagePreview: firstPagePreview ? firstPagePreview.replace(/\s+/g, " ").slice(0, 400) : null,
    },
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  });
}
