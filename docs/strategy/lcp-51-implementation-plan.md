# LCP-51 — Atlas Strategy: implementation plan

**Status:** Sacha-ready, awaiting dispatch. Connector stubs S1-S4 shippable today by Alex (this session). UI and daily-brief S5-S8 require Sacha.

**Author:** Alex
**Date:** 2026-06-22
**Parent LCP:** 7d90ae87-4d0b-45d4-ad8a-879ee4e83be6
**Scope reference:** `docs/strategy/lcp-50-scope.md` (approved by founder 2026-06-22)

---

## Approved scope (founder's three decisions)

1. **X (Twitter) cost tier:** SKIP. Free tier unusable ($100/mo Basic deferred to post-MVP).
2. **Sentiment layer:** VADER lexicon for MVP, swap to RoBERTa in Phase 2.
3. **MVP scope:** All free sources. Tavily + NewsAPI + CoinGecko community + Reddit + YouTube titles + CryptoPanic + GitHub (low priority).

**No X. No LunarCrush. No Discord. No Telegram. YouTube titles only (no transcripts).**

---

## Phasing

| Phase | Owner | Status | Output |
|---|---|---|---|
| Phase 1a — Connectors | Alex (this session) | READY to ship | S1, S2, S3, S4 |
| Phase 1b — Server routes + cache | Sacha | Pending dispatch | S5 |
| Phase 1c — /strategy page + daily brief | Sacha | Pending dispatch | S6 |
| Phase 1d — VADER integration + score layer | Sacha | Pending dispatch | S7 |
| Phase 1e — Source health monitor + disclaimer | Sacha | Pending dispatch | S8 |

**Sacha's total work for Phase 1: ~2-3 weeks of one developer.** Connector stubs reduce their work to the actual product surface, not plumbing.

---

## S1 — CryptoPanic connector stub

**Owner:** Alex (this session)
**Files:** `lib/connectors/cryptopanic.ts` (new)
**Pattern reference:** `lib/connectors/news.ts`

**API:** `https://cryptopanic.com/api/v1/posts/?currencies=BTC&filter=hot` — free tier, 200 calls/day, no auth required for public posts. Auth token optional, raises rate limit.

