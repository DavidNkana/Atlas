# Atlas — An AI-powered Intelligence Engine

> A horizontal AI engine that answers complex real-world questions by combining structured APIs, browser automation, and AI reasoning.

**Repo:** [DavidNkana/Atlas](https://github.com/DavidNkana/Atlas)
**Status:** Week 1, Day 5 (Overpass connector + scoring engine + planner live)
**Owner:** Chris + Alex

---

## What this is

Atlas is not a chatbot. It is an **intelligence engine**.

The user asks a complex real-world question. The AI planner decides which data sources to consult. The connector registry fires them. The normalizer aligns what comes back. The scoring engine ranks the evidence. The reasoning engine writes the final answer with confidence scores.

The same engine answers very different questions:

- "Where should I open a gas station in Sandton?"
- "Which crypto project is undervalued this week?"
- "Find my competitors and rank them."
- "Research African startups in fintech."

The only thing that changes is which connectors the planner selects and how the scoring engine weights their signals.

---

## Week 1 plan (the test that proves the pipeline)

| Day | Deliverable | What it proves |
|---|---|---|
| **Day 1** | A page with a prompt box that talks to a Next.js route handler returning stub JSON | The deploy pipeline works |
| **Day 2** | Sign-in (Clerk) + Postgres (Supabase) — questions persist | Auth + database are wired |
| **Day 3** | Pluggable model registry: Gemini + OpenRouter (Llama, Mistral) + curated stub | The AI integration is vendor-agnostic |
| **Day 4** | Result page renders a Mapbox map | The map integration works |
| **Day 5** | A real connector fires (OpenStreetMap Overpass), returns a `Signal`, scoring engine ranks it | The horizontal engine is real and demoable |
| **Days 6–7** | Polish, real-data experiments, E2E test, Christopher-facing demo | The pipeline is production-grade |

**Day 1 status:** the prompt box is live on Vercel, the route handler returns the stub JSON, the repo is on `main`. The pipeline is alive.

---

## Tech stack (locked in Day 1)

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui (Week 2)
- **Backend:** Next.js Route Handlers, Prisma ORM (Day 2), PostgreSQL via Supabase (Day 2)
- **Caching:** Upstash Redis (Week 2)
- **AI:** Pluggable model registry (Day 3) — Google Gemini (free default), OpenRouter (Llama, Mistral, free), curated stub (zero-config), OpenAI (paid tier, Week 2+)
- **Browser automation:** Browse AI (Week 2) + Playwright (Week 2+)
- **Auth:** Clerk (Day 2)
- **Maps:** Mapbox GL JS (Day 4)
- **Hosting:** Vercel
- **Package manager:** pnpm

---

## Project structure (Day 1)

```
Atlas/
├── app/
│   ├── api/ask/route.ts        # POST handler (Day 1 stub, grows through Week 2+)
│   ├── globals.css             # Tailwind + Atlas dark theme tokens
│   ├── layout.tsx              # Root layout — every page inherits this
│   └── page.tsx                # Home page — the G4 prompt box
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-16-atlas-week1-design.md
├── .env.example                # Tells you which env vars to fill in (Day 2+)
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── README.md                   # You are here
├── tailwind.config.ts
└── tsconfig.json
```

By Day 60, this will be:

```
Atlas/
├── app/
│   ├── (auth)/                 # Clerk sign-in / sign-up pages (Day 2)
│   ├── dashboard/              # Authed home — list of past questions (Day 2)
│   ├── questions/[id]/         # Question detail — map + rationale (Day 4)
│   ├── api/
│   │   ├── ask/route.ts        # POST — calls planner (Day 5)
│   │   ├── questions/route.ts  # CRUD (Day 2)
│   │   └── webhooks/clerk/     # (Day 2)
│   └── ...
├── connectors/                 # The connector registry
│   ├── registry.ts             # The "Signal" interface + registry
│   ├── property24.ts           # Browse AI (Day 7)
│   ├── private-property.ts     # Browse AI (Day 7)
│   ├── google-places.ts        # REST (Day 6)
│   ├── mapbox.ts               # REST (Day 4)
│   ├── coingecko.ts            # REST (Week 2)
│   ├── github.ts               # REST (Week 2)
│   ├── osm-overpass.ts         # REST (Day 6)
│   └── stats-sa.ts             # REST (Day 7)
├── services/
│   ├── ai/
│   │   ├── planner.ts          # "What data do I need?" (Day 5)
│   │   ├── analyzer.ts         # "Reason over the signals" (Day 5)
│   │   └── scoring.ts          # "Rank them" (Day 5)
│   └── normalization.ts        # The Signal normalizer
├── lib/
│   ├── db.ts                   # Prisma client (Day 2)
│   ├── auth.ts                 # Clerk helpers (Day 2)
│   └── env.ts                  # Validated env vars (Day 2)
├── types/
│   ├── signal.ts               # The contract every connector returns
│   └── connector.ts
├── prisma/
│   └── schema.prisma           # Database schema (Day 2)
└── ...
```

The Day 1 structure is small. The Week 8 structure is large. **Both honor the same `Signal` interface and the same connector registry pattern.** That's the horizontal engine done right.

---

## How to run this locally (for Chris)

You don't need to run this locally. The whole point of Vercel is you push to GitHub, Vercel deploys. The live URL is your test environment.

If you want to run it anyway:

```bash
git clone https://github.com/DavidNkana/Atlas.git
cd Atlas
pnpm install
pnpm dev
```

Then open `http://localhost:3000`. The prompt box is the same as the Vercel one.

---

## How to deploy changes (for Chris)

You don't. Alex pushes. You `git pull` to see what changed. The full loop:

1. Alex writes a commit
2. Alex pushes to `main`
3. Vercel auto-deploys (~60 seconds)
4. Alex tells you the commit SHA and the new URL (same URL, fresh build)
5. You refresh the URL and see the change

If you ever want to revert: tell Alex the SHA of the good commit. Alex pushes a revert.

---

## Why the architecture is horizontal

Adding a new vertical (real estate, crypto, competitor research, stock research, African market research) means:

1. Writing N new connectors (one per data source the vertical needs)
2. Adding a row to the scoring config (which signals to weight how)
3. Adding a row to the planner's vertical→connectors map

That is it. No new product code. No new UI. The same prompt box, the same engine, the same map, the same confidence score — different vertical, different answer.

**This is why Atlas is a platform, not a side project.**

---

## Model registry (Day 3)

Atlas uses a **pluggable model registry** — the same prompt interface for every vendor, swappable per request. Adding a new AI vendor means dropping one file in `lib/models/` and registering it in `lib/models/registry.ts`. No route handler changes. No UI changes.

### Models shipped in Day 3

| Model id | Display name | Vendor | Free? | Rate limit | Env var |
|---|---|---|---|---|---|
| `gemini-flash` | Gemini 1.5 Flash | Google AI Studio | ✅ | 15 RPM / 1500 RPD | `GEMINI_API_KEY` |
| `llama-free` | Llama 3.1 8B (free) | OpenRouter | ✅ | 20 RPM / 50 RPD | `OPENROUTER_API_KEY` |
| `mistral-free` | Mistral 7B (free) | OpenRouter | ✅ | 20 RPM / 50 RPD | `OPENROUTER_API_KEY` |
| `curated-stub` | Curated stub (no API) | Atlas (hand-crafted) | ✅ unlimited | none | _(none)_ |

### Default + fallback behavior

- **Default model**: `gemini-flash` — best free tier (15 RPM is plenty for a Week 1 demo).
- **Fallback chain**: if the requested model throws (rate limit, network error, missing key, bad JSON), `/api/ask` silently falls back to `curated-stub` and sets `response.status = "stub_fallback"` + `response.model.fallbackUsed = true`. The user never sees a 500.
- **Stub fallback also triggers when**: the requested model id is unknown, or the env var for the requested model is not set in Vercel.
- **`curated-stub` always works**: no env var required, used for demos and for the curl smoke tests below.

### Adding a new vendor (e.g. OpenAI Week 2+)

The pattern is mechanical:

1. **Create `lib/models/<vendor>.ts`** — export a `Model` object implementing the interface from `lib/models/types.ts`:
   ```ts
   import type { Model, ModelRequest, ModelResponse } from './types';
   export const myNewModel: Model = {
     info: { id: 'my-model', displayName: 'My Model', provider: 'openai', free: false, description: '...' },
     isAvailable: () => !!process.env.MY_VENDOR_API_KEY,
     call: async (req: ModelRequest): Promise<ModelResponse> => { ... },
   };
   ```
2. **Register in `lib/models/registry.ts`** — add it to the `ALL_MODELS` array.
3. **Add env var to `.env.example`** — `MY_VENDOR_API_KEY=..._REPLACE_ME`.
4. **Done.** The dropdown auto-includes it (driven by `MODEL_INFO`), the fallback chain auto-protects it, and the registry handles unknown-id errors.

### Why this matters

A pluggable registry means:

- Atlas never locks into one AI vendor. If Google raises Gemini prices, swap defaults in 30 seconds.
- Premium tier (Week 2+) becomes a one-liner: "if user clicked Premium, use `gpt-4o`, otherwise `gemini-flash`". The `/api/ask` route already takes a `model` parameter.
- Cost ceilings are enforceable: drop a vendor that's too expensive from `ALL_MODELS`, the UI just stops offering it.

---

## Day 4 — Mapbox result page

Atlas turns text answers into a map you can see. After Day 4:

1. User signs in
2. User picks a model + vertical + types a question
3. User clicks **Ask Atlas**
4. The prompt box redirects to `/result/<questionId>` (a server component)
5. The result page fetches the Question row from Supabase
6. A Mapbox GL JS dark-v11 map renders centered on Lusaka
7. For each `ranked_site` with a `lat` + `lng`, an indigo marker drops at that coordinate
8. Click a marker → Mapbox popup with the place name, AI rationale, score, and confidence
9. The map auto-fits its bounds to include every marker (with 80px padding, max zoom 14, 1.5s smooth transition)
10. The sidebar lists every site; click a list item to fly the map to that marker (1.2s) and open its popup

### Files

- `app/result/[id]/page.tsx` — server component. Fetches the Question from Supabase by cuid, 404s if not found, renders `<ResultMapClient>` with the parsed `ranked_sites`.
- `components/ResultMapClient.tsx` — client component. Owns the Mapbox map lifecycle, marker array (ref-stored for HMR safety), `fitBounds`, sidebar list, and `flyTo` for sidebar clicks.
- `app/page.tsx` — after a successful `/api/ask` that persisted a Question row, the prompt box calls `router.push("/result/" + data.id)`. The in-page `<pre>` JSON preview remains as a fallback for stub responses without an `id`.

### The marker contract (lat/lng is optional)

`RankedSite` is defined in `lib/models/types.ts`:

```ts
export type RankedSite = {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
  lat?: number;   // decimal degrees, optional
  lng?: number;   // decimal degrees, optional
};
```

Why optional: every model prompt was updated in Day 4 commit 2 to ask for `lat` + `lng`, and the curated stub seeds real Lusaka coordinates. But a model that ignores the instruction (or returns a city with no recognizable address) just yields a site with no marker — Atlas degrades gracefully instead of throwing.

The Gemini model was tested with "Where in Lusaka Zambia?" and returns 5 ranked sites with coords (Great East Road ~-15.39, 28.32; etc.). When the model returns coords, markers appear. When it doesn't, the map still renders and the sidebar shows "N sites missing lat/lng".

### Mapbox style

The result page uses `mapbox://styles/mapbox/dark-v11` — a dark style that matches the Atlas dark theme. To switch styles, edit the `style:` option in `components/ResultMapClient.tsx` line ~46. Other public styles: `streets-v12`, `light-v11`, `satellite-v9`, `outdoors-v12`. See the [Mapbox style spec](https://docs.mapbox.com/api/maps/styles/) for the full list.

### Env var

`NEXT_PUBLIC_MAPBOX_TOKEN` is the only Mapbox var needed. Get a free token (50k map loads / month) at [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/). The `NEXT_PUBLIC_` prefix means it is bundled into the client JS — scope the token via Mapbox URL restrictions in production (allow only your Vercel domain).

### How to add a new marker color, popup shape, or sidebar field

- Marker color: `new mapboxgl.Marker({ color: "#6366f1" })` — change to any hex. Use the site's `score` (e.g. `0.5 + site.score * 0.5` to map 0-1 to red→green) if you want data-driven colors.
- Popup HTML: `popupHtml` in `ResultMapClient.tsx` is built as a template string inside `map.on("load", ...)`. Escape all user-derived text via `escapeHtml()` (already defined in the same file).
- Sidebar field: the `<ol>` in the same file maps over `rankedSites`. Add a new `<span>` block inside the `<button>` per row.

---

## Day 5 — OpenStreetMap Overpass connector + scoring engine + planner

Day 5 is the day Atlas stops being "the AI said so" and starts being "the AI
said X, and OpenStreetMap confirms with Y POIs". The result page now shows
per-site signals next to every site and a score breakdown
("AI 0.85 → signals +0.09").

### What was built

1. **Connector abstractions** (`lib/connectors/`) — every external data
   source Atlas talks to implements the same `Connector` interface and
   returns `Signal[]` for a candidate site. Today there is one concrete
   connector: `overpass`. Tomorrow there will be `google-places`,
   `coinGecko`, `github`, etc., all registered the same way.
2. **Scoring engine** (`lib/scoring/`) — combines the AI's per-site score
   with the signals into a final `confidence` in `[0, 1]` and emits a
   `ScoreBreakdown` the UI can render verbatim.
3. **Planner** (`lib/plan/`) — the recipe of connector calls Atlas will run
   for one question. Today it emits one `overpass` step per site. Day 60+
   will make it smart (skip when AI confidence > 0.95, fan-out parallel
   calls, cascade cheap→paid connectors).
4. **Overpass connector** (`lib/connectors/overpass.ts`) — real
   OpenStreetMap queries, per-vertical POI templates, 8-second
   `AbortController` timeout, returns `[]` on any error so the API route
   never stalls.
5. **Wired into `/api/ask`** — after the AI returns, `Promise.allSettled`
   runs every plan step in parallel, the scoring engine updates every
   site's score + attaches signals + breakdown, and the persisted JSON
   includes `plan`, `connectorsRun`, and `connectorsError`.
6. **Rendered in the result UI** — the sidebar now shows the score as
   `score 0.94` with sub-text `AI 0.85 → signals +0.09` and a row of
   badges (`12 amenities within 1.5km`). The result page header shows a
   **Connectors** badge row (`overpass · 12 signals · ok`) and an amber
   banner when every connector failed.

### The Signal interface

```ts
interface Signal {
  id: string;             // `${connectorId}:${siteId}:${type}` for dedup
  source: string;         // "overpass" today
  type: string;           // "amenity_density" today; future: "competitor_count", "foot_traffic"
  lat?: number;
  lng?: number;
  label: string;          // human sentence the UI shows verbatim: "12 amenities within 1.5km"
  value: number;          // raw count (12)
  weight: number;         // normalised [0..1], used directly by the scoring engine
  fetchedAt: string;      // ISO timestamp
}
```

### The Connector interface

```ts
interface Connector {
  id: string;             // "overpass"
  name: string;           // "OpenStreetMap Overpass"
  vertical: Vertical | "all";
  fetch: (ctx: ConnectorContext) => Promise<Signal[]>;
}

interface ConnectorContext {
  vertical: Vertical;
  location: { lat: number; lng: number; label?: string };
  site: { id: string; name: string; lat: number; lng: number };
}
```

### The Plan interface

```ts
interface PlanStep {
  connectorId: string;
  input: Record<string, unknown>;   // connector-specific; v1 is always { siteId }
  reason: string;                    // human sentence
}

interface Plan {
  vertical: Vertical;
  location: { lat: number; lng: number; label?: string };
  steps: PlanStep[];
}
```

### Vertical-specific weights

Each vertical weights signals differently. Defined in `lib/scoring/types.ts`:

| Vertical | `amenityDensity` weight | `maxSignalBoost` |
|---|---|---|
| `gas_station` | 0.40 | ±0.15 |
| `restaurant` | 0.30 | ±0.15 |
| `warehouse` | 0.30 | ±0.15 |
| `retail_shop` | 0.35 | ±0.15 |

**Why gas_station weighs POI density highest** — competition density is
the dominant signal for a fuel site: too many competitors nearby tanks
margins, too few nearby means no demand. The scoring engine centres
`sig.weight` around 0.5 so very low density subtracts, very high adds, and
mid density is a wash.

### Why Overpass (and not Google Places, Foursquare, or Here)

| Source | Cost | Auth | Coverage | Rate limit |
|---|---|---|---|---|
| **OpenStreetMap Overpass** | Free | None | Global | Generous on public instance |
| Google Places API | Pay-per-call + requires billing card | API key | Excellent | 1000 RPM with billing |
| Foursquare | Free tier limited | API key | Good in US/EU, sparse in Africa | 1000/day free |
| Here | Freemium | API key | Good | 1000/day free |

Atlas is built for African markets first (Lusaka, Joburg, Nairobi). OSM has
the best coverage where the paying users live today. No API key = no Vercel
env var to forget, no surprise bill, no quota dashboard.

API docs: https://overpass-api.de/

### How to add a new connector in 4 steps

1. **Create `lib/connectors/<name>.ts`** — export a `Connector` object:
   ```ts
   export const myConnector: Connector = {
     id: "my-connector",
     name: "My Connector",
     vertical: "all",   // or a specific Vertical
     fetch: async (ctx) => { /* return Signal[] */ },
   };
   ```
2. **Append it to `ALL_CONNECTORS` in `lib/connectors/registry.ts`**.
3. **(Optional) Add a per-vertical template in the planner** if it needs
   special fan-out logic. v1 the planner always calls every registered
   connector.
4. **Done.** The API route picks it up automatically via
   `getConnectorsForVertical(vertical)`, the result UI's connectors row
   renders its status, and the scoring engine factors it in via
   `signal.type`.

### Files

| File | Purpose |
|---|---|
| `lib/connectors/types.ts` | `Signal`, `Connector`, `ConnectorContext` interfaces |
| `lib/connectors/registry.ts` | `ALL_CONNECTORS`, `getConnector(id)`, `getConnectorsForVertical(v)` |
| `lib/connectors/overpass.ts` | OpenStreetMap Overpass connector |
| `lib/scoring/types.ts` | `ScoreFactor`, `ScoreBreakdown`, `VERTICAL_WEIGHTS` |
| `lib/scoring/engine.ts` | `combine(aiSite, signals, vertical)` |
| `lib/plan/types.ts` | `PlanStep`, `Plan` |
| `lib/plan/planner.ts` | `buildPlan(vertical, location, sites)` |
| `app/api/ask/route.ts` | Wires `planner → connectors → scoring` between AI and persist |
| `components/ResultMapClient.tsx` | Sidebar shows signals + AI→signals score breakdown |
| `app/result/[id]/page.tsx` | Connectors badge row + amber banner when connectors fail |

---

## License

Proprietary. © David Nkana. All rights reserved.


## Environment Variables

Atlas needs these env vars to run on Vercel. Set them in the Vercel project
settings (Settings → Environment Variables). Never commit real values to the
repo. `.env.example` documents placeholder values only.

| Variable | Source | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | [Clerk Dashboard](https://dashboard.clerk.com/) → API Keys | Public Clerk key for client-side auth UI |
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys | Server-side Clerk secret (NEVER expose to client) |
| `NEXT_PUBLIC_SUPABASE_URL` | [Supabase Project Settings](https://supabase.com/dashboard) → API → Project URL | Supabase project URL for client-side use |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API → Publishable key (new 2025+ format) | Client-side Supabase key |
| `SUPABASE_SECRET_KEY` | Supabase → API → Secret key (new 2025+ format) | Server-side Supabase key (NEVER expose to client) |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (Transaction pooler, port 6543) | Postgres connection string for Prisma. **MUST include `?pgbouncer=true` to disable prepared statements. Without it, Prisma collides with PgBouncer and throws `42P05 prepared statement "s0" already exists` errors.** Supabase's transaction-mode pooler on port 6543 requires this flag; the Session pooler also works with it. |

Day 3+ will add:

| Variable | Source | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Gemini 1.5 Flash — default free model. Free tier, no card required. |
| `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai/keys) | Llama 3.1 8B (free) + Mistral 7B (free) entries in the dropdown. Free credits on signup. |
| `OPENAI_API_KEY` | [OpenAI dashboard](https://platform.openai.com/api-keys) | `gpt-4o-mini` and `gpt-4o` (Week 2+, paid tier). |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | [Mapbox account](https://account.mapbox.com/access-tokens/) | Map rendering (Day 4) |
