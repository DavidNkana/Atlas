import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint for the agents scrape feature.
 *
 * Runs the actual Tavily queries the agents route uses, with the
 * actual include_domains the agents route now sends, and returns the
 * raw results so we can see whether Tavily's index covers Property24
 * and PrivateProperty at all.
 *
 * Hit: GET https://atlas-q2eh.vercel.app/api/tavily-test
 */
export async function GET() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return NextResponse.json({ error: "TAVILY_API_KEY not set" });

  const queries: Array<{
    label: string;
    query: string;
    includeDomains: string[];
  }> = [
    { label: "p24-no-domain-filter", query: "Sandton estate agents contact", includeDomains: [] },
    { label: "p24-with-domain", query: "Sandton estate agents contact", includeDomains: ["property24.com"] },
    { label: "p24-estate-agents-slug", query: "Sandton estate-agents property practitioner", includeDomains: ["property24.com"] },
    { label: "p24-bare-url-test", query: "property24.com estate-agents Sandton", includeDomains: ["property24.com"] },
    { label: "pp-no-domain", query: "Sandton estate agents contact", includeDomains: [] },
    { label: "pp-with-domain", query: "Sandton estate agents contact", includeDomains: ["privateproperty.co.za"] },
    { label: "pp-bare-url-test", query: "privateproperty.co.za estate agents Sandton", includeDomains: ["privateproperty.co.za"] },
    { label: "p24-listing-test", query: "Sandton property for sale to rent listings", includeDomains: ["property24.com"] },
  ];

  const results: any[] = [];
  for (const q of queries) {
    const body: any = {
      api_key: key,
      query: q.query,
      max_results: 10,
      search_depth: "advanced",
      include_answer: "basic",
    };
    if (q.includeDomains.length > 0) {
      body.include_domains = q.includeDomains;
    }
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({ error: "parse fail" }));
    const urls = (d?.results ?? []).map((x: any) => x.url).filter(Boolean);
    const agentProfileMatches = urls.filter((u: string) =>
      /\/estate-agents\/[^/]+\/[^/]+\/\d+/i.test(u),
    );
    results.push({
      label: q.label,
      query: q.query,
      includeDomains: q.includeDomains,
      tavilyStatus: r.status,
      resultCount: urls.length,
      first3Urls: urls.slice(0, 3),
      agentProfileMatches: agentProfileMatches.length,
      sampleAgentUrls: agentProfileMatches.slice(0, 3),
      answer: typeof d?.answer === "string" ? d.answer.slice(0, 200) : null,
      tavilyError: d?.detail ?? d?.error ?? null,
    });
  }

  return NextResponse.json({
    keyPrefix: key.slice(0, 8),
    keyLength: key.length,
    results,
  });
}