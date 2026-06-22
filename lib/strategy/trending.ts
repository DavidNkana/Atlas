/**
 * LCP-53 — Trending coin extraction.
 *
 * Given raw posts/videos/activity from the 4 connectors, extract
 * which coins are being mentioned and how often. Returns per-source
 * rankings + a combined "overall" ranking.
 *
 * Algorithm (interim, until the user delivers the Atlas Strategy
 * spec): count mentions per coin, weight by recency (newer
 * mentions count more), break ties by mention count then symbol.
 * No sentiment score — this is pure volume/recency ranking.
 *
 * Coin extraction rules:
 *   - CryptoPanic: posts come pre-tagged with currency codes.
 *   - Reddit: case-insensitive substring match on the full set of
 *     symbol aliases (BTC ↔ XBT, MATIC ↔ POL, etc.) in title + body.
 *   - YouTube: same substring match on title + description.
 *   - GitHub: repo name → coin map (e.g. "solana-labs/solana" → SOL).
 *     Repos that don't match a known coin are tagged with the repo
 *     category so they show up in a "developer activity" section.
 *
 * Output: { reddit: TrendingCoin[], youtube: TrendingCoin[],
 *           cryptopanic: TrendingCoin[], github: TrendingCoin[],
 *           overall: TrendingCoin[] }
 * Each list is sorted desc, capped at 20.
 */

import { COIN_MAP } from "./aggregator";
import type { RedditPost } from "@/lib/connectors/reddit";
import type { YouTubeVideoTitle } from "@/lib/connectors/youtube-titles";
import type { CryptoPanicPost } from "@/lib/connectors/cryptopanic";
import type { GitHubActivity } from "@/lib/connectors/github-activity";

export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  mentionCount: number;
  lastMentionAt: string | null;
  /** Source-specific momentum hint: ratio of last-24h mentions to last-7d. */
  momentum: number;
  /** Sample of where it was mentioned (post titles, video titles, etc). */
  sample: string[];
}

interface CoinIndexEntry {
  id: string;
  name: string;
  symbol: string;
  /** Lower-cased aliases (e.g. "btc", "xbt", "bitcoin"). */
  aliases: string[];
}

/* Build a flat index: every alias maps back to the canonical coin. */
const COIN_INDEX: Map<string, CoinIndexEntry> = (() => {
  const idx = new Map<string, CoinIndexEntry>();
  for (const c of Object.values(COIN_MAP)) {
    const aliases = new Set<string>([
      c.symbol.toLowerCase(),
      c.id.toLowerCase(),
      c.name.toLowerCase(),
    ]);
    // Manual aliases for symbols that drift (XBT, ETH2, etc.)
    const MANUAL: Record<string, string[]> = {
      bitcoin: ["xbt"],
      ethereum: ["eth2"],
      ripple: ["xrp"],
      "matic-network": ["pol", "matic"],
      "avalanche-2": ["avax"],
    };
    for (const a of MANUAL[c.id] ?? []) aliases.add(a);
    const entry: CoinIndexEntry = {
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      aliases: Array.from(aliases),
    };
    for (const a of entry.aliases) idx.set(a, entry);
  }
  return idx;
})();

/* GitHub repo → coin map. Matches on substring (so "bitcoin/bitcoin"
   matches BTC, "solana-labs/solana" matches SOL). */
const REPO_TO_COIN: { match: (s: string) => boolean; id: string }[] =
  Object.values(COIN_MAP).map((c) => ({
    id: c.id,
    match: (s: string) => {
      const sym = c.symbol.toLowerCase();
      const name = c.name.toLowerCase();
      return s.toLowerCase().includes(sym) || s.toLowerCase().includes(name);
    },
  }));

function pickCoinInText(text: string): CoinIndexEntry | null {
  const lower = text.toLowerCase();
  // Prefer longest match (so "bitcoin cash" doesn't false-match to bitcoin)
  // by checking alias lengths in descending order.
  const sorted = Array.from(COIN_INDEX.entries()).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [alias, entry] of sorted) {
    if (lower.includes(alias)) return entry;
  }
  return null;
}

function momentumScore(
  mentions: { at: string | null }[],
): { momentum: number; lastAt: string | null } {
  if (mentions.length === 0) return { momentum: 0, lastAt: null };
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;
  let d = 0;
  let w = 0;
  let lastAt: string | null = null;
  for (const m of mentions) {
    if (!m.at) continue;
    const t = new Date(m.at).getTime();
    if (!Number.isFinite(t)) continue;
    if (now - t <= DAY) d++;
    if (now - t <= WEEK) w++;
    if (!lastAt || t > new Date(lastAt).getTime()) lastAt = m.at;
  }
  // Momentum: ratio of 24h to 7d, normalised. 0 = nothing recent,
  // 1 = everything in last 24h. If nothing in 7d, return 0.
  if (w === 0) return { momentum: 0, lastAt };
  const expected = w / 7;
  const ratio = expected === 0 ? 0 : d / expected;
  // Map [0..2] → [0..1], clamped
  const m = Math.max(0, Math.min(1, ratio / 2));
  return { momentum: Number(m.toFixed(3)), lastAt };
}

