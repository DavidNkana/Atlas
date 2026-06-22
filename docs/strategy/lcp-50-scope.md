# LCP-50 — Atlas Strategy: scope for multi-source sentiment aggregation

**Status:** scope only, awaiting founder approval. No code to be written until the three open decisions are made.

**Author:** Alex (portfolio manager) on behalf of the founder.
**Date:** 2026-06-22
**Parent LCP:** 1a8d50a8-d8a5-40ec-9aff-9e0048f98267

---

## 1. What "Atlas Strategy" is

A named methodology and product layer that turns raw multi-source public chatter (Reddit, YouTube, X, crypto news, GitHub) into a **decision-support** view for African crypto investors and builders. It is *not* a signal service, *not* a portfolio allocator, *not* a "buy/sell" recommender.

**What it produces:**
- **Per-coin social momentum score** (0–1 scale, normalised across sources) with a confidence band
- **Topic clusters** for what's actually being said: regulatory, technical, hype, scam warnings, on-ramp, exchange-rate impact
- **Anomaly detection** — sudden mention spikes, sentiment flips, new influencer voices
- **Cross-coin correlation** — when SOL pumps, what historically moves with it in the next 24h
- **Daily brief** — one-page summary delivered via in-app dashboard (and optionally email)

**What it explicitly does NOT produce:**
- Buy / sell / hold recommendations
- Price targets
- Portfolio allocation advice
- Anything that could be construed as regulated financial advice

**UI guardrail (non-negotiable):** every Strategy surface carries a persistent "Social signal, not financial advice" disclaimer. No "this coin will go up" language anywhere — only "BTC has 2.3x the social momentum of last week, mostly from regulatory news."

---

## 2. Source matrix

| Source | What we get | API path | Cost band / month | Rate limits | Legal/ToS | Freshness | MVP? | Full? |
|---|---|---|---|---|---|---|---|---|
| **Tavily search** | Crypto news, blog posts, any web page | Existing (we have a key) | $0 (we pay per call, ~$30/mo at low volume) | 1,000 calls/mo free tier, 4,000 on paid | Already licensed | Real-time | ✅ | ✅ |
| **NewsAPI** | Curated news outlets (Reuters, CoinDesk, etc.) | Existing (we have a key) | Free tier 100 req/day, dev plan $449/mo for 250k calls | 100/day free | Display fine, no redistribution | Minutes | ✅ | ✅ |
| **CoinGecko community data** | Reddit/Twitter follower counts, Reddit subscribers, community score | Existing connector | $0 (free tier covers it) | 10-30 calls/min | Display fine | Daily snapshot | ✅ | ✅ |
| **Reddit** | Posts + comments from r/cryptocurrency, r/bitcoin, r/ethtrader, r/ethfinance, r/solana, r/cardano, country subs (r/southafrica, r/nigeria, r/kenya) | Reddit OAuth API | $0 (free tier 100 req/min, 1,000 OAuth clients) | 100 req/min | Official API, display fine, AI-training use prohibited | Real-time | ✅ | ✅ |
| **YouTube** | Video titles, descriptions, view/like counts, transcripts for top crypto channels (Coin Bureau, BitBoy Crypto, Crypto Banter, Altcoin Daily, and 5 African channels) | YouTube Data API v3 | $0 (10,000 units/day free; transcripts cost ~1 unit each, ~$0 if we cap at 200/day) | 10,000 units/day | Display fine, transcript storage for commercial use is gray area — recommend keeping only the title/sentiment not the raw transcript | Hours | ⚠️ (titles only) | ✅ (with transcripts) |
| **CryptoPanic** | Aggregated crypto news with community upvotes, sentiment votes, "hot" / "bullish" / "bearish" / "important" tags | REST API, free tier available | $0 (free) / $49/mo pro | 200 calls/day free | Display fine | Minutes | ✅ | ✅ |
| **GitHub** | Commit frequency, contributor count, issue activity on BTC, ETH, SOL, ADA, and African-relevant repos (e.g., Yellow Card, VALR open-source) | REST API, free | $0 | 5,000 req/hr authenticated | Public data, fine | Real-time | ⚠️ (low priority MVP) | ✅ |
| **X (Twitter) v2** | Tweets, replies, likes, reposts from crypto influencers and the 50 coins' official accounts | X API v2 | **Free: 100 posts/mo (unusable). Basic: $100/mo (10,000 tweets/mo). Pro: $5,000/mo (1M tweets/mo).** Realistic floor $200-500/mo for daily refresh on 50 coins | Per-tier as above | ToS prohibits AI-training use, display via official API fine | Real-time | ❌ (cost blocker) | ✅ IF budget approved |
| **LunarCrush** | Pre-aggregated crypto social sentiment scores across Twitter/Reddit/YouTube/news | REST API | $99/mo starter, $499/mo pro | Per plan | Display fine | Hours | ❌ | ⚠️ (consider as X alternative) |
| **Discord** | Channel messages from crypto servers (r/cryptocurrency, project servers) | Bot OAuth | $0 (free, but high engineering cost) | Rate limits vary by server | Each server ToS must be checked; many prohibit scraping | Real-time | ❌ | ❌ (high effort, low ROI) |
| **Telegram** | Channel messages from crypto news, project channels, African crypto groups | MTProto client | $0 (free) | Flood-wait limits per channel | Some channels prohibit redistribution; murky in some jurisdictions | Real-time | ❌ (legal) | ⚠️ (with legal review) |

