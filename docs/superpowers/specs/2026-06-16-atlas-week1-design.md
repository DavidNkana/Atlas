# Project Atlas — Week 1 Design

**Status:** Day 5 complete — connector + scoring + planner live
**Date:** 2026-06-16 (initial), updated Day 5
**Owner:** Alex (Alex — Naudé Core Portfolio Manager)
**Project codename:** Atlas ("An AI-powered Intelligence Engine")
**Repo:** https://github.com/DavidNkana/Atlas
**Target:** https://atlas-davidnkana.vercel.app (provisional, set by Vercel on first import)

---

## Day 5 status — ✅ COMPLETE

Day 5 shipped the horizontal engine's first real connector, the scoring
engine, and the planner. The result page now shows the AI ranking, the
live signals that confirm or override it, and a transparent score
breakdown ("AI 0.85 → signals +0.09").

### Files shipped

| Path | Purpose |
|---|---|
| `lib/connectors/types.ts` | `Signal`, `Connector`, `ConnectorContext` interfaces |
| `lib/connectors/registry.ts` | `ALL_CONNECTORS`, `getConnector(id)`, `getConnectorsForVertical(v)` |
| `lib/connectors/overpass.ts` | OpenStreetMap Overpass connector (Day 5 commit 2) |
| `lib/scoring/types.ts` | `ScoreFactor`, `ScoreBreakdown`, `VERTICAL_WEIGHTS` |
| `lib/scoring/engine.ts` | `combine(aiSite, signals, vertical)` |
| `lib/plan/types.ts` | `PlanStep`, `Plan` |
| `lib/plan/planner.ts` | `buildPlan(vertical, location, sites)` |
| `app/api/ask/route.ts` | Updated: wires `planner → connectors → scoring` after AI |
| `components/ResultMapClient.tsx` | Updated: sidebar shows signals + AI→signals score breakdown |
| `app/result/[id]/page.tsx` | Updated: Connectors badge row + amber banner on connector failure |
| `README.md` | Updated: Day 5 section with connector "how to add" guide |
| `.env.example` | Updated: notes that Overpass is public + free, no key required |

### Connector → scoring → planner → API → UI flow

```
User POSTs /api/ask { vertical, question }
        │
        ▼
   ┌─────────┐    ┌───────────────────────┐
   │  Model  │──▶│  ranked_sites (text)  │
   └─────────┘    └───────────────────────┘
                       │
                       ▼
              ┌──────────────────┐
              │     planner      │   buildPlan(vertical, location, sites)
              │  buildPlan()     │   → Plan { vertical, location, steps[] }
              └──────────────────┘
                       │
                       ▼
              ┌──────────────────────────────────────┐
              │   Promise.allSettled over steps[]    │
              │   ──────────────────────────────     │
              │   step.connectorId = "overpass"      │
              │   → overpassConnector.fetch(ctx)     │
              │   → Signal[] (or [] on error)        │
              └──────────────────────────────────────┘
                       │
                       ▼
              ┌──────────────────────────────┐
              │      scoring engine          │
              │   combine(aiSite, signals,   │
              │           vertical)          │
              │   → ScoreBreakdown           │
              └──────────────────────────────┘
                       │
                       ▼
              ┌─────────────────────────────────────────────┐
              │  Attach to each site:                       │
              │   site.score       = breakdown.confidence   │
              │   site.signals     = signalsForSite         │
              │   site.scoreBreakdown = breakdown           │
              └─────────────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────────────────────────┐
              │  Response shape:                   │
              │  {                                │
              │    ...ranked_sites (updated),     │
              │    plan,                          │
              │    connectorsRun:                 │
              │      [{ id, status, signalCount }]│
              │    connectorsError?: "..."        │
              │  }                                │
              └────────────────────────────────────┘
                       │
                       ▼
       prisma.question.update({ responseJson })
                       │
                       ▼
              /result/[id] page
              ├─ Connectors badge row (overpass · 12 signals · ok)
              ├─ Amber banner if connectorsError
              └─ Sidebar: score pill + AI→signals delta + Signals badges
```

### Signal interface

```ts
interface Signal {
  id: string;             // `${connectorId}:${siteId}:${type}`
  source: string;         // "overpass"
  type: string;           // "amenity_density"
  lat?: number;
  lng?: number;
  label: string;          // "12 amenities within 1.5km"
  value: number;          // 12
  weight: number;         // [0..1], used by scoring engine
  fetchedAt: string;      // ISO timestamp
}
```

### Connector interface

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

### Plan interface

