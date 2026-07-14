import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { fetchTavilyWebAnswer, extractTavilyUrls } from "@/lib/connectors/tavily-search";

/**
 * POST /api/agents/scrape
 *
 * Scrapes agents from property listings on Property24, Private Property,
 * and other major SA real estate portals.
 *
 * Strategy:
 *  1. Tavily search → find listing URLs for a city on each portal
 *  2. Tavily /extract → fetch HTML of each listing
 *  3. Gemini (cheap) → extract agent name, phone, email from each listing
 *  4. Dedupe by name within a source, save to DB
 *
 * Each listing has the agent contact, so scraping listings gives us
 * hundreds of agents per source.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOURCES = [
  {
    id: "property24",
    name: "Property24",
    // Listing search — find specific property listings
    searchHint: (city: string) =>
      `site:property24.com ${city} for sale listing contact agent phone`,
  },
  {
    id: "privateproperty",
    name: "Private Property",
    searchHint: (city: string) =>
      `site:privateproperty.co.za ${city} for sale listing contact agent phone`,
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

async function extractAgentsViaGemini(
  rawText: string,
  source: string,
  sourceUrl: string,
  city: string,
): Promise<ExtractedAgent[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  const prompt = `Extract ALL real estate agent details visible on this property listing page.
Each property is listed BY AN AGENT — extract the agent who listed it.
Return a JSON array of objects, each with:
  - name (string, the agent's name e.g. "John Smith")
  - agency (string|null, the agency name e.g. "Pam Golding Properties")
  - phone (string|null, contact phone e.g. "+27 11 555 1234")
  - email (string|null, contact email)
  - profileUrl (string|null, link to agent's profile page)
  - area (string|null, suburb / area of the property)

A page may have MULTIPLE agents (one per listing). Extract ALL of them.
Skip obvious company entries with no individual name.
Phone format: +27 or 0xx. If the page has no agents, return [].

Source: ${source}
City: ${city}
URL: ${sourceUrl}

Webpage content:
${rawText.slice(0, 40000)}`;
  try {
    for (const model of ["gemini-2.0-flash", "gemini-1.5-flash"]) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
          }),
        }
      );
      if (!res.ok) continue;
      const data: any = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) continue;
      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
      } catch { continue; }
    }
  } catch {}
  return [];
}

async function extractAgentsViaOpenRouter(
  rawText: string,
  source: string,
  sourceUrl: string,
  city: string,
): Promise<ExtractedAgent[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return [];
  const prompt = `Extract ALL real estate agent details from this property listing page.
Each property has an agent — extract the listing agent.
Return a JSON array of objects: { name, agency, phone, email, profileUrl, area }.
Skip companies without individual names.
If no agents, return [].

Source: ${source}
City: ${city}
URL: ${sourceUrl}

Webpage content:
${rawText.slice(0, 40000)}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {}
  } catch {}
  return [];
}

async function extractAgents(
  rawText: string,
  source: string,
  sourceUrl: string,
  city: string,
): Promise<ExtractedAgent[]> {
  let agents = await extractAgentsViaGemini(rawText, source, sourceUrl, city);
  if (agents.length === 0) {
    agents = await extractAgentsViaOpenRouter(rawText, source, sourceUrl, city);
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

  let totalSaved = 0;
  const errors: string[] = [];

  for (const sourceId of sources) {
    const src = SOURCES.find((s) => s.id === sourceId);
    if (!src) continue;

    try {
      // 1. Find listing URLs
      const searchAnswer = await fetchTavilyWebAnswer(
        src.searchHint(city),
        { maxResults: limit },
      );
      if (!searchAnswer) {
        errors.push(`${sourceId}: no search results`);
        continue;
      }

      // 2. Filter URLs to listing pages only (not search results or about pages)
      const urls = (searchAnswer.sources ?? [])
        .map((s: any) => s.url)
        .filter((u: string) => {
          if (!/^https?:\/\//.test(u)) return false;
          // Prefer listing detail pages
          if (sourceId === "property24" && /\/(for-sale|to-rent)\/[\d]+/.test(u)) return true;
          if (sourceId === "privateproperty" && /\/(for-sale|to-rent)\/[\d]+/.test(u)) return true;
          return false;
        });

      // Fallback: take any URLs from the matching domain
      if (urls.length === 0) {
        const fallback = (searchAnswer.sources ?? [])
          .map((s: any) => s.url)
          .filter((u: string) => {
            if (!/^https?:\/\//.test(u)) return false;
            if (sourceId === "property24") return /property24\.com/.test(u);
            if (sourceId === "privateproperty") return /privateproperty\.co\.za/.test(u);
            return false;
          })
          .slice(0, limit);
        urls.push(...fallback);
      }

      if (urls.length === 0) {
        errors.push(`${sourceId}: no listing URLs found for ${city}`);
        continue;
      }

      // 3. Extract page content
      const extracted = await extractTavilyUrls(urls.slice(0, limit));
      if (!extracted || extracted.results.length === 0) {
        errors.push(`${sourceId}: extraction returned no content`);
        continue;
      }

      // 4. Extract agents from each page
      let agentsAll: ExtractedAgent[] = [];
      for (const r of extracted.results) {
        if (!r.rawContent) continue;
        const got = await extractAgents(r.rawContent, sourceId, r.url, city);
        agentsAll = agentsAll.concat(got);
      }

      // 5. Dedupe and save
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
          errors.push(`db: ${dbErr instanceof Error ? dbErr.message.split("\n")[0] : String(dbErr)}`);
        }
      }
    } catch (e) {
      errors.push(`${sourceId}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true, city, saved: totalSaved,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  });
}
