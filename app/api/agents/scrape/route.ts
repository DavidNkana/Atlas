import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { fetchTavilyWebAnswer, extractTavilyUrls } from "@/lib/connectors/tavily-search";

/**
 * POST /api/agents/scrape
 *
 * Scrapes agents from property listings on Property24, Private Property,
 * and other major SA real estate portals.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOURCES = [
  {
    id: "property24",
    name: "Property24",
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
Each property is listed BY AN AGENT — extract the listing agent.
Return a JSON array of objects: { name, agency, phone, email, profileUrl, area }.
Skip companies without individual names.
If no agents, return [].

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
      if (!res.ok) {
        console.warn(`[agents] Gemini ${model} status=${res.status} url=${sourceUrl.slice(0, 60)}`);
        continue;
      }
      const data: any = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) {
        console.warn(`[agents] Gemini ${model} returned empty text url=${sourceUrl.slice(0, 60)} finishReason=${data?.candidates?.[0]?.finishReason}`);
        continue;
      }
      console.log(`[agents] Gemini ${model} text preview url=${sourceUrl.slice(0, 60)}: ${text.slice(0, 300).replace(/\n/g, " ")}`);
      // Match either a JSON array or a single object wrapper
      let match = text.match(/\[[\s\S]*?\]/);
      if (!match) match = text.match(/```json\s*([\s\S]*?)```/);
      if (!match) continue;
      try {
        const candidate = match[1] || match[0];
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.agents)) return parsed.agents;
        if (Array.isArray(parsed?.results)) return parsed.results;
        return [];
      } catch (e) { continue; }
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
Return a JSON array: { name, agency, phone, email, profileUrl, area }.
Skip companies without individual names.
If no agents, return [].

Source: ${source}
City: ${city}
URL: ${sourceUrl}

Webpage content:
${rawText.slice(0, 40000)}`;
  // Try multiple OpenRouter free models
  const models = ["openai/gpt-4o-mini", "meta-llama/llama-3.1-8b-instruct:free"];
  for (const modelName of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        }),
      });
      if (!res.ok) {
        console.warn(`[agents] OpenRouter ${modelName} status=${res.status}`);
        continue;
      }
      const data: any = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      if (!text) continue;
      console.log(`[agents] OpenRouter ${modelName} text preview url=${sourceUrl.slice(0, 60)}: ${text.slice(0, 300).replace(/\n/g, " ")}`);
      let match = text.match(/\[[\s\S]*?\]/);
      if (!match) match = text.match(/```json\s*([\s\S]*?)```/);
      if (!match) continue;
      try {
        const candidate = match[1] || match[0];
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.agents)) return parsed.agents;
        if (Array.isArray(parsed?.results)) return parsed.results;
        return [];
      } catch { continue; }
    } catch {}
  }
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
  let urlsFound = 0;
  let pagesExtracted = 0;
  let agentsFound = 0;
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

      // 2. Filter URLs to property24 / privateproperty domain
      const urls = (searchAnswer.sources ?? [])
        .map((s: any) => s.url)
        .filter((u: string) => {
          if (!/^https?:\/\//.test(u)) return false;
          if (sourceId === "property24") return /property24\.com/.test(u);
          if (sourceId === "privateproperty") return /privateproperty\.co\.za/.test(u);
          return false;
        })
        .slice(0, limit);
      urlsFound += urls.length;

      if (urls.length === 0) {
        errors.push(`${sourceId}: no listing URLs found for ${city} (Tavily returned ${searchAnswer.sources?.length ?? 0} URLs but none matched)`);
        continue;
      }

      // 3. Extract page content
      const extracted = await extractTavilyUrls(urls);
      if (!extracted || extracted.results.length === 0) {
        errors.push(`${sourceId}: extraction returned no content for ${urls.length} URLs`);
        continue;
      }
      pagesExtracted += extracted.results.length;

      // 4. Extract agents from each page
      let agentsAll: ExtractedAgent[] = [];
      let firstPagePreview: string | null = null;
      for (const r of extracted.results) {
        if (!r.rawContent || r.rawContent.length < 100) continue;
        if (!firstPagePreview) firstPagePreview = r.rawContent.slice(0, 500);
        const got = await extractAgents(r.rawContent, sourceId, r.url, city);
        agentsAll = agentsAll.concat(got);
      }
      agentsFound = agentsAll.length;

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
    debug: {
      urlsFound,
      pagesExtracted,
      agentsFound,
      firstPagePreview: firstPagePreview ? firstPagePreview.replace(/\s+/g, " ").slice(0, 400) : null,
    },
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  });
}