```ts
interface PlanStep {
  connectorId: string;                       // "overpass"
  input: Record<string, unknown>;            // { siteId } in v1
  reason: string;                            // human sentence
}

interface Plan {
  vertical: Vertical;
  location: { lat: number; lng: number; label?: string };
  steps: PlanStep[];                         // one per ranked site in v1
}
```

### Why Day 5 is "the horizontal engine is real"

Before Day 5 the AI was the only source of truth — Atlas printed whatever
the model said. After Day 5, every score is `f(AI ranking, live signals)`
and the UI shows the breakdown so Chris can audit. Adding a new vertical
(real estate, crypto, competitor research) now means:

1. Write N new connectors (each one implements the `Connector` interface)
2. Add per-vertical weights to `lib/scoring/types.ts` (`VERTICAL_WEIGHTS`)
3. Register the connectors in `lib/connectors/registry.ts`

The planner, scoring engine, API route, and UI don't change. That is the
horizontal engine done right.

---

## What Atlas is, in one paragraph

A horizontal AI intelligence engine. The user asks a complex real-world question
("Where should I open a gas station in Sandton?" / "Which crypto project is
undervalued this week?" / "Find my competitors and rank them.") The engine
planner decides which data sources to consult, normalizes what comes back, scores
the evidence, and returns a confidence-weighted answer with reasoning. The
architecture is vertical-agnostic — adding a new vertical (real estate, crypto,
competitor research, stock research) means writing new connectors, not new
product code.

## Why this design exists in this shape

Three constraints drove the cut:

1. **One week, not eight.** The 8-week schedule you originally proposed is real
   scope for the full platform, not a one-week sprint. We are not shipping the
   full platform in 7 days. We are shipping **the engine is alive and the
   pipeline is proven**. That is the Week 1 deliverable.
2. **You learn by walking through 6 files, not 60.** Every file I push comes
   with a 3-sentence explanation. You never need to learn Next.js, React, or
   Prisma syntax. You learn what each file *does* and *why*.
3. **The architecture must outlive Week 1.** Even Day 1's code must look like
   Day 60's code. That means: connector framework is a registry from day one,
   not added in Week 2. The AI planner module exists from day one, even if it
   just returns a hardcoded list of connectors. The Signal interface exists
   from day one, even if the only connector returns a fake signal.

## Phase 1 vertical choice: G4 (user picks vertical)

- Prompt box: dropdown + text input
- Verticals on Day 1: gas station / restaurant / warehouse / retail shop
- The scoring engine is a single function, scored-by-vertical. Cost to add a
  fifth vertical in Week 2 is one config row, not a new module.

## Week 1 deliverables (what you will have on Vercel by Sunday)

| Day | What you get on Vercel | What it proves |
|---|---|---|
| **Day 1 (today)** | A page titled "Atlas — Intelligence Engine" with a prompt box. Submit goes to a Next.js route handler that returns hardcoded JSON. **No real AI yet.** | The deploy pipeline works end-to-end on your account. |
| **Day 2** | Sign-in works (Clerk). Dashboard shows your name and a "New question" button. Questions you ask go into Postgres (Supabase) so we can see them. | Auth + database are wired. |
| **Day 3** | Text box talks to MiniMax (me, in cloud form). Type "Where should I open a gas station in Sandton?" → real AI answer back in the UI. | The AI integration works. |
| **Day 4** | Result page renders a Mapbox map with a marker at the suggested location. We hardcode the location on Day 4. | The map integration works. |
| **Day 5** | A connector stub fires, returns a `Signal`, the planner routes it, the scoring engine ranks it. UI shows the result. | The horizontal engine is real and demoable. |
| **Days 6–7** | Polish, real-data experiments, E2E test (Jobs), Christopher-facing demo. | The pipeline is production-grade, not just demo-grade. |

## Day 1 in detail (what this commit does)

### Files pushed (10)

```
package.json            — Next.js 16, React 19, TypeScript, Tailwind, shadcn deps
next.config.js          — Minimal config, no surprises
tsconfig.json           — Strict TypeScript
tailwind.config.ts      — Atlas dark theme tokens
postcss.config.js       — Tailwind/PostCSS pipeline
app/layout.tsx          — Root layout, dark theme, Atlas wordmark
app/page.tsx            — G4 prompt box: vertical dropdown + text input + Submit
app/api/ask/route.ts    — POST handler returning hardcoded JSON (Day 1 stub)
.gitignore              — Node, Next.js, .env, dist
.env.example            — Tells Chris which env vars to fill in (Day 2+)
README.md               — What Atlas is, Week 1 plan, deploy steps
```

Plus this design doc: `docs/superpowers/specs/2026-06-16-atlas-week1-design.md`

### Architecture: what each file is *for* (the teaching version)

You don't need to know Next.js. Here's the shape:

- **`app/layout.tsx`** — the wrapper that every page on the site sits inside. Like the chrome of a book: the cover, the title bar, the font. It says "this whole site is dark, this whole site is Atlas." Every page you ever build inherits this.

- **`app/page.tsx`** — the home page. The thing you see when you visit `atlas-davidnkana.vercel.app`. Right now it's a prompt box. By Day 30 it might be a list of past questions. The *file* doesn't change, the *contents* do.

- **`app/api/ask/route.ts`** — the backend. When you click Submit, your browser talks to this file. Today it returns a hardcoded JSON. By Day 3 it talks to MiniMax. By Day 5 it talks to the planner, which talks to connectors. The *file* doesn't change, the *logic inside* does.

- **`package.json`** — the list of every tool Atlas uses. The "ingredients" of the recipe. Don't edit it by hand — `pnpm add` does it for you when we add a new connector or library.

- **`tsconfig.json` + `next.config.js` + `tailwind.config.ts`** — configuration files. Boring. Don't touch them unless I tell you to.

### What the prompt box does (Day 1 behavior)

1. User picks a vertical: "gas station" / "restaurant" / "warehouse" / "retail shop"
2. User types a question: "Where in Sandton?"
3. User clicks Submit
4. Browser POSTs to `/api/ask` with `{ vertical: "gas_station", question: "Where in Sandton?" }`
5. Route handler returns:

```json
{
  "status": "stub",
  "vertical": "gas_station",
  "question": "Where in Sandton?",
  "echo": "This is the Day 1 stub. Day 3 will call MiniMax here. Day 5 will call the connector registry.",
  "ranked_sites": [
    {
      "rank": 1,
      "name": "Stub site (Day 5 will be a real connector output)",
      "score": 0.0,
      "confidence": 0.0,
      "rationale": "Stub. Day 5 wires the real connector and scoring engine."
    }
  ]
}
```

6. UI shows the JSON in a `<pre>` block. Boring but honest. The page *works end-to-end*. No AI, no maps, no auth. The pipeline is alive.

### What the prompt box does NOT do on Day 1

- Does not save the question to a database (Day 2)
- Does not require sign-in (Day 2)
- Does not call any AI (Day 3)
- Does not show a map (Day 4)
- Does not score anything real (Day 5)
- Does not use a real connector (Day 5)

### What the prompt box does on Day 1

- Loads on Vercel
- Lets you type and click
- Returns a JSON response
- Proves the deploy pipeline works

That is the entire Day 1 deliverable. **That is what you will see on the Vercel URL when I tell you the commit is pushed.**

## What you need to do after I push

3 clicks in Vercel to import and deploy:

1. Go to https://vercel.com/new
2. Find the `DavidNkana/Atlas` repo in the "Import Git Repository" list. Click **Import**.
3. Vercel auto-detects Next.js. Click **Deploy**.

Wait ~60 seconds. Vercel gives you a URL like `atlas-davidnkana.vercel.app`. You click it. You see the prompt box. You type. You click Submit. You see the JSON. You have proven the pipeline.

I will give you the exact URL the moment Vercel is wired up. (It takes Vercel ~30 seconds to auto-deploy on first push, so the URL is live within a minute of me saying "PUSHED.")

## What I will NOT do in this commit

- No Clerk wiring (Day 2)
- No Supabase (Day 2)
- No MiniMax call (Day 3)
- No Mapbox (Day 4)
- No real connector (Day 5)
- No env vars, no secrets, no production keys committed

The only thing this commit proves is: **the repo is real, the framework is real, the prompt box is real, the deploy is real.** Everything else is staged for the rest of the week.

## Risk and rollback

- If the deploy fails on Vercel, I see the build log, I fix it, I push again. No data is at risk — there is no data on Day 1.
- If you don't like the prompt box UI, you tell me what to change. I push a fix. Same loop.
- If you decide you want to start over (different vertical, different look), I delete the repo contents with a single empty commit. Nothing is lost — the design is in this doc.

## Open questions to resolve before Day 2

1. **Clerk keys** — I need `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from your Clerk dashboard. I'll ask for these on Day 2, not now.
2. **Supabase project** — Do you have one, or do we create one? (We'll create one — it's free. I'll walk you through it on Day 2.)
3. **Project name on Vercel** — Vercel will suggest `atlas-davidnkana.vercel.app`. If you want a different subdomain, tell me.
4. **Repo visibility** — Your repo is currently public. Do you want it private? (1-click flip in Settings → Danger Zone → Change visibility. I'll do it if you say so.)

---

**Approve this design and I push Day 1 in 10 minutes.**
**Ask for changes and I revise.**
**Reject and I stop.**