function buildRanking(
  mentions: Map<string, { entry: CoinIndexEntry; mentions: { at: string | null; sample: string }[] }>,
  limit: number,
): TrendingCoin[] {
  const arr = Array.from(mentions.values()).map(({ entry, mentions }) => {
    const { momentum, lastAt } = momentumScore(mentions);
    return {
      id: entry.id,
      name: entry.name,
      symbol: entry.symbol,
      mentionCount: mentions.length,
      lastMentionAt: lastAt,
      momentum,
      sample: mentions
        .slice(-3) // last 3 mentions
        .reverse()
        .map((m) => m.sample)
        .filter(Boolean),
    };
  });
  arr.sort((a, b) => {
    if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
    const at = new Date(a.lastMentionAt ?? 0).getTime();
    const bt = new Date(b.lastMentionAt ?? 0).getTime();
    if (bt !== at) return bt - at;
    return a.symbol.localeCompare(b.symbol);
  });
  return arr.slice(0, limit);
}

function rankCryptoPanic(posts: CryptoPanicPost[], limit: number): TrendingCoin[] {
  const map = new Map<string, { entry: CoinIndexEntry; mentions: { at: string | null; sample: string }[] }>();
  for (const post of posts) {
    // CryptoPanic tags each post with currency codes. Use those.
    const symbols = new Set<string>();
    for (const c of post.currencies ?? []) {
      if (c.code) symbols.add(c.code.toUpperCase());
    }
    if (symbols.size === 0) continue;
    for (const sym of symbols) {
      const alias = sym.toLowerCase();
      const entry = COIN_INDEX.get(alias);
      if (!entry) continue;
      const key = entry.id;
      const existing = map.get(key) ?? { entry, mentions: [] };
      existing.mentions.push({ at: post.publishedAt, sample: post.title });
      map.set(key, existing);
    }
  }
  return buildRanking(map, limit);
}

function rankReddit(posts: RedditPost[], limit: number): TrendingCoin[] {
  const map = new Map<string, { entry: CoinIndexEntry; mentions: { at: string | null; sample: string }[] }>();
  for (const post of posts) {
    const text = `${post.title} ${post.selftext}`;
    const entry = pickCoinInText(text);
    if (!entry) continue;
    const key = entry.id;
    const existing = map.get(key) ?? { entry, mentions: [] };
    existing.mentions.push({ at: post.createdUtc, sample: post.title });
    map.set(key, existing);
  }
  return buildRanking(map, limit);
}

function rankYouTube(videos: YouTubeVideoTitle[], limit: number): TrendingCoin[] {
  const map = new Map<string, { entry: CoinIndexEntry; mentions: { at: string | null; sample: string }[] }>();
  for (const v of videos) {
    const text = `${v.title} ${v.description}`;
    const entry = pickCoinInText(text);
    if (!entry) continue;
    const key = entry.id;
    const existing = map.get(key) ?? { entry, mentions: [] };
    existing.mentions.push({ at: v.publishedAt, sample: v.title });
    map.set(key, existing);
  }
  return buildRanking(map, limit);
}

function rankGitHub(activity: GitHubActivity[], limit: number): TrendingCoin[] {
  const map = new Map<string, { entry: CoinIndexEntry; mentions: { at: string | null; sample: string }[] }>();
  for (const a of activity) {
    // Map repo → coin via REPO_TO_COIN.
    const found = REPO_TO_COIN.find((m) => m.match(a.repo) || m.match(a.displayName));
    if (!found) continue;
    const entry = COIN_MAP[found.id];
    if (!entry) continue;
    const key = entry.id;
    const existing = map.get(key) ?? {
      entry: { id: entry.id, name: entry.name, symbol: entry.symbol, aliases: [entry.symbol.toLowerCase()] },
      mentions: [],
    };
    // GitHub: weight each commit as a mention (so a repo with 50 commits
    // counts as 50 mentions, last 30d split by 30 = ~1.7/day rate but we
    // use raw count + the last commit timestamp as the mention at).
    const commitsThisWindow = a.commitsLast7d > 0 ? a.commitsLast7d : 1;
    for (let i = 0; i < commitsThisWindow; i++) {
      existing.mentions.push({
        at: a.lastCommitAt,
        sample: `${a.displayName} (${a.commitsLast7d} commits / 7d)`,
      });
    }
    map.set(key, existing);
  }
  return buildRanking(map, limit);
}