**Summary of what's actually buildable in MVP without approval:**
- Tavily (have it) — web-wide signal
- NewsAPI (have it) — curated news
- CoinGecko community (have it) — on-chain social proxy
- Reddit (free) — primary social source
- YouTube titles only (free) — without transcripts to keep legal risk low
- CryptoPanic (free) — already-aggregated news with community votes

**The blocker for "full" coverage is X.** Everything else is free or near-free.

---

## 3. MVP cut (recommended)

**Sources:** Tavily + NewsAPI + CoinGecko community + Reddit + YouTube titles + CryptoPanic
**Monthly cost band:** $0-30 (we already pay for Tavily at low volume)
**Engineering effort:** ~2-3 weeks of one developer

**What "good enough for an African investor" looks like:**
- Open a coin page (e.g., BTC), see a "Social" tab next to "Markets"
- Tab shows: 7-day mention volume, top 3 topics being discussed, 3 most-cited Reddit posts (with link), 3 most-viewed YouTube videos (titles only), aggregated sentiment score with confidence band
- A daily "Strategy Brief" appears on the home dashboard: top 3 movers + what people are saying about them
- All sources cite the original post/video/article — full attribution
- Persistent "not financial advice" disclaimer

**What it does NOT do in MVP:** per-coin X sentiment, transcript-level analysis, anomaly push alerts, email digest, on-chain graph data.

---

## 4. Full cut (recommended)

**All viable sources added** (Reddit, YouTube, YouTube transcripts, Tavily, NewsAPI, CoinGecko community, CryptoPanic, GitHub, optionally LunarCrush as X proxy)

**Two cost bands:**
- **Full without X:** $30-100/mo (mostly CryptoPanic pro tier if needed, otherwise still $0)
- **Full with X basic:** $130-300/mo (X basic $100 + CryptoPanic pro $49 + overhead)

**What unlocks:**
- Real-time mention spikes → push notification "BTC mentions up 3.2x in the last hour, mostly from these 5 posts"
- Sentiment-flip alerts "ETH sentiment turned bearish in the last 6 hours, top reason: [topic]"
- Transcript-level YouTube analysis (after legal review)
- Anomaly correlation with price action (does a mention spike lead a 24h price move?)
- Email daily brief

---

## 5. Sentiment layer decision

Three options:

| Option | Cost | Accuracy on crypto | Speed | Best for |
|---|---|---|---|---|
| **A. Simple lexicon** (VADER or AFINN, free) | $0 | ~60% | Microseconds per post | MVP. Fast, no API cost, decent on clear-cut text |
| **B. Pre-trained model** (e.g., `cardiffnlp/twitter-roberta-base-sentiment-latest`, free Hugging Face) | $0 (inference on Vercel edge) | ~70-75% | ~50ms per post | Full. Crypto-specific pre-trained gives best $/accuracy ratio |
| **C. LLM-as-judge** (call Gemini per post) | $0.001-0.01 per post → $5-50/day at 1,000 posts/day | ~80-85% | ~1-2s per post | NOT recommended. Too slow + too expensive at scale. Use only for top-50 leaderboard re-scoring once a day |

**Recommendation:** **Option B (pre-trained model)** for Full, **Option A (lexicon) for MVP** with a clear path to swap to B later. Handle low-confidence cases by hiding the score and only showing topic clusters + raw posts — better to show less than to show wrong.

**African-context caveat:** all major sentiment models are trained on Western Twitter/Reddit data. African slang, code-switching (English/Portuguese/French + local languages), and African-specific crypto discourse (e.g., p2p USDT trading on WhatsApp) will score poorly. **This is an open research problem, not a quick fix.** For MVP we accept this and label the score with "trained on global data, may underweight African discourse."

