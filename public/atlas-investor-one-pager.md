# Atlas — Intelligence for African Real Estate

**The AI that tells land developers which plot to buy — 30 seconds, ranked, with the data to back the pick.**

Atlas blends multiple data sources, AI models, and live signals to help land developers, property investors, and builders find the right plot in 30 seconds instead of 6 weeks.

---

## The Wedge

**Land for development.** Vacant plots, zoning, size, price.

Sub-verticals: residential · commercial · agricultural · industrial · mixed-use · civic.

Day 1 product is in market. Wedge region: South Africa, Zambia, Kenya, Nigeria. Expanding.

---

## The Market

- **$1T+ African real estate market**, 80% unserved
- **$250B land-for-development slice** — the highest-margin, lowest-competition segment
- **Existing tools give listings, not recommendations.** Property24, Private Property — search, scroll, no AI ranking
- Atlas is the first to combine: AI reasoning + real POI density + suburb-level demographic data + real estate listings in a single answer

---

## What Atlas Does (Today)

User asks: *"Where in Sandton for vacant land to build 3-bedroom houses?"*

Atlas returns 5 ranked sites in ~30 seconds. Each site shows:
- AI score (0-1) + confidence
- Real coordinates on a Mapbox dark map
- Live POI density (schools, transit, shopping, restaurants nearby)
- Suburb-level demographics: median household income, professional share, growth rate, economic zone
- Rationale explaining why this site was chosen

The user can rate each result (thumbs up/down + note). Every rating teaches Atlas which recommendations actually work for African land developers.

---

## Tech

- **Frontend**: Next.js 15, React 19, Tailwind, Clerk auth, Mapbox GL
- **Backend**: Next.js Route Handlers, Prisma, PostgreSQL (Supabase)
- **AI**: Pluggable model layer — Google Gemini 3.5 Flash, OpenRouter (Llama 3.3 70B, Qwen 2.5 72B), curated stub fallback
- **Connectors**: OpenStreetMap Overpass (live POI), suburb-level Stats SA Census 2022 demographics, real estate listings, Google Places
- **Hosting**: Vercel (auto-deploy on push)
- **Persistence**: Supabase Postgres with Prisma ORM

---

## Traction

- 71+ commits shipped in 10 days
- Live product: `atlas-q2eh.vercel.app`
- 4 verticals + 5 land verticals + 1 civic vertical supported
- 60+ named suburbs in 11 cities with real census data
- 0 paying customers (target: 3 by week 4)
- 1 founder: David Nkana (technical)

---

## The Ask

**$1M seed round at $5M post.**

Use of funds:
- **$400k engineering** — 2 senior engineers × 18 months
- **$300k data licensing** — Stats SA premium, Google Places API, HERE Maps traffic, Lightstone / TPN
- **$200k GTM** — 1 sales rep in SA, 1 in Kenya, content + community
- **$100k reserve**

Milestones:
- **Month 6** — 50 paying customers, $12k MRR
- **Month 12** — 200 paying customers, $50k MRR, sales hire
- **Month 18** — 1,000 customers, $250k MRR, Series A ready

---

## Defensibility

The moat is **proprietary data Atlas accumulates over time.**

Every question + every rated result becomes a training signal. After 1,000 searches, Atlas knows which sites in Sandton actually got developed. After 10,000, it can predict pre-development land price appreciation. After 100,000, it becomes a market intelligence platform — not a search tool.

Day 1 collection is built in. Every result page has a thumbs-up / thumbs-down widget. Every rating is persisted to PostgreSQL with vertical + user + question metadata.

---

**David Nkana** — founder@davidnkana.com — Cape Town, South Africa

Live product: `https://atlas-q2eh.vercel.app` · Demo: `atlas-q2eh.vercel.app/demo` · Pricing: `atlas-q2eh.vercel.app/pricing`