**Interface (Sacha's lane accepts this exact shape):**
```typescript
export interface CryptoPanicPost {
  id: number;
  title: string;
  url: string;
  source: string;          // "coindesk.com"
  domain: string;          // "coindesk.com"
  publishedAt: string;     // ISO
  currencies: { code: string; title: string; slug: string }[];
  votes: { positive: number; negative: number; important: number; liked: number; disliked: number; lol: number; toxic: number; saved: number };
  kind: "news" | "media";
  sentiment?: "bullish" | "bearish" | "neutral" | null;
}

export async function fetchCryptoPanicPosts(
  options: {
    coins?: string[];       // e.g. ["BTC", "ETH"], defaults to top 20
    filter?: "rising" | "hot" | "bullish" | "bearish" | "important" | "saved" | "lol";
    bypassCache?: boolean;
  } = {}
): Promise<CryptoPanicPost[]>;
```

**Behaviour:**
- Read `CRYPTOPANIC_API_KEY` from env (optional). If set, adds `?auth_token=` query.
- Cache TTL: 5 minutes (news is slow-moving).
- Empty-result guard: never cache `[]`.
- `lastFetchStatus` for diagnostics.
- Graceful degradation: if API key missing OR rate-limited OR 4xx, return `[]` and set status. Do NOT throw.

**Acceptance:**
- `pnpm build` exit 0
- `grep -rE "CRYPTOPANIC_API_KEY=[^$]" --include=".env*"` 0 matches
- File has JSDoc comment block matching the project's style (see `lib/connectors/crypto.ts` header)

**Evidence:** build output, secret scan, file diff.

---

## S2 — YouTube titles connector stub

**Owner:** Alex (this session)
**Files:** `lib/connectors/youtube-titles.ts` (new)
**Pattern reference:** `lib/connectors/news.ts`

**API:** `https://www.googleapis.com/youtube/v3/search?part=snippet&q=bitcoin&type=video&order=date&maxResults=10` — free 10,000 units/day. Each `videos.list` costs 1 unit, each `search.list` costs 100 units.

**For MVP, use `search.list` only** to get titles + descriptions + channel + published date. NO transcripts (legal gray area, deferred per scope).

**Interface:**
```typescript
export interface YouTubeVideoTitle {
  id: string;              // videoId
  title: string;
  description: string;     // first 200 chars only, for sentiment
  channelTitle: string;
  publishedAt: string;     // ISO
  url: string;             // https://youtube.com/watch?v=...
  viewCount?: number;      // from videos.list (second call, optional)
}

export async function fetchYouTubeTitlesForCoin(
  coin: { id: string; name: string; symbol: string },
  options: { maxResults?: number; bypassCache?: boolean } = {}
): Promise<YouTubeVideoTitle[]>;
```

**Behaviour:**
- Read `YOUTUBE_API_KEY` from env (required for this connector; without it return `[]` and log status).
- Cache TTL: 30 minutes.
- Search query: `"${coin.name} OR ${coin.symbol} crypto"` to bias toward crypto videos.
- Filter: only videos from channels we trust (Coin Bureau, BitBoy Crypto, Altcoin Daily, Crypto Banter, plus 5 African channels: Crypto University Africa, BitKE, The Bitcoin Bridge, Blockchain Africa, CryptoTainment). If no trusted channel, return unfiltered with a flag.
- For MVP, skip the channel filter — it can be added in Phase 2. Just fetch the top 10 most recent.

**Acceptance:**
- `pnpm build` exit 0
- `grep -rE "YOUTUBE_API_KEY=[^$]" --include=".env*"` 0 matches
- File has JSDoc matching project style

**Evidence:** build output, secret scan, file diff.

---

## S3 — Reddit connector stub

**Owner:** Alex (this session)
**Files:** `lib/connectors/reddit.ts` (new)
**Pattern reference:** `lib/connectors/news.ts`

**API:** Reddit OAuth API. Two options:
- **Option A (recommended for MVP):** `https://www.reddit.com/r/cryptocurrency/top.json?t=day&limit=25` — works WITHOUT OAuth but with very low rate limits and a custom User-Agent. Set User-Agent to `Atlas-Strategy/1.0 (+https://atlas-q2eh.vercel.app)`.
- **Option B (full):** OAuth2 client credentials flow with `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`. 100 req/min. Recommended for production.

**Start with Option A for the stub.** Sacha upgrades to Option B in the implementation phase.

**Interface:**
```typescript
export interface RedditPost {
  id: string;              // post id
  subreddit: string;       // "r/cryptocurrency"
  title: string;
  selftext: string;        // body, first 500 chars
  url: string;             // permalink
  score: number;           // upvotes
  numComments: number;
  author: string;
  createdUtc: string;      // ISO
  flair?: string;          // "[News]", "[Discussion]"
}

export async function fetchTopRedditPosts(
  options: {
    subreddits?: string[];  // default: ["cryptocurrency", "bitcoin", "ethtrader", "ethfinance", "solana", "cardano", "SouthAfrica", "nigeria", "kenya"]
    sort?: "hot" | "top" | "new" | "rising";
    time?: "hour" | "day" | "week" | "month";
    limit?: number;
    bypassCache?: boolean;
  } = {}
): Promise<RedditPost[]>;

export async function fetchPostsForCoin(
  coin: { id: string; name: string; symbol: string },
  options?: { limit?: number; bypassCache?: boolean }
): Promise<RedditPost[]>;
```

**Behaviour:**
- Read `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` from env. If both set, use OAuth. If either missing, use anonymous with descriptive User-Agent.
- Cache TTL: 10 minutes.
- For `fetchPostsForCoin`, search across the default subreddits with query `"${coin.symbol}" OR "${coin.name}"` and sort by `top` of `day`.
- Return shape is normalised regardless of source.
- Empty-result guard.

**Acceptance:**
- `pnpm build` exit 0
- `grep -rE "REDDIT_CLIENT_[A-Z]+=[^$]" --include=".env*"` 0 matches
- File has JSDoc matching project style
- Graceful degradation when keys missing

**Evidence:** build output, secret scan, file diff.

---

## S4 — GitHub activity connector stub

**Owner:** Alex (this session)
**Files:** `lib/connectors/github-activity.ts` (new)
**Pattern reference:** `lib/connectors/crypto.ts`

**API:** GitHub REST. `https://api.github.com/repos/{owner}/{repo}/commits?since={ISO}&per_page=10` — no auth, 60 req/hr. With `GITHUB_TOKEN`, 5000 req/hr.

**For MVP, track commit activity for ~20 named repos:** bitcoin/bitcoin, ethereum/go-ethereum, solana-labs/solana, cardano-foundation/cardano, input-output-hk/cardano-js-sdk, plus African-relevant: Yellow Card, VALR, Luno, Quidax, Bitnob, Kotani Pay, Bitmama, etc.

**Interface:**
```typescript
export interface GitHubActivity {
  repo: string;            // "bitcoin/bitcoin"
  displayName: string;     // "Bitcoin Core"
  commitsLast7d: number;
  commitsLast30d: number;
  openIssues: number;
  stars: number;
  lastCommitAt: string;    // ISO
  lastCommitMessage: string; // first line, 100 chars
  url: string;
}

export async function fetchRepoActivity(
  repo: string,
  options?: { bypassCache?: boolean }
): Promise<GitHubActivity | null>;

export async function fetchCryptoRepoActivity(
  options?: { bypassCache?: boolean }
): Promise<GitHubActivity[]>;
```

**Behaviour:**
- Read `GITHUB_TOKEN` from env (optional). Adds `Authorization: Bearer` header if set.
- Cache TTL: 1 hour (commit activity is slow).
- For each tracked repo, get commit count via `search/commits?q=repo:OWNER/REPO+committer-date:>YYYY-MM-DD` (cheaper than listing).
- Empty-result guard.
- Graceful degradation when rate-limited (return cached data and set status to "rate-limited").

**Acceptance:**
- `pnpm build` exit 0
- `grep -rE "GITHUB_TOKEN=[^$]" --include=".env*"` 0 matches
- File has JSDoc matching project style

**Evidence:** build output, secret scan, file diff.

---

## S5 — Server routes + aggregator cache

**Owner:** Sacha
**Files (new):**
- `app/api/strategy/feed/route.ts` — returns aggregated social data per coin
- `app/api/strategy/diag/route.ts` — health diagnostics for all sources

**Pattern reference:** `app/api/crypto/feed/route.ts`, `app/api/news/feed/route.ts`

**Interface:**
```typescript
// GET /api/strategy/feed?coin=bitcoin&bust=1
// Returns:
{
  ok: true,
  version: "strategy-v1",
  coin: "bitcoin",
  asOf: "2026-06-22T14:30:00Z",
  sources: {
    reddit: { ok: true, postCount: 23, topPost: {...} } | { ok: false, error: "rate-limited" },
    youtube: { ok: true, videoCount: 8, topVideo: {...} } | { ok: false, error: "no-key" },
    cryptopanic: { ok: true, postCount: 12, sentiment: "bullish" } | { ok: false, error: "..." },
    github: { ok: true, repoCount: 3, totalCommits7d: 47 } | { ok: false, error: "..." },
    tavily: { ok: true, articleCount: 15, topArticle: {...} } | { ok: false, error: "..." },
    newsapi: { ok: true, articleCount: 8 } | { ok: false, error: "..." },
    coingecko_community: { ok: true, redditSubscribers: 6200000, twitterFollowers: 3500000 } | { ok: false }
  },
  mentionVolume: { last24h: 142, last7d: 987, last7dChange: 0.23 },
  sentiment: {
    score: 0.62,          // [0..1], 0=very bearish, 0.5=neutral, 1=very bullish
    confidence: 0.71,     // [0..1]
    breakdown: {
      reddit: 0.65,
      youtube: 0.58,
      cryptopanic: 0.71
    }
  },
  topTopics: [
    { topic: "regulatory", postCount: 8, share: 0.22 },
    { topic: "on-ramp", postCount: 5, share: 0.14 }
  ],
  topPosts: [
    { source: "reddit", title: "...", url: "...", score: 412, publishedAt: "...", sourceLabel: "r/bitcoin" },
    { source: "youtube", title: "...", url: "...", views: 8200, publishedAt: "...", sourceLabel: "Coin Bureau" },
    { source: "cryptopanic", title: "...", url: "...", votes: { positive: 45, negative: 3 }, publishedAt: "...", sourceLabel: "CoinDesk" }
  ],
  notFinancialAdvice: true,
  cache: { ttlMs: 300000, ageMs: 0, lastFetchedAt: "..." }
}
```

**Acceptance:**
- `pnpm build` exit 0
- `curl /api/strategy/feed?coin=bitcoin` returns 200 with full shape
- `curl /api/strategy/feed?coin=bitcoin&bust=1` bypasses cache
- All sources gracefully degrade when keys missing
- `lastFetchStatus` set per source

**Evidence:** build output, dev-server test (local only), route handler diff.

---

## S6 — /strategy page + daily brief

**Owner:** Sacha
**Files (new):**
- `app/strategy/page.tsx` — the daily brief at the top, per-coin cards below
- `components/StrategyDashboard.tsx` — main client component
- `components/StrategyCard.tsx` — per-coin card

**Pattern reference:** `app/crypto/page.tsx`, `components/CryptoDashboard.tsx`

**Layout (from LCP-50 wireframe):**
```
+---------------------------------------------+
| Atlas Strategy         [Daily brief · 14:00]|
| Social signal, not financial advice         |
+---------------------------------------------+
| Today's movers: BTC, SOL, ADA               |
| (3 one-line blurbs)                         |
+---------------------------------------------+
| [BTC]  social momentum: ●●●○○  0.62        |
|   +6% mentions vs 7d avg                    |
|   Topics: regulatory, on-ramp, mining       |
|   Top posts:                                |
|     - r/bitcoin "..." (412 ↑)               |
|     - YouTube "..." (8.2K views)            |
|   [show all 12 posts →]                     |
+---------------------------------------------+
```

**Acceptance:**
- `pnpm build` exit 0
- Page loads on `/strategy`
- "Not financial advice" disclaimer in persistent banner
- Each card shows: momentum score, mention volume, top 3 posts, top 3 topics
- Tab to filter by source (All / Reddit / YouTube / CryptoPanic / News)
- Empty state when no data: "Connect your sources — see env var list"
- Mobile-responsive

**Evidence:** build output, screenshot in `/docs/strategy/screenshots/`, lighthouse score.

---

## S7 — VADER sentiment integration

**Owner:** Sacha
**Files (new/modified):**
- `lib/sentiment/vader.ts` — VADER lexicon as a TS module
- `app/api/strategy/feed/route.ts` — call VADER on Reddit post titles + descriptions + YouTube titles

**Approach:** Use a port of VADER's `SentimentIntensityAnalyzer` to JS. The VADER lexicon is MIT-licensed and ~7,500 words. Bundle size ~100KB. Score is in [-1, +1]; we map to [0, 1] for the UI.

**Alternative if VADER bundle too large:** use a simpler keyword-based scorer (positive/negative word lists). Less accurate but <10KB.

**Acceptance:**
- `pnpm build` exit 0
- Bundle size delta <150KB
- `lib/sentiment/vader.ts` exports `scoreSentiment(text: string): number` returning [-1, +1]
- Sanity test: "bitcoin to the moon" scores positive, "crash imminent" scores negative, "the price is $60,000" scores near 0

**Evidence:** build output, unit test for `scoreSentiment`.

---

## S8 — Source health monitor + disclaimer

**Owner:** Sacha
**Files (new):**
- `app/api/strategy/diag/route.ts` — returns health for all 6 sources (ok/degraded/down, freshness, last error)
- `components/StrategyHealthBadge.tsx` — shown on /strategy page footer

**Acceptance:**
- `pnpm build` exit 0
- `curl /api/strategy/diag` returns 200 with per-source status
- "Not financial advice" disclaimer visible on /strategy page, /crypto page footer, and /strategy feed JSON
- Health badge: green if all sources ok, amber if any degraded, red if all down

**Evidence:** build output, diag endpoint test, page screenshot.

---

## Sacha dispatch instructions

When SafeTask dispatch becomes available, the prompt to Sacha should be:

> "LCP-51 Atlas Strategy MVP. Approved scope is in /tmp/atlas-bootstrap/Atlas/docs/strategy/lcp-50-scope.md. The implementation plan with full S1-S8 tickets is in /tmp/atlas-bootstrap/Atlas/docs/strategy/lcp-51-implementation-plan.md. S1-S4 connector stubs are already shipped by Alex; you do NOT redo them. Your lane is S5-S8: server routes, /strategy page, VADER integration, source health monitor. Reference connectors in lib/connectors/*. Build must pass. Secret scan must return 0. Commit to main directly. No scope expansion without Alex approval."

---

## Chris action needed

None at this stage. The scope is approved, defaults are in effect, and the implementation can proceed as soon as the dispatch mechanism is available or Alex completes the bounded S1-S4 work.

If X (Twitter) or LunarCrush are added later, that's a separate scope and a separate Chris decision.
