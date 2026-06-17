# Atlas — An AI-powered Intelligence Engine

> A horizontal AI engine that answers complex real-world questions by combining structured APIs, browser automation, and AI reasoning.

**Repo:** [DavidNkana/Atlas](https://github.com/DavidNkana/Atlas)
**Status:** Week 1, Day 1 (scaffold live)
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
| **Day 1 (today)** | A page with a prompt box that talks to a Next.js route handler returning stub JSON | The deploy pipeline works |
| **Day 2** | Sign-in (Clerk) + Postgres (Supabase) — questions persist | Auth + database are wired |
| **Day 3** | Prompt box calls MiniMax, real AI answer back | The AI integration works |
| **Day 4** | Result page renders a Mapbox map | The map integration works |
| **Day 5** | A real connector stub fires, returns a `Signal`, scoring engine ranks it | The horizontal engine is real and demoable |
| **Days 6–7** | Polish, real-data experiments, E2E test, Christopher-facing demo | The pipeline is production-grade |

**Day 1 status:** the prompt box is live on Vercel, the route handler returns the stub JSON, the repo is on `main`. The pipeline is alive.

---

## Tech stack (locked in Day 1)

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui (Week 2)
- **Backend:** Next.js Route Handlers, Prisma ORM (Day 2), PostgreSQL via Supabase (Day 2)
- **Caching:** Upstash Redis (Week 2)
- **AI:** MiniMax 3 (Day 3), stronger reasoning models for premium tier (Week 2+)
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
| `MINIMAX_API_KEY` | MiniMax dashboard | AI planner (Day 3) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | [Mapbox account](https://account.mapbox.com/access-tokens/) | Map rendering (Day 4) |
