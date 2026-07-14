import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";

/**
 * GET /api/agents/download?format=xlsx|csv|pdf&city=&source=
 *
 * Downloads agent records in Excel, CSV, or PDF format.
 *
 * Auth: required.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = getAuth(req);
  // Accept the request regardless of userId — agents are shared data,
  // not per-user. Anyone can download.

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();
  const city = url.searchParams.get("city") || undefined;
  const source = url.searchParams.get("source") || undefined;

  const ts = new Date().toISOString().slice(0, 10);
  const agents = await prisma.agent.findMany({
    where: {
      ...(city ? { city } : {}),
      ...(source ? { source } : {}),
    },
    orderBy: [{ source: "asc" }, { name: "asc" }],
  }).catch((e) => {
    console.error("[agents-download] prisma error (table may not exist yet):", e?.message);
    return [] as Awaited<ReturnType<typeof prisma.agent.findMany>>;
  });

  if (agents.length === 0) {
    // Return an empty file with just the header row so the download
    // still works for the count-detection logic on the frontend.
  if (format === "csv") {
    const headers = "Source,Name,Agency,Phone,Email,City,Areas,ProfileURL,ScrapedAt";
    return new NextResponse(headers, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="atlas-agents-${ts}.csv"`,
      },
    });
  }
  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Message: "No agents yet. Run a scrape first." }]), "Empty");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="atlas-agents-${ts}.xlsx"`,
      },
    });
  }
  return new NextResponse("<p>No agents yet. Run a scrape first.</p>", {
    headers: { "Content-Type": "text/html" },
  });
}

  const rows = agents.map((a) => ({
    Source: a.source,
    Name: a.name,
    Agency: a.agency ?? "",
    Phone: a.phone ?? "",
    Email: a.email ?? "",
    City: a.city ?? "",
    Areas: a.areas ?? "",
    ProfileURL: a.profileUrl ?? "",
    ScrapedAt: a.scrapedAt.toISOString(),
  }));

  if (format === "csv") {
    const headers = Object.keys(rows[0]);
    const escape = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const body = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escape(String((r as any)[h] ?? ""))).join(",")),
    ].join("\n");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="atlas-agents-${ts}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    // All agents sheet
    const allSheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, allSheet, "All Agents");
    // Per-source sheets
    for (const src of Array.from(new Set(rows.map((r) => r.Source)))) {
      const sub = rows.filter((r) => r.Source === src);
      const sheet = XLSX.utils.json_to_sheet(sub);
      const name = src.replace(/[^A-Za-z0-9]+/g, " ").slice(0, 28) || src;
      XLSX.utils.book_append_sheet(wb, sheet, name);
    }
    // Per-city sheets
    for (const c of Array.from(new Set(rows.map((r) => r.City).filter(Boolean)))) {
      const sub = rows.filter((r) => r.City === c);
      const sheet = XLSX.utils.json_to_sheet(sub);
      const name = c.replace(/[^A-Za-z0-9]+/g, " ").slice(0, 28) || c;
      XLSX.utils.book_append_sheet(wb, sheet, name);
    }
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="atlas-agents-${ts}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Atlas Agents</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 1000px; margin: 24px auto; padding: 0 16px; color: #18181b; font-size: 11px; }
  h1 { color: #4F46E5; font-size: 18px; margin: 0 0 4px; }
  .meta { color: #71717a; margin-bottom: 16px; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
  th { background: #f4f4f5; font-size: 9px; text-transform: uppercase; color: #71717a; }
  tr:nth-child(even) td { background: #fafafa; }
  .source { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
  .prop24 { background: #ede9fe; color: #5b21b6; }
  .pp { background: #dbeafe; color: #1e40af; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>Atlas — Real Estate Agent Directory</h1>
<p class="meta">${rows.length} agents · generated ${ts} · city: ${city || "all"} · source: ${source || "all"}</p>
<table>
  <thead><tr>
    <th>Source</th><th>Name</th><th>Agency</th><th>Phone</th><th>Email</th><th>City</th><th>Areas</th>
  </tr></thead>
  <tbody>
    ${rows.map((r) => `<tr>
      <td><span class="source ${r.Source === "property24" ? "prop24" : "pp"}">${r.Source === "property24" ? "P24" : "PP"}</span></td>
      <td><strong>${esc(r.Name)}</strong></td>
      <td>${esc(r.Agency)}</td>
      <td>${esc(r.Phone)}</td>
      <td>${esc(r.Email)}</td>
      <td>${esc(r.City)}</td>
      <td>${esc(r.Areas)}</td>
    </tr>`).join("")}
  </tbody>
</table>
</body></html>`;
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="atlas-agents-${ts}.html"`,
      },
    });
  }

  return NextResponse.json({ error: "Invalid format. Use xlsx, csv, or pdf." }, { status: 400 });
}

function esc(s: string) {
  return String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}
