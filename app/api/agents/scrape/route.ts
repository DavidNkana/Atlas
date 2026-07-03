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

  const BLOCKED_NAMES = new Set([
    "South Africa", "North West", "Western Cape", "Eastern Cape",
    "Northern Cape", "KwaZulu Natal", "Free State", "Mpumalanga", "Limpopo",
    "Find Estate", "Find Letting", "Find Sales", "Find Rent", "Find Property",
    "Ratings And Reviews", "Property Portfolio", "View All",
    "Properties For Sale", "Contact Agent", "Get In Touch", "Read More",
    "Add To", "Send Inquiry", "View Details", "Make An", "Book Viewing",
    "View More", "Read Less", "Show More", "Show Less", "Load More",
  ]);

  const namePatterns = [
    /Property Practitioner[\s\S]{0,500}?([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    /class="[^"]*p24[^"]*agentName[^"]*"[^>]*>([^<]+)</g,
  ];

  for (const re of namePatterns) {
    let match;
    while ((match = re.exec(rawHtml)) !== null) {
      const name = match[1].trim().replace(/\s+/g, " ");
      if (seen.has(name) || name.length < 5 || name.length > 60) continue;
      if (BLOCKED_NAMES.has(name)) continue;
      if (/^(The|A|An|This|These|View|Show|Add|Save|Share|Click|Submit|Read|Properties)/i.test(name)) continue;
      if (/\b(Road|Street|Avenue|Lane|Province|Region|Country|City|Town)\b/i.test(name)) continue;
      if (!/^[A-Z][a-z]+(\s[A-Z][a-z]+)+$/.test(name)) continue;
      seen.add(name);

      const ctx = rawHtml.slice(Math.max(0, match.index - 500), match.index + match[0].length + 1500);

      const phoneMatch = ctx.match(/(\+27|0)\s?[\d\s()-]{8,15}/);
      if (!phoneMatch) continue;
      const phone = phoneMatch[0].trim();

      const emailMatch = ctx.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0] : null;

      const agencyPatterns = [
        /Pam Golding Properties/i,
        /Seeff/i,
        /Chas\s+Everitt|Chase\s+Versitt/i,
        /Century\s*21/i,
        /Engel\s*&?\s*Völkers|Engel.*Volkers/i,
        /Rawson/i,
        /RE\/MAX|RE\/MAX/i,
        /Sotheby/i,
        /Lew\s*Geffen/i,
        /Jawitz/i,
        /Harcourts/i,
        /Tyson/i,
        /Royal\s+LePage/i,
        /Coldwell\s*Banker/i,
        /O\s*Yes\s*Properties/i,
      ];
      let agencyName: string | null = null;
      for (const ap of agencyPatterns) {
        const m = ctx.match(ap);
        if (m) {
          agencyName = (m[0] || m[1] || "").replace(/\s+/g, " ").trim();
          break;
        }
      }

      agents.push({
        name,
        agency: agencyName,
        phone,
        email,
        profileUrl: pageUrl,
        city: null,
        area: null,
      });
    }
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
      // 1. Find listing URLs — combine primary hint + extra hints
      const hints = [src.searchHint(city), ...(src.extraHints?.(city) ?? [])];
      const allUrls: string[] = [];
      const seenUrls = new Set<string>();
      for (const hint of hints) {
        const searchAnswer = await fetchTavilyWebAnswer(hint, { maxResults: limit });
        if (!searchAnswer) continue;
        for (const s of searchAnswer.sources ?? []) {
          if (s?.url && !seenUrls.has(s.url)) {
            seenUrls.add(s.url);
            allUrls.push(s.url);
          }
        }
        if (allUrls.length >= limit) break;
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

      // 3. Extract page content
      const extracted = await extractTavilyUrls(urls);
      if (!extracted || extracted.results.length === 0) {
        errors.push(`${sourceId}: extraction returned no content`);
        continue;
      }
      pagesExtracted += extracted.results.length;

      // 4. Extract agents using regex (no LLM)
      const agentsAll: ExtractedAgent[] = [];
      for (const r of extracted.results) {
        if (!r.rawContent || r.rawContent.length < 100) continue;
        if (!firstPagePreview) firstPagePreview = r.rawContent.slice(0, 500);
        const got = extractAgentsViaRegex(r.rawContent, r.url);
        agentsAll.push(...got);
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
