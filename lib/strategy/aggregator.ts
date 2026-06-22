/**
 * LCP-52 — Atlas Strategy shared aggregator.
 *
 * Combines the four social-source connectors (CryptoPanic, YouTube,
 * Reddit, GitHub) into the response shape the /strategy page and
 * the per-coin signal view will consume. Server-only — never
 * imported from a 'use client' file.
 *
 * MVP per LCP-50:
 *   - CryptoPanic: free tier, community-voted news
 *   - YouTube titles: requires YOUTUBE_API_KEY (graceful no-key fallback)
 *   - Reddit: anonymous mode, OAuth2 if REDDIT_CLIENT_ID+SECRET set
 *   - GitHub activity: tracks 20 named repos
 *
 * Sentiment scoring is a VADER-style keyword score on Reddit post
 * titles + selftext + YouTube titles + CryptoPanic titles. The
 * aggregator returns the raw score (in [-1, +1]) plus a label.
 * The UI must display the score as "social momentum", not as
 * financial advice — the LCP-50 disclaimer rule is non-negotiable.
 *
 * Cache: 10 minutes per coin per source-mix. Empty results are
 * never cached (lesson learned from the news connector).
 */

import {
  fetchCryptoPanicPosts,
  getCryptoPanicFetchStatus,
  bustCryptoPanicCache,
  type CryptoPanicPost,
} from "@/lib/connectors/cryptopanic";
import {
  fetchYouTubeTitlesForCoin,
  getYouTubeFetchStatus,
  bustYouTubeCache,
  type YouTubeVideoTitle,
} from "@/lib/connectors/youtube-titles";
import {
  fetchPostsForCoin,
  getRedditFetchStatus,
  bustRedditCache,
  type RedditPost,
} from "@/lib/connectors/reddit";
import {
  fetchCryptoRepoActivity,
  getGitHubFetchStatus,
  bustGitHubCache,
  type GitHubActivity,
} from "@/lib/connectors/github-activity";

export type SourceKey = "reddit" | "youtube" | "cryptopanic" | "github";

export interface SourceHealth {
  ok: boolean;
  error?: string;
  postCount?: number;
  repoCount?: number;
  videoCount?: number;
  lastFetchedAt?: string;
  cacheAgeMs?: number;
}

export interface AggregatedStrategyFeed {
  ok: boolean;
  version: "strategy-v1";
  coin: { id: string; name: string; symbol: string };
  asOf: string;
  sources: {
    reddit: SourceHealth;
    youtube: SourceHealth;
    cryptopanic: SourceHealth;
    github: SourceHealth;
  };
  mentionVolume: {
    last24h: number;
    last7d: number;
    last7dChange: number; // -1..+1
  };
  sentiment: {
    score: number; // 0..1, 0.5 = neutral
    confidence: number; // 0..1
    breakdown: { reddit: number; youtube: number; cryptopanic: number };
  };
  topTopics: { topic: string; postCount: number; share: number }[];
  topPosts: AggregatedTopPost[];
  githubActivity?: GitHubActivity[];
  notFinancialAdvice: true;
  cache: { ttlMs: number; ageMs: number; lastFetchedAt: string };
}

