/**
 * Generate the investor one-pager PDF for Atlas.
 *
 * Day 10. Output: public/atlas-investor-one-pager.pdf — single A4
 * page, dark/indigo accent, downloadable from /demo.
 *
 * We use pdfkit (pure Node, no browser deps) to keep the script
 * portable. The output is a single-page A4 PDF; long content is
 * auto-truncated by the truncation step below — if you add a lot
 * of copy, the last section may spill off and you should split
 * into 2 pages.
 */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const OUTPUT = path.join(
  __dirname,
  "..",
  "public",
  "atlas-investor-one-pager.pdf"
);

// Brand colors (mirrors tailwind.config.ts)
const COLOR_INDIGO = "#6366f1";
const COLOR_INDIGO_LIGHT = "#818cf8";
const COLOR_TEXT = "#18181b";
const COLOR_MUTED = "#71717a";
const COLOR_BG = "#fafafa";
const COLOR_BORDER = "#e4e4e7";
const COLOR_ACCENT = "#0a0a0b";

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 48, bottom: 48, left: 56, right: 56 },
  info: {
    Title: "Atlas — Investor One-Pager",
    Author: "David Nkana",
    Subject: "Atlas pitch — 1 page",
  },
});

doc.pipe(fs.createWriteStream(OUTPUT));

// Header band
doc
  .rect(0, 0, doc.page.width, 6)
  .fill(COLOR_INDIGO);

doc
  .fontSize(20)
  .fillColor(COLOR_ACCENT)
  .font("Helvetica-Bold")
  .text("Atlas", 56, 32);

doc
  .fontSize(9)
  .fillColor(COLOR_MUTED)
  .font("Helvetica")
  .text("INTELLIGENCE FOR AFRICAN REAL ESTATE", 56, 56, {
    characterSpacing: 1.2,
  });

// Tagline
doc
  .fontSize(13)
  .fillColor(COLOR_INDIGO)
  .font("Helvetica-Bold")
  .text(
    "The AI that tells land developers which plot to buy — 30 seconds, ranked, with the data to back the pick.",
    56,
    80,
    { width: 483 }
  );

let y = 130;

// Divider
function divider() {
  doc
    .moveTo(56, y)
    .lineTo(doc.page.width - 56, y)
    .strokeColor(COLOR_BORDER)
    .lineWidth(0.5)
    .stroke();
  y += 12;
}

// Section
function section(title, body) {
  doc
    .fontSize(11)
    .fillColor(COLOR_INDIGO)
    .font("Helvetica-Bold")
    .text(title.toUpperCase(), 56, y, { characterSpacing: 0.8 });
  y += 16;

  doc
    .fontSize(9.5)
    .fillColor(COLOR_TEXT)
    .font("Helvetica")
    .text(body, 56, y, { width: 483, lineGap: 2 });
  y = doc.y + 12;
}

// Bullet list
function bullets(items) {
  for (const it of items) {
    doc
      .fontSize(9.5)
      .fillColor(COLOR_TEXT)
      .font("Helvetica")
      .text("•  " + it, 64, y, { width: 475, lineGap: 1.5 });
    y = doc.y + 2;
  }
  y += 6;
}

divider();

section(
  "The Wedge",
  "Land for development. Vacant plots, zoning, size, price. Sub-verticals: residential, commercial, agricultural, industrial, mixed-use, civic. Day-1 product is in market. Wedge region: South Africa, Zambia, Kenya, Nigeria. Expanding."
);

divider();

section(
  "The Market",
  ""
);
bullets([
  "$1T+ African real estate market, 80% unserved.",
  "$250B land-for-development slice — the highest-margin, lowest-competition segment.",
  "Existing tools give listings, not recommendations. Search, scroll, no AI ranking.",
  "Atlas is the first to combine AI reasoning + live POI density + suburb-level demographics in one answer.",
]);

divider();

section(
  "What Atlas Does Today",
  ""
);
bullets([
  "User asks: \"Where in Sandton for vacant land to build 3-bedroom houses?\"",
  "Atlas returns 5 ranked sites in ~30 seconds. Each site shows: AI score (0–1) + confidence, real coordinates on a Mapbox dark map, live POI density (schools, transit, shopping, restaurants), suburb-level demographics (median household income, professional share, growth rate, economic zone), and a rationale explaining the pick.",
  "User can rate each result (thumbs up/down + note). Every rating teaches Atlas which recommendations actually work for African land developers.",
]);

divider();

section(
  "Tech",
  "Next.js 15 + React 19 + Tailwind + Clerk + Mapbox GL. Next.js Route Handlers + Prisma + PostgreSQL (Supabase). Pluggable AI layer: Google Gemini 3.5 Flash, OpenRouter (Llama 3.3 70B, Qwen 2.5 72B), curated stub fallback. Connectors: OpenStreetMap Overpass (live POI), suburb-level Stats SA Census 2022 demographics, real estate listings, Google Places. Hosted on Vercel (auto-deploy on push)."
);

divider();

section(
  "The Ask — $1M Seed at $5M Post",
  ""
);
bullets([
  "$400k engineering — 2 senior engineers × 18 months.",
  "$300k data licensing — Stats SA premium, Google Places API, HERE Maps traffic, Lightstone / TPN.",
  "$200k GTM — 1 sales rep in SA, 1 in Kenya, content + community.",
  "$100k reserve.",
]);
bullets([
  "Month 6 — 50 paying customers, $12k MRR.",
  "Month 12 — 200 paying customers, $50k MRR, sales hire.",
  "Month 18 — 1,000 customers, $250k MRR, Series A ready.",
]);

divider();

section(
  "Defensibility",
  "The moat is proprietary data Atlas accumulates over time. Every question + every rated result becomes a training signal. After 1,000 searches, Atlas knows which sites in Sandton actually got developed. After 10,000, it can predict pre-development land price appreciation. After 100,000, it becomes a market intelligence platform — not a search tool."
);

// Footer line
y = doc.page.height - 56;
doc
  .fontSize(8)
  .fillColor(COLOR_MUTED)
  .font("Helvetica")
  .text(
    "David Nkana  ·  founder@davidnkana.com  ·  Cape Town, South Africa  ·  atlas-q2eh.vercel.app",
    56,
    y,
    { width: 483, align: "center" }
  );

doc.end();
console.log(`OK: wrote ${OUTPUT}`);