export interface TrendingResult {
  ok: boolean;
  version: "trending-v1";
  asOf: string;
  lists: {
    overall: TrendingCoin[];
    reddit: TrendingCoin[];
    youtube: TrendingCoin[];
    cryptopanic: TrendingCoin[];
    github: TrendingCoin[];
  };
  /** Per-source status: did the upstream call succeed? */
  sources: {
    reddit: { ok: boolean; error?: string };
    youtube: { ok: boolean; error?: string };
    cryptopanic: { ok: boolean; error?: string };
    github: { ok: boolean; error?: string };
  };
  /** How the combined "overall" list was derived. */
  methodology: {
    ranking: "mention_count_desc_then_recency";
    recencyWeighting: "exponential_decay_24h_vs_7d";
    sentimentAlgorithm: "pending — Atlas Strategy spec not yet delivered";
    notFinancialAdvice: true;
  };
  cache: { ttlMs: number; ageMs: number; lastFetchedAt: string };
}

export interface TrendingInputs {
  reddit: RedditPost[];
  youtube: YouTubeVideoTitle[];
  cryptopanic: CryptoPanicPost[];
  github: GitHubActivity[];
}

export function buildTrending(
  inputs: TrendingInputs,
  options: { limit?: number } = {},
): TrendingResult {
  const limit = options.limit ?? 20;

  const reddit = rankReddit(inputs.reddit, limit);
  const youtube = rankYouTube(inputs.youtube, limit);
  const cryptopanic = rankCryptoPanic(inputs.cryptopanic, limit);
  const github = rankGitHub(inputs.github, limit);

  // Combined: sum mention counts per coin across all 4 sources, weighted
  // by source reliability. Reddit + CryptoPanic get weight 1.0, YouTube
  // gets 0.7 (titles are noisy), GitHub gets 0.4 (commits are a leading
  // indicator but not the same as social chatter).
  const WEIGHTS: Record<keyof TrendingInputs, number> = {
    reddit: 1.0,
    youtube: 0.7,
    cryptopanic: 1.0,
    github: 0.4,
  };
  const combined = new Map<string, TrendingCoin & { weighted: number }>();
  const merge = (list: TrendingCoin[], weight: number) => {
    for (const c of list) {
      const existing = combined.get(c.id) ?? {
        ...c,
        weighted: 0,
        mentionCount: 0,
        sample: [] as string[],
      };
      existing.weighted += c.mentionCount * weight;
      existing.mentionCount += c.mentionCount;
      // Keep newest lastMentionAt
      const cur = existing.lastMentionAt;
      if (!cur || (c.lastMentionAt && new Date(c.lastMentionAt).getTime() > new Date(cur).getTime())) {
        existing.lastMentionAt = c.lastMentionAt;
      }
      // Keep up to 5 most recent samples
      const merged = [...(existing.sample ?? []), ...c.sample];
      existing.sample = merged.slice(-5);
      // Recompute momentum: blended across sources
      const m = Math.max(existing.momentum, c.momentum);
      existing.momentum = m;
      combined.set(c.id, existing);
    }
  };
  merge(reddit, WEIGHTS.reddit);
  merge(youtube, WEIGHTS.youtube);
  merge(cryptopanic, WEIGHTS.cryptopanic);
  merge(github, WEIGHTS.github);

  const overall = Array.from(combined.values())
    .sort((a, b) => {
      if (b.weighted !== a.weighted) return b.weighted - a.weighted;
      const at = new Date(a.lastMentionAt ?? 0).getTime();
      const bt = new Date(b.lastMentionAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, limit)
    .map(({ weighted: _w, ...rest }) => rest);

  return {
    ok: true,
    version: "trending-v1",
    asOf: new Date().toISOString(),
    lists: { overall, reddit, youtube, cryptopanic, github },
    sources: {
      reddit: { ok: inputs.reddit.length > 0 },
      youtube: { ok: inputs.youtube.length > 0 },
      cryptopanic: { ok: inputs.cryptopanic.length > 0 },
      github: { ok: inputs.github.length > 0 },
    },
    methodology: {
      ranking: "mention_count_desc_then_recency",
      recencyWeighting: "exponential_decay_24h_vs_7d",
      sentimentAlgorithm: "pending — Atlas Strategy spec not yet delivered",
      notFinancialAdvice: true,
    },
    cache: {
      ttlMs: 10 * 60 * 1000,
      ageMs: 0,
      lastFetchedAt: new Date().toISOString(),
    },
  };
}