export interface AggregatedTopPost {
  source: SourceKey;
  title: string;
  url: string;
  score: number | null;
  publishedAt: string;
  sourceLabel: string;
  meta?: Record<string, unknown>;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const cache = new Map<
  string,
  { feed: AggregatedStrategyFeed; expiresAt: number; lastFetchedAt: number }
>();

function cacheKey(coinId: string): string {
  return `strategy:coin:${coinId}`;
}

function getCached(coinId: string): AggregatedStrategyFeed | null {
  const entry = cache.get(cacheKey(coinId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(coinId));
    return null;
  }
  return entry.feed;
}

function setCached(coinId: string, feed: AggregatedStrategyFeed): void {
  cache.set(cacheKey(coinId), {
    feed,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastFetchedAt: Date.now(),
  });
}

export function bustStrategyCache(coinId?: string): void {
  if (coinId) {
    cache.delete(cacheKey(coinId));
    return;
  }
  cache.clear();
}

/* ----------------------------------------------------------------- */
/* Sentiment lexicon (LCP-51 S7, MVP version)                         */
/* ----------------------------------------------------------------- */
/**
 * Lightweight keyword-based scorer, in the spirit of VADER. We do
 * not bundle the full VADER lexicon (~7,500 words, 100KB) for the
 * MVP — instead we ship a compact crypto-tuned positive/negative
 * list. Phase 2 (per the LCP-51 plan) swaps this for a pre-trained
 * RoBERTa model.
 *
 * Score is in [-1, +1]. Words can be intensifiers (multiply).
 * Negation flips the sign of the next sentiment word.
 */
const POSITIVE = new Set([
  "bullish", "moon", "mooning", "rally", "rallied", "rallying", "surge",
  "surged", "surging", "pump", "pumped", "pumping", "breakout",
  "adoption", "adopt", "adopted", "adopting", "approve", "approved",
  "approval", "win", "won", "winning", "victory", "milestone",
  "partnership", "integrate", "integrated", "listing", "listed",
  "launch", "launched", "launching", "live", "mainnet", "upgrade",
  "upgraded", "growth", "growing", "record", "ath", "all-time",
  "soar", "soared", "soaring", "beat", "beaten", "outperform",
  "outperformed", "strong", "stronger", "strongest", "support",
  "backing", "backed", "innovative", "breakthrough", "success",
  "successful", "profitable", "profit", "gains", "gain", "gained",
  "rising", "rise", "rose", "recover", "recovered", "recovering",
  "optimistic", "opportunity", "potential", "promising", "positive",
  "good", "great", "excellent", "amazing", "best", "incredible",
  "huge", "massive", "stronghold", "accumulate", "accumulating",
  "accumulation",
]);

const NEGATIVE = new Set([
  "bearish", "crash", "crashed", "crashing", "dump", "dumped",
  "dumping", "plunge", "plunged", "plunging", "collapse", "collapsed",
  "collapsing", "drop", "dropped", "dropping", "fall", "fell",
  "falling", "fear", "panic", "sell-off", "selloff", "liquidation",
  "liquidated", "liquidations", "rugpull", "rug", "scam", "fraud",
  "hack", "hacked", "hacking", "exploit", "exploited", "exploit",
  "vulnerability", "vulnerable", "ban", "banned", "banning", "ban",
  "restrict", "restricted", "restricting", "restrictive", "lawsuit",
  "sued", "sue", "suing", "investigation", "investigated",
  "investigating", "raid", "raided", "warning", "warned", "warns",
  "risk", "risky", "danger", "dangerous", "concern", "concerns",
  "concerned", "worry", "worried", "worrying", "loss", "losses",
  "lost", "losing", "loser", "weak", "weaker", "weakest",
  "underperform", "underperformed", "delay", "delayed", "delays",
  "postpone", "postponed", "fail", "failed", "failing", "failure",
  "dead", "dying", "decline", "declined", "declining", "decrease",
  "decreased", "decreasing", "low", "lows", "bottom", "bottoms",
  "bad", "worse", "worst", "terrible", "awful", "horrible", "ugly",
  "misleading", "deceptive", "ponzi", "pyramid", "fraudulent",
  "centralized", "custodial", "compromised", "breach", "breached",
  "shut", "shutdown", "shut down", "frozen", "freeze", "halt",
  "halted", "halting", "negative", "down", "bear",
]);

const INTENSIFIERS: Record<string, number> = {
  very: 1.5, extremely: 2, really: 1.3, super: 1.5, mega: 1.7,
  ultra: 1.8, insanely: 2, totally: 1.4, absolutely: 1.6, completely: 1.4,
  highly: 1.3, strongly: 1.3, massive: 1.5, huge: 1.3, major: 1.3,
};

const NEGATION = new Set([
  "not", "no", "never", "n't", "none", "nothing", "neither", "nor",
  "without", "hardly", "barely", "scarcely",
]);

const TOPIC_KEYWORDS: Record<string, string[]> = {
  regulatory: [
    "sec", "regulation", "regulatory", "regulator", "compliance", "ban",
    "law", "legal", "court", "judge", "lawsuit", "ftc", "cftc", "treasury",
    "fca", "government", "congress", "senator", "bill", "etf",
  ],
  onramp: [
    "onramp", "on-ramp", "offramp", "off-ramp", "exchange", "buy",
    "purchase", "withdraw", "deposit", "fiat", "ngn", "zar", "kes",
    "ghs", "m-pesa", "mtn", "airtel", "yellow card", "luno", "valr",
    "quidax", "bitnob", "p2p", "peer-to-peer", "localbitcoins", "binance p2p",
  ],
  technical: [
    "mainnet", "testnet", "upgrade", "fork", "merge", "staking", "validator",
    "node", "block", "hash", "consensus", "layer 2", "l2", "rollup",
    "zk", "sharding", "eip", "bip", "taproot", "lightning", "segwit",
  ],
  security: [
    "hack", "exploit", "vulnerability", "breach", "stolen", "lost funds",
    "rug", "rugpull", "scam", "phishing", "private key", "seed phrase",
    "compromised", "leak", "leaked", "drained",
  ],
  market: [
    "price", "rally", "crash", "surge", "dump", "pump", "ath", "atl",
    "support", "resistance", "breakout", "volume", "liquidity", "whale",
    "buy", "sell", "long", "short", "position", "trade", "trader",
  ],
  adoption: [
    "partnership", "integrate", "integrated", "merchant", "payment",
    "launch", "mainstream", "institutional", "etf", "etp", "spot",
    "futures", "custody", "wallet", "user", "users", "adoption", "adopt",
  ],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function scoreSentiment(text: string): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;
  let total = 0;
  let weight = 0;
  let negate = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (NEGATION.has(t)) {
      negate = true;
      continue;
    }
    if (INTENSIFIERS[t]) {
      // Apply on next sentiment token
      const next = tokens[i + 1];
      if (next && (POSITIVE.has(next) || NEGATIVE.has(next))) {
        weight = INTENSIFIERS[t];
      }
      continue;
    }
    let sign = 0;
    if (POSITIVE.has(t)) sign = 1;
    else if (NEGATIVE.has(t)) sign = -1;
    if (sign !== 0) {
      const effectiveSign = negate ? -sign : sign;
      total += effectiveSign * Math.max(weight, 1);
      weight = 0;
      negate = false;
    }
  }
  // Normalise to [-1, 1] by length of sentiment-bearing tokens
  const denom = Math.max(1, total !== 0 ? Math.abs(total) : 1);
  const raw = total / Math.max(tokens.length / 4, denom);
  return Math.max(-1, Math.min(1, raw));
}

