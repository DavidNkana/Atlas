import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { fetchTavilyWebAnswer, extractTavilyUrls } from "@/lib/connectors/tavily-search";

/**
 * POST /api/agents/scrape
 *
 * Scrapes real estate agent directories (Property24 + PrivateProperty)
 * for a given city. Returns the count of agents saved.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOURCES = [
  {
    id: "property24",
    name: "Property24",
    searchHint: (city: string) =>
      `site:property24.com ${city} estate agents directory`,
  },
  {
    id: "privateproperty",
    name: "Private Property",
    searchHint: (city: string) =>
      `site:privateproperty.co.za ${city} estate agents directory`,
  },
] as const;

interface ExtractedAgent {
  name: string;
  agency: string | null;
  phone: string | null;
  email: string | null;
  areas: string[];
  profileUrl: string | null;
  city: string | null;
}

async function extractViaGemini(rawText: string, source: string, city: string): Promise<ExtractedAgent[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  const prompt = `Extract real estate agent records from this webpage content.
Return a JSON array of objects, each with: name (string), agency (string|null), phone (string|null), email (string|null), areas (array of suburb strings), profileUrl (string|null).
Only return agents that are clearly listed with a name. Skip company entries.
Phone format: +27 or 0xx. If the page has no agents, return [].

Webpage source: ${source}
City: ${city}

Webpage content:
${rawText.slice(0, 30000)}`;
  try {
    for (const model of ["gemini-2.0-flash", "gemini-1.5-flash"]) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
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

async function extractViaOpenRouter(rawText: string, source: string, city: string): Promise<ExtractedAgent[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return [];
  const prompt = `Extract real estate agent records from this webpage content.
Return a JSON array of objects, each with: name (string), agency (string|null), phone (string|null), email (string|null), areas (array of suburb strings), profileUrl (string|null).
Only return agents that are clearly listed with a name. Skip company entries.
Phone format: +27 or 0xx. If the page has no agents, return [].

Webpage source: ${source}
City: ${city}

Webpage content:
${rawText.slice(0, 30000)}`;
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

async function extractAgents(rawText: string, source: string, city: string): Promise<ExtractedAgent[]> {
  let agents = await extractViaGemini(rawText, source, city);
  if (agents.length === 0) {
    agents = await extractViaOpenRouter(rawText, source, city);
  }
  return agents;
}

export async function POST(req: NextRequest) {
  const { userId } = getAuth(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const city: string = (body?.city || "Sandton").trim();
  const sources: string[] = Array.isArray(body?.sources) && body.sources.length > 0
    ? body.sources
    : SOURCES.map((s) => s.id);

  if (!process.env.TAVILY_API_KEY) {
    return NextResponse.json({ error: "TAVILY_API_KEY not set" }, { status: 500 });
  }

  let totalSaved = 0;
  const errors: string[] = [];

  for (const sourceId of sources) {
    const src = SOURCES.find((s) => s.id === sourceId);
    if (!src) continue;

    try {
      const searchAnswer = await fetchTavilyWebAnswer(
        src.searchHint(city),
        { maxResults: 3 },
      );
      if (!searchAnswer) continue;

      // 2. Extract page content with Tavily /extract
      const urls = (searchAnswer.sources ?? [])
        .map((s: any) => s.url)
        .filter((u: string) => /property24|privateproperty/.test(u));
      if (urls.length === 0) continue;
      const extracted = await extractTavilyUrls(urls.slice(0, 3));
      if (!extracted) continue;

      const rawContents = extracted.results.map((r) => r.rawContent).filter(Boolean);
      let agents: ExtractedAgent[] = [];
      for (const raw of rawContents.slice(0, 3)) {
        const got = await extractAgents(raw, sourceId, city);
        agents = agents.concat(got);
        if (agents.length >= 5) break;
      }

      for (const a of agents) {
        if (!a.name) continue;
        const id = `${sourceId}_${a.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60)}`;
        await prisma.agent.upsert({
          where: { id },
          create: {
            id, source: sourceId, name: a.name,
            agency: a.agency, phone: a.phone, email: a.email,
            areas: (a.areas || []).join(", "),
            profileUrl: a.profileUrl, city: a.city || city,
            rawJson: a as any,
          },
          update: {
            agency: a.agency, phone: a.phone, email: a.email,
            areas: (a.areas || []).join(", "),
            profileUrl: a.profileUrl, scrapedAt: new Date(),
          },
        });
        totalSaved += 1;
      }
    } catch (e) {
      errors.push(`${sourceId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true, city, saved: totalSaved,
    errors: errors.length > 0 ? errors : undefined,
  });
}