---

## 6. UI / product shape

Three options, named:

**Option 1 — "Social" tab on existing /crypto coin pages (MVP-friendly)**
- Each coin gets a new tab next to Markets, Trades, News
- Tab content: mention volume chart, top topics, top posts, sentiment score
- Pro: zero new pages, uses existing /crypto as the entry point
- Con: scattered, no cross-coin "what's hot right now" view

**Option 2 — New /strategy page (Recommended for MVP)**
- Single page with the daily brief at the top, then per-coin expandable cards
- Each card: social momentum gauge, top 3 topics, top 3 posts/videos, "what changed in the last 24h"
- Pro: dedicated surface, easy to expand, can be a daily-visit habit
- Con: another page to discover

**Option 3 — Hybrid (Recommended for Full)**
- /strategy is the home for the daily brief
- Each coin on /crypto gets a "social momentum" badge that links to a slide-out panel with the social detail
- This is the polished version, MVP gets Option 2 first, Option 3 once usage data is in

**Wireframe-level for Option 2 (the recommended MVP):**

```
+---------------------------------------------+
| Atlas Strategy         [Daily brief · 14:00]|
| Social signal, not financial advice         |
+---------------------------------------------+
| Today's movers: BTC, SOL, ADA               |
| (3 one-line blurbs: "regulatory news", ...)  |
+---------------------------------------------+
| [BTC]  social momentum: ●●●○○  0.62        |
|   +6% mentions vs 7d avg                    |
|   Topics: regulatory, on-ramp, mining       |
|   Top posts:                                |
|     - r/bitcoin "..." (412 ↑)               |
|     - YouTube "..." (8.2K views)            |
|   [show all 12 posts →]                     |
+---------------------------------------------+
| [ETH]  social momentum: ●●○○○  0.41        |
|   -12% mentions vs 7d avg                   |
|   ...                                       |
+---------------------------------------------+
| [Show 48 more →]                            |
+---------------------------------------------+
```

---

## 7. Open decisions for the founder

These three questions must be answered before any code is written. Each has a default if you say "whatever you think":

### Decision 1: X (Twitter) API cost tier

| Option | Cost | What it unlocks | Default if no answer |
|---|---|---|---|
| **Skip X for MVP** | $0 | Everything except real-time X sentiment. We use Reddit + YouTube + news as the social proxies. X gaps filled by Tavily + Google site search. | ✅ **Recommended default** |
| **X Basic** | $100/mo | 10,000 tweets/mo read, enough for daily refresh of top-20 coins | |
| **X Pro** | $5,000/mo | 1M tweets/mo, full coverage | NOT recommended at this stage |
| **LunarCrush as X proxy** | $99/mo | Pre-aggregated sentiment score that already includes X (and other sources). No raw tweet access, but cheaper than X Basic. | |

**My recommendation:** start with skip-X + LunarCrush-not-included, ship MVP, then re-evaluate after 30 days of usage data. If users are asking "what are people saying on X about [coin]?" we have evidence to spend the $100/mo.

### Decision 2: Sentiment layer

| Option | Cost | Accuracy | Default if no answer |
|---|---|---|---|
| **Lexicon (VADER)** for MVP, pre-trained (RoBERTa) for Full | $0 | 60% / 75% | ✅ **Recommended default** |
| Lexicon only, forever | $0 | 60% | |
| LLM-as-judge for everything | $5-50/day | 85% | NOT recommended |
| Pre-trained from day 1 | $0 | 75% | Good if you don't mind slower MVP |

**My recommendation:** Lexicon for MVP (faster, ship sooner), pre-trained for Full. The 60%→75% accuracy jump is real but not user-visible enough to delay MVP.

### Decision 3: MVP scope

| Option | What it includes | Default if no answer |
|---|---|---|
| **Tavily + NewsAPI + CoinGecko + Reddit + YouTube titles + CryptoPanic** | Full "social picture" from non-X sources | ✅ **Recommended default** |
| Tavily + NewsAPI only (no new API integration) | Fastest to ship, weakest social signal | |
| Tavily + NewsAPI + Reddit (skip YouTube, CryptoPanic) | Middle ground | |

**My recommendation:** the full "non-X" set. Engineering cost is roughly the same (2-3 weeks), the marginal work to add YouTube titles and CryptoPanic on top of Reddit is small and the marginal value is significant.

---

## 8. Risks and unknowns

