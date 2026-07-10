import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return NextResponse.json({ error: "TAVILY_API_KEY not set" });
  const queries = [
    "vacant land Lusaka Zambia property for sale",
    "vacant land Lusaka property for sale",
    "warehouse Lusaka Zambia for sale",
  ];
  const results: any[] = [];
  for (const q of queries) {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query: q, max_results: 5 }),
    });
    const d = await r.json().catch(() => ({ error: "parse fail" }));
    results.push({ query: q, status: r.status, resultCount: d?.results?.length ?? 0, hasResults: Array.isArray(d?.results) && d.results.length > 0, firstUrl: d?.results?.[0]?.url ?? "none" });
  }
  return NextResponse.json({ keyPrefix: key.slice(0, 8), results });
}