function topicCounts(texts: string[]): { topic: string; postCount: number; share: number }[] {
  const counts: Record<string, number> = {};
  for (const topic of Object.keys(TOPIC_KEYWORDS)) counts[topic] = 0;
  for (const text of texts) {
    const tokens = new Set(tokenize(text));
    for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
      for (const kw of kws) {
        const kt = kw.toLowerCase();
        if (kt.includes(" ") ? text.toLowerCase().includes(kt) : tokens.has(kt)) {
          counts[topic] = (counts[topic] ?? 0) + 1;
          break;
        }
      }
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .map(([topic, c]) => ({ topic, postCount: c, share: c / total }))
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, 5);
}

function toMentionVolume(reddit: RedditPost[], yt: YouTubeVideoTitle[], cp: CryptoPanicPost[]) {
  // We don't have true daily mention counts without history; use post
  // count over the last 24h as a proxy (Reddit timestamps, YouTube
  // publishedAt, CryptoPanic publishedAt).
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;
  const within = (iso: string | null | undefined, ms: number) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && now - t <= ms;
  };
  let d = 0, w = 0;
  for (const p of reddit) {
    if (within(p.createdUtc, WEEK)) w++;
    if (within(p.createdUtc, DAY)) d++;
  }
  for (const v of yt) {
    if (within(v.publishedAt, WEEK)) w++;
    if (within(v.publishedAt, DAY)) d++;
  }
  for (const c of cp) {
    if (within(c.publishedAt, WEEK)) w++;
    if (within(c.publishedAt, DAY)) d++;
  }
  // 7d change is a rough proxy: 1 - (last24h*7 / last7d) clamped
  const expected = w / 7 || 1;
  const change = expected === 0 ? 0 : (d - expected) / expected;
  return {
    last24h: d,
    last7d: w,
    last7dChange: Math.max(-1, Math.min(1, change)),
  };
}