| Risk | Severity | Mitigation |
|---|---|---|
| X (Twitter) API hostile to third parties, terms can change overnight | High | Don't depend on X for MVP. Design data layer so a source can be swapped out in <1 day. |
| Reddit API rules changed in 2023, could change again | Medium | Same: design for source replacement. Have a fallback to Pushshift (read-only) if Reddit OAuth breaks. |
| Sentiment model accuracy on African-context posts is unknown | High (research) | Label scores with "trained on global data." Don't surface to users as a hard number. Prefer topic clusters + raw posts, which work regardless of model quality. |
| YouTube transcript storage legality | Medium | For MVP, keep only titles + descriptions + sentiment score, never the raw transcript text. Re-evaluate for Full. |
| Telegram legal status varies by user country | Medium-High | Skip Telegram for MVP. For Full, restrict to channels with public ToS that permit redistribution. |
| Cost blow-up if X usage ramps | Medium | Start with X skip. Add X Basic only if MVP shows demand. Hard cap monthly cost in code (kill switch if daily API spend > $5). |
| API deprecation risk across all sources | High (industry-wide) | Build a source-health monitor: per-source success rate, freshness, cost. Alert if any source degrades. |
| "Atlas Strategy" naming could be misread as a signal service | Low (UX) | Persistent disclaimer. Never say "buy", "sell", "target". Always say "social momentum", "topic cluster", "mention volume". |

---

## 9. Success metrics

How we know it's working:

**Adoption (proxy for value):**
- /strategy page views per week (target: 50+ in month 1, growing)
- Click-through from /crypto coin row → /strategy tab (target: 15%+ of /crypto visitors)
- Daily brief return visits (target: 20%+ of weekly visitors come back next week)

**Quality (proxy for accuracy):**
- Sentiment score vs. 24h price change: we measure correlation, target ≥ 0.3 (weak positive, meaningful) for the top-10 coins over 30 days
- Source freshness: <30min median age for Reddit/news, <6h for YouTube
- Source uptime: ≥95% per source per week

**User-perceived (proxy for trust):**
- Zero reports of "the strategy told me to buy" (would mean UI failed)
- Click-through to original posts ≥40% of social-tab visitors (means we add value, not just summarize)

**Cost guardrails:**
- Monthly API cost ≤$30 (MVP) / ≤$100 (Full without X) / ≤$300 (Full with X Basic)
- Per-request cost tracked per source, alert if any source crosses 2x its expected cost

---

## 10. Sequencing

**Phase 1 — MVP (week 1-3, single developer):**
- Reddit connector (OAuth, free)
- YouTube titles connector (Data API v3, free)
- CryptoPanic connector (free)
- Tavily query templates for "social signal" (we have it)
- VADER lexicon for sentiment
- /strategy page with daily brief + per-coin cards
- Source-health monitor
- "Not financial advice" disclaimer in UI
- Deploy to production, monitor for 2 weeks

**Phase 2 — Upgrade sentiment (week 4):**
- Swap VADER for RoBERTa pre-trained model
- Add GitHub connector (low priority but cheap)
- Add anomaly detection ("BTC mentions 3x normal")
- Add "what changed in 24h" badges on /crypto

**Phase 3 — Topic clusters (week 5-6):**
- Cluster posts by topic (regulatory/technical/hype/scam/on-ramp)
- Wire to a small LLM call (Gemini, we have the key) to label clusters
- Surface "top 3 topics" per coin on /strategy

**Phase 4 — Daily brief email (week 7, optional):**
- Resend integration (we'd need to add the API key, ~$0 to send)
- Cron job: 7am UTC daily brief to opted-in users
- This is the only phase that requires a new paid service (Resend, but at our volume free tier covers it)

**Phase 5 — X (deferred until after Phase 4, conditional on budget approval):**
- X Basic API integration ($100/mo)
- X-specific sentiment layer
- Cross-source sentiment reconciliation
- Estimated additional 1-2 weeks of dev

---

## Handoff to Alex

- **Status:** Scope written, awaiting founder's three decisions.
- **Top 3 recommendations (defaults if founder says "whatever"):**
  1. Skip X for MVP, re-evaluate after 30 days of usage data
  2. Lexicon sentiment for MVP, pre-trained RoBERTa for Full
  3. Full non-X source set (Tavily + NewsAPI + CoinGecko + Reddit + YouTube titles + CryptoPanic)
- **Three open decisions:** see Section 7
- **Hard rule:** no code, no connectors, no /strategy page, no Reddit OAuth app, no YouTube API key requests, no X signup, until the founder picks (or accepts the defaults).
- **Alex action:** present this scope, ask for the three decisions, then dispatch Sacha with an implementation plan if approved.
