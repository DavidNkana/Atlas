import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { fetchTavilyWebAnswer, extractTavilyUrls } from "@/lib/connectors/tavily-search";

/**
 * POST /api/agents/scrape
 *
 * Scrapes agents from property listing pages on Property24 and
 * Private Property. Uses regex extraction (no LLM) for reliable
 * parsing of Property24's HTML structure.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOURCES = [
  {
    id: "property24",
    name: "Property24",
    searchHint: (city: string) =>
      `site:property24.com ${city} for sale contact agent phone Property Practitioner`,
    extraHints: (city: string) => [
      `site:property24.com ${city} to rent contact agent phone`,
    ],
  },
  {
    id: "privateproperty",
    name: "Private Property",
    searchHint: (city: string) =>
      `site:privateproperty.co.za ${city} for sale contact agent phone Property Practitioner`,
    extraHints: (city: string) => [
      `site:privateproperty.co.za ${city} to rent contact agent`,
    ],
  },
] as const;

// Sub-areas of major cities — searched separately for better coverage
const SUB_AREAS: Record<string, string[]> = {
  johannesburg: ["Sandton", "Rosebank", "Parktown", "Melrose", "Hyde Park", "Morningside", "Rivonia", "Illovo"],
  sandton: ["Sandown", "Morningside", "Rivonia", "Hyde Park", "Benmore", "Illovo", "Wynberg"],
  cape_town: ["Sea Point", "Camps Bay", "Claremont", "Newlands", "Constantia", "Durbanville", "Bellville", "Goodwood"],
  durban: ["Umhlanga", "Umhlanga Ridge", "Umhlanga Rocks", "Durban North"],
  pretoria: ["Hatfield", "Brooklyn", "Menlyn", "Centurion", "Arcadia"],
  lusaka: ["Rhodes Park", "Longacres", "Ibex Hill", "Woodlands", "Chilenje", "Kabwata"],
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

function extractAgentsViaRegex(rawHtml: string, pageUrl: string): ExtractedAgent[] {
  const agents: ExtractedAgent[] = [];
  const seen = new Set<string>();

  // Property24 agent card structure (from observation):
  //   <div class="p24_agencyCard">
  //     <a href="...agentName/slug/12345">First Last</a>
  //     <div>First Last</div>
  //     <div>Property Practitioner</div>
  //     <a href="tel:...">082 432 1517</a>   (mobile)
  //     <a href="tel:...">011 784 2772</a>   (work)
  //     <a href="mailto:...">email</a>
  //   </div>
  //
  // Strategy: find each block that contains "Property Practitioner" (or
  // a tel: link with a mobile + work phone pair), then extract
  // the agent name from that block.

  // Split on agent card boundaries. Look for the "Property Practitioner"
  // string — each occurrence is the end of an agent card.
  const blocks = rawHtml.split(/Property Practitioner/);
  for (let i = 0; i < blocks.length - 1; i++) {
    // Look at the chunk BEFORE "Property Practitioner" — that's the agent card
    const block = blocks[i];
    const start = Math.max(0, block.length - 4000); // last 4000 chars of the block

    // Find the agent name in the block: the closest h-tag, div with "p24_agentName" class, or name with a profile link
    const nameMatch = block.match(/class="[^"]*p24[^"]*agentName[^"]*"[^>]*>([^<]+)</)
      ?? block.match(/<h\d[^>]*class="[^"]*p24[^"]*"[^>]*>([^<]+)</)
      ?? block.match(/<a[^>]*href="[^"]*\/estate-agents\/[^"]*\/([a-z-]+)\/(\d+)"[^>]*>([^<]+)</i);
    let name: string | null = null;
    let profileUrl: string | null = null;
    if (nameMatch) {
      if (nameMatch[3]) {
        // URL match — extract slug from URL
        const slug = nameMatch[1];
        profileUrl = `https://www.property24.com/estate-agents/${nameMatch[2]}/${slug}/${nameMatch[3]}`;
        name = nameMatch[3].trim();
      } else {
        name = nameMatch[1].trim();
      }
    }

    // Fallback: look for any capitalized two-word name that has a tel: link nearby
    if (!name) {
      const telIdx = block.indexOf("tel:");
      if (telIdx > 0) {
        const around = block.slice(Math.max(0, telIdx - 1000), telIdx);
        const m = around.match(/([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g);
        if (m) {
          // Pick the last "firstname lastname" pattern (closest to the phone)
          name = m[m.length - 1];
        }
      }
    }

    if (!name || name.length < 5) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    // Extract phones — look in the block after the "Property Practitioner" position
    const afterBlock = blocks[i + 1] || "";
    const afterCtx = (block + " " + afterBlock).slice(-4000);
    const phoneMatches = afterCtx.match(/tel:["']?([+\d\s()-]{8,20})/gi) || [];
    let mobile: string | null = null;
    let work: string | null = null;
    for (const m of phoneMatches) {
      const num = m.replace(/^tel:["']?/, "").replace(/["']?$/, "").trim();
      if (!mobile && /^0[0-9]/.test(num)) mobile = num;
      else if (!work && /^0[0-9]/.test(num)) work = num;
    }
    const phone = mobile || (phoneMatches[0]?.replace(/^tel:["']?/, "").replace(/["']?$/, "").trim()) || null;

    // Email
    const emailMatch = afterCtx.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : null;

    // Profile URL from agent card link
    if (!profileUrl) {
      const profMatch = block.match(/href="([^"]*\/estate-agents\/[^"]+\/\d+)"/);
      if (profMatch) profileUrl = profMatch[1].startsWith("http") ? profMatch[1] : `https://www.property24.com${profMatch[1]}`;
    }
    if (!profileUrl) profileUrl = pageUrl;

    // Agency
    const agencyPatterns = [
      /Pam Golding Properties/i, /Seeff/i, /Chas\s+Everitt|Chase\s+Versitt/i,
      /Century\s*21/i, /Engel.*Völkers/i, /Rawson/i, /RE\/MAX|RE\/MAX/i,
      /Sotheby/i, /Lew\s*Geffen/i, /Jawitz/i, /Harcourts/i, /Tyson/i,
      /Coldwell\s*Banker/i, /O\s*Yes\s*Properties/i, /Traven/i, /Keller\s*Williams/i,
      /Erf\.co\.za/i,
    ];
    let agencyName: string | null = null;
    for (const ap of agencyPatterns) {
      const m = afterCtx.match(ap);
      if (m) {
        agencyName = m[0].trim();
        break;
      }
    }

    agents.push({
      name,
      agency: agencyName,
      phone,
      email,
      profileUrl,
      city: null,
      area: null,
    });
  }

  return agents;
}

export async function POST(req: NextRequest) {
  const { userId } = getAuth(req);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const city: string = (body?.city || "Sandton").trim();
  const sources: string[] = Array.isArray(body?.sources) && body.sources.length > 0
    ? body.sources
    : SOURCES.map((s) => s.id);
  const limit: number = Math.min(body?.limit ?? 10, 30);

  if (!process.env.TAVILY_API_KEY) {
    return NextResponse.json({ error: "TAVILY_API_KEY not set" }, { status: 500 });
  }

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

  for (const sourceId of sources) {
    const src = SOURCES.find((s) => s.id === sourceId);
    if (!src) continue;

    try {
      // 1. Find listing URLs — search the city itself + each sub-area
      const subAreas = getSubAreas(city);
      const searches: string[] = [];
      for (const area of subAreas) {
        searches.push(src.searchHint(area));
        for (const extra of src.extraHints?.(area) ?? []) searches.push(extra);
      }
      // Also search the bare city once
      searches.push(src.searchHint(city));
      const allUrls: string[] = [];
      const seenUrls = new Set<string>();
      for (const hint of searches) {
        if (allUrls.length >= limit) break;
        const searchAnswer = await fetchTavilyWebAnswer(hint, { maxResults: Math.min(20, limit) });
        if (!searchAnswer) continue;
        for (const s of searchAnswer.sources ?? []) {
          if (s?.url && !seenUrls.has(s.url)) {
            seenUrls.add(s.url);
            allUrls.push(s.url);
          }
        }
      }
      urlsFound += allUrls.length;
      if (allUrls.length === 0) {
        errors.push(`${sourceId}: no listing URLs found for ${city}`);
        continue;
      }

      // 2. Filter URLs to the right domain
      const urls = allUrls
        .filter((u: string) => {
          if (!/^https?:\/\//.test(u)) return false;
          if (sourceId === "property24") return /property24\.com/.test(u);
          if (sourceId === "privateproperty") return /privateproperty\.co\.za/.test(u);
          return false;
        })
        .slice(0, limit);

      if (urls.length === 0) {
        errors.push(`${sourceId}: no listing URLs after filter for ${city}`);
        continue;
      }

      // 3. Extract page content via Tavily. If that fails (Cloudflare
      // blocks Tavily's /extract endpoint), fall back to extracting
      // agents directly from the search result snippets — each snippet
      // usually shows the agent name + agency.
      let rawPages: { url: string; rawContent: string }[] = [];
      try {
        const extracted = await extractTavilyUrls(urls);
        if (extracted && extracted.results.length > 0) {
          rawPages = extracted.results
            .map((r) => ({ url: r.url, rawContent: r.rawContent ?? "" }))
            .filter((p) => p.rawContent.length > 100);
          pagesExtracted += rawPages.length;
        }
      } catch (e) {
        errors.push(`${sourceId}: extractTavilyUrls failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 4. Extract agents using regex on the extracted page content.
      // If we got no content (Tavily blocked extraction), fall back to
      // extracting from the search snippets — they often have the agent
      // name + agency in the title/text.
      const agentsAll: ExtractedAgent[] = [];
      if (rawPages.length > 0) {
        for (const p of rawPages) {
          if (!p.rawContent) continue;
          if (!firstPagePreview) firstPagePreview = p.rawContent.slice(0, 500);
          agentsAll.push(...extractAgentsViaRegex(p.rawContent, p.url));
        }
      } else {
        // Fallback: extract from Tavily's search result snippets
        const searchAnswerRaw = allUrls.length > 0 ? await fetchTavilyWebAnswer(src.searchHint(city), { maxResults: 0 }) : null;
        // Use the already-fetched results' snippets via the search responses
        // (we re-search once to get snippets — the URLs are already known)
        for (const url of urls) {
          const fallbackSearch = await fetchTavilyWebAnswer(
            `site:${sourceId === "property24" ? "property24.com" : "privateproperty.co.za"} ${url.split("/").pop()?.replace(/-/g, " ") ?? ""}`,
            { maxResults: 1 },
          );
          if (!fallbackSearch) continue;
          const snippet = fallbackSearch.answer ?? "";
          if (!snippet || snippet.length < 50) continue;
          if (!firstPagePreview) firstPagePreview = snippet.slice(0, 500);
          agentsAll.push(...extractAgentsViaRegex(snippet, url));
        }
      }
      agentsFound = agentsAll.length;

      // 5. Dedupe and save
      const seen = new Set<string>();
      for (const a of agentsAll) {
        const key = a.name.toLowerCase().trim();
        if (!a.name || seen.has(key)) continue;
        seen.add(key);
        const id = `${sourceId}_${key.replace(/[^a-z0-9]+/g, "_").slice(0, 60)}`;
        try {
          await prisma.agent.upsert({
            where: { id },
            create: {
              id, source: sourceId, name: a.name,
              agency: a.agency, phone: a.phone, email: a.email,
              areas: a.area ?? "",
              profileUrl: a.profileUrl, city: a.city || city,
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
      errors.push(`${sourceId}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
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