function normaliseSentiment(scores: { source: string; score: number; n: number }[]): {
  score: number; // 0..1
  confidence: number; // 0..1
  breakdown: { reddit: number; youtube: number; cryptopanic: number };
} {
  // score in [-1, 1] -> 0..1 via (x+1)/2; weight by sample count
  const breakdown: Record<string, number> = {
    reddit: 0.5,
    youtube: 0.5,
    cryptopanic: 0.5,
  };
  let totalWeight = 0;
  let weighted = 0;
  for (const s of scores) {
    const norm = (s.score + 1) / 2;
    breakdown[s.source] = Number(norm.toFixed(3));
    const w = Math.max(1, s.n);
    weighted += norm * w;
    totalWeight += w;
  }
  const score = totalWeight === 0 ? 0.5 : weighted / totalWeight;
  const confidence = Math.max(
    0,
    Math.min(1, totalWeight / 30), // saturate at ~30 posts scored
  );
  return {
    score: Number(score.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    breakdown: breakdown as { reddit: number; youtube: number; cryptopanic: number },
  };
}

export const COIN_MAP: Record<string, { id: string; name: string; symbol: string }> = {
  bitcoin: { id: "bitcoin", name: "Bitcoin", symbol: "BTC" },
  ethereum: { id: "ethereum", name: "Ethereum", symbol: "ETH" },
  solana: { id: "solana", name: "Solana", symbol: "SOL" },
  cardano: { id: "cardano", name: "Cardano", symbol: "ADA" },
  ripple: { id: "ripple", name: "XRP", symbol: "XRP" },
  dogecoin: { id: "dogecoin", name: "Dogecoin", symbol: "DOGE" },
  polkadot: { id: "polkadot", name: "Polkadot", symbol: "DOT" },
  "matic-network": { id: "matic-network", name: "Polygon", symbol: "MATIC" },
  litecoin: { id: "litecoin", name: "Litecoin", symbol: "LTC" },
  "avalanche-2": { id: "avalanche-2", name: "Avalanche", symbol: "AVAX" },
  chainlink: { id: "chainlink", name: "Chainlink", symbol: "LINK" },
  near: { id: "near", name: "Near", symbol: "NEAR" },
  cosmos: { id: "cosmos", name: "Cosmos", symbol: "ATOM" },
  uniswap: { id: "uniswap", name: "Uniswap", symbol: "UNI" },
  stellar: { id: "stellar", name: "Stellar", symbol: "XLM" },
  algorand: { id: "algorand", name: "Algorand", symbol: "ALGO" },
  filecoin: { id: "filecoin", name: "Filecoin", symbol: "FIL" },
  aptos: { id: "aptos", name: "Aptos", symbol: "APT" },
  arbitrum: { id: "arbitrum", name: "Arbitrum", symbol: "ARB" },
};

function coinForKey(coinKey: string): { id: string; name: string; symbol: string } | null {
  return COIN_MAP[coinKey.toLowerCase()] ?? null;
}

export function listSupportedCoins(): { id: string; name: string; symbol: string }[] {
  return Object.values(COIN_MAP);
}

export function isSupportedCoin(coinKey: string): boolean {
  return coinKey.toLowerCase() in COIN_MAP;
}

/**
 * Build the aggregated feed for a single coin. This is the heavy
 * work the API route will call.
 */
export async function buildStrategyFeed(
  coinKey: string,
  options: { bypassCache?: boolean } = {},
): Promise<AggregatedStrategyFeed> {
  const coin = coinForKey(coinKey);
  if (!coin) {
    throw new Error(`Unsupported coin: ${coinKey}`);
  }

  if (!options.bypassCache) {
    const cached = getCached(coin.id);
    if (cached) return cached;
  }

  if (options.bypassCache) {
    bustStrategyCache(coin.id);
    bustCryptoPanicCache();
    bustYouTubeCache();
    bustRedditCache();
    bustGitHubCache();
  }

  const [reddit, youtube, cryptopanic, github] = await Promise.allSettled([
    fetchPostsForCoin(coin, { limit: 15 }),
    fetchYouTubeTitlesForCoin(coin, { maxResults: 10 }),
    fetchCryptoPanicPosts({ coins: [coin.symbol, ...ALIASES[coin.id] ?? []] }),
    fetchCryptoRepoActivity(),
  ]);

  const redditPosts = reddit.status === "fulfilled" ? reddit.value : [];
  const youtubeVideos = youtube.status === "fulfilled" ? youtube.value : [];
  const cpPosts = cryptopanic.status === "fulfilled" ? cryptopanic.value : [];
  const ghActivity = github.status === "fulfilled" ? github.value : [];

  // Sentiment scoring
  const redditTexts = redditPosts.map((p) => `${p.title} ${p.selftext}`);
  const ytTexts = youtubeVideos.map((v) => `${v.title} ${v.description}`);
  const cpTexts = cpPosts.map((c) => c.title);

  const redditScores = redditTexts.map((t) => ({ source: "reddit", score: scoreSentiment(t), n: 1 }));
  const ytScores = ytTexts.map((t) => ({ source: "youtube", score: scoreSentiment(t), n: 1 }));
  const cpScores = cpTexts.map((t) => ({ source: "cryptopanic", score: scoreSentiment(t), n: 1 }));
  const sentiment = normaliseSentiment([...redditScores, ...ytScores, ...cpScores]);

  // Topics
  const allTexts = [...redditTexts, ...ytTexts, ...cpTexts];
  const topTopics = topicCounts(allTexts);

  // Top posts merged
  const topPosts: AggregatedTopPost[] = [
    ...redditPosts.slice(0, 3).map((p) => ({
      source: "reddit" as const,
      title: p.title,
      url: p.url,
      score: p.score,
      publishedAt: p.createdUtc,
      sourceLabel: p.subreddit,
      meta: { numComments: p.numComments, author: p.author, flair: p.flair },
    })),
    ...youtubeVideos.slice(0, 3).map((v) => ({
      source: "youtube" as const,
      title: v.title,
      url: v.url,
      score: null,
      publishedAt: v.publishedAt,
      sourceLabel: v.channelTitle,
    })),
    ...cpPosts.slice(0, 3).map((c) => ({
      source: "cryptopanic" as const,
      title: c.title,
      url: c.url,
      score: c.votes.positive - c.votes.negative,
      publishedAt: c.publishedAt,
      sourceLabel: c.source,
      meta: { votes: c.votes, sentiment: c.sentiment },
    })),
  ]
    .sort((a, b) => {
      // newest first; if same age, fall back to score
      const at = new Date(a.publishedAt).getTime();
      const bt = new Date(b.publishedAt).getTime();
      if (bt !== at) return bt - at;
      return (b.score ?? 0) - (a.score ?? 0);
    })
    .slice(0, 10);

  const mentionVolume = toMentionVolume(redditPosts, youtubeVideos, cpPosts);

  // Filter GitHub to repos for this coin (best-effort symbol match)
  const coinSymbol = coin.symbol.toLowerCase();
  const coinName = coin.name.toLowerCase();
  const ghForCoin = ghActivity.filter((a) => {
    const hay = `${a.repo} ${a.displayName} ${a.category}`.toLowerCase();
    return hay.includes(coinSymbol) || hay.includes(coinName);
  });

  // Source health
  const cpStatus = getCryptoPanicFetchStatus();
  const ytStatus = getYouTubeFetchStatus();
  const rdStatus = getRedditFetchStatus();
  const ghStatus = getGitHubFetchStatus();

  const feed: AggregatedStrategyFeed = {
    ok: true,
    version: "strategy-v1",
    coin,
    asOf: new Date().toISOString(),
    sources: {
      reddit: {
        ok: redditPosts.length > 0,
        postCount: redditPosts.length,
        lastFetchedAt: rdStatus.lastFetchedAt,
        cacheAgeMs: rdStatus.cacheAgeMs,
        error: reddit.status === "rejected" ? String(reddit.reason) : rdStatus.status !== "ok" && rdStatus.status !== "skipped-cache-hit" ? rdStatus.errorSnippet : undefined,
      },
      youtube: {
        ok: youtubeVideos.length > 0,
        videoCount: youtubeVideos.length,
        lastFetchedAt: ytStatus.lastFetchedAt,
        cacheAgeMs: ytStatus.cacheAgeMs,
        error: youtube.status === "rejected" ? String(youtube.reason) : ytStatus.status !== "ok" && ytStatus.status !== "skipped-cache-hit" ? ytStatus.errorSnippet : undefined,
      },
      cryptopanic: {
        ok: cpPosts.length > 0,
        postCount: cpPosts.length,
        lastFetchedAt: cpStatus.lastFetchedAt,
        cacheAgeMs: cpStatus.cacheAgeMs,
        error: cryptopanic.status === "rejected" ? String(cryptopanic.reason) : cpStatus.status !== "ok" && cpStatus.status !== "skipped-cache-hit" ? cpStatus.errorSnippet : undefined,
      },
      github: {
        ok: ghForCoin.length > 0 || ghActivity.length > 0,
        repoCount: ghForCoin.length || ghActivity.length,
        lastFetchedAt: ghStatus.lastFetchedAt,
        cacheAgeMs: ghStatus.cacheAgeMs,
        error: github.status === "rejected" ? String(github.reason) : ghStatus.status !== "ok" && ghStatus.status !== "skipped-cache-hit" ? ghStatus.errorSnippet : undefined,
      },
    },
    mentionVolume,
    sentiment,
    topTopics,
    topPosts,
    githubActivity: ghForCoin.length > 0 ? ghForCoin : ghActivity.slice(0, 5),
    notFinancialAdvice: true,
    cache: {
      ttlMs: CACHE_TTL_MS,
      ageMs: 0,
      lastFetchedAt: new Date().toISOString(),
    },
  };

  setCached(coin.id, feed);
  return feed;
}

const ALIASES: Record<string, string[]> = {
  bitcoin: ["XBT"],
  ethereum: ["ETH2"],
  "matic-network": ["POL", "MATIC"],
  "avalanche-2": ["AVAX"],
  ripple: ["XRP"],
};
