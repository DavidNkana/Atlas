/**
 * LCP-55 — Atlas Algorithm.
 *
 * The founder's boss's rule: "Sum the digits. If odd, keep it. If even,
 * throw it away." Then rank by mention count in the qualified set.
 *
 * Per-source "number to digit-sum":
 *   - YouTube:   video duration as raw displayed digits, colon-stripped
 *                ("6:47" → 6+4+7 = 17, odd → qualifies)
 *                ("20:15" → 2+0+1+5 = 8, even → disqualified)
 *                ("1:02:30" → 1+0+2+3+0 = 6, even → disqualified)
 *   - GitHub:    commits in the last 7 days, per repo
 *                (47 → 4+7 = 11, odd → qualifies)
 *   - CryptoPanic: votes.positive - votes.negative (net votes)
 *                  (23 → 2+3 = 5, odd → qualifies)
 *   - Reddit:    post score (upvotes)
 *                (412 → 4+1+2 = 7, odd → qualifies)
 *
 * Trending = count of qualified mentions per coin, ranked descending.
 * Return top 50.
 *
 * IMPORTANT: this is the founder's boss's rule, applied at Atlas.
 * Not a financial signal. The rule and its origin are surfaced
 * verbatim in the response's methodology field so anyone who sees
 * the data knows where it came from.
 */

import { COIN_MAP } from "./aggregator";
import type { RedditPost } from "@/lib/connectors/reddit";
import type { YouTubeVideoTitle } from "@/lib/connectors/youtube-titles";
import type { CryptoPanicPost } from "@/lib/connectors/cryptopanic";
import type { GitHubActivity } from "@/lib/connectors/github-activity";

/* ----------------------------------------------------------------- */
/* The core rule.                                                      */
/* ----------------------------------------------------------------- */

/**
 * Sum the digits of a number. Negative numbers sum the absolute value.
 * Returns 0 for non-finite inputs.
 */
export function digitSum(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const abs = Math.abs(Math.trunc(n));
  if (abs === 0) return 0;
  let s = 0;
  let m = abs;
  while (m > 0) {
    s += m % 10;
    m = Math.floor(m / 10);
  }
  return s;
}

/** True if a number's digit sum is odd. The Atlas rule. */
export function isOddDigitSum(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  if (n === 0) return false; // 0 has digit sum 0, which is even
  return digitSum(n) % 2 === 1;
}

/**
 * Parse a YouTube ISO-8601 duration ("PT6M47S", "PT1H2M30S") to
 * a number, or fall back to parsing "M:SS" / "H:MM:SS" strings.
 * Returns null if the string doesn't look like a duration.
 */
export function parseYouTubeDurationToSeconds(input: string | undefined | null): number | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  // ISO 8601: PT[hours]H[minutes]M[seconds]S
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (iso) {
    const h = Number(iso[1] ?? 0);
    const m = Number(iso[2] ?? 0);
    const sec = Number(iso[3] ?? 0);
    return h * 3600 + m * 60 + sec;
  }
  // M:SS or H:MM:SS
  const parts = s.split(":").map((p) => Number(p));
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

/**
 * The Atlas rule applied to a YouTube duration string.
 * Parses the duration, takes the digit sum of the raw displayed
 * digits (NOT total seconds — the user clarified: "6:47 not seconds").
 *
 * If the duration cannot be parsed, returns { qualified: false, reason }.
 * If the digit sum is odd, qualified is true. Otherwise false.
 */
export function youTubeDurationQualifies(durationLike: string | null | undefined): {
  qualified: boolean;
  digits: string;
  digitSum: number;
  reason?: string;
} {
  if (!durationLike) {
    return { qualified: false, digits: "", digitSum: 0, reason: "no-duration" };
  }
  const raw = String(durationLike).trim();
  // Strip the colons, keep the digits as displayed
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 0) {
    return { qualified: false, digits: "", digitSum: 0, reason: "no-digits" };
  }
  // Sum the displayed digits, not the parsed seconds
  const sum = digits.split("").reduce((acc, c) => acc + Number(c), 0);
  return { qualified: sum % 2 === 1, digits, digitSum: sum };
}

/* ----------------------------------------------------------------- */
/* Coin extraction (shared with trending.ts pattern)                  */
/* ----------------------------------------------------------------- */

const COIN_INDEX: Map<string, { id: string; name: string; symbol: string }> = (() => {
  const idx = new Map<string, { id: string; name: string; symbol: string }>();
  for (const c of Object.values(COIN_MAP)) {
    const aliases = new Set<string>([
      c.symbol.toLowerCase(),
      c.id.toLowerCase(),
      c.name.toLowerCase(),
    ]);
    const MANUAL: Record<string, string[]> = {
      bitcoin: ["xbt"],
      ethereum: ["eth2"],
      ripple: ["xrp"],
      "matic-network": ["pol", "matic"],
      "avalanche-2": ["avax"],
    };
    for (const a of MANUAL[c.id] ?? []) aliases.add(a);
    const entry = { id: c.id, name: c.name, symbol: c.symbol };
    for (const a of aliases) idx.set(a, entry);
  }
  return idx;
})();

function pickCoinInText(text: string): { id: string; name: string; symbol: string } | null {
  const lower = text.toLowerCase();
  const sorted = Array.from(COIN_INDEX.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, entry] of sorted) {
    if (lower.includes(alias)) return entry;
  }
  return null;
}

const REPO_TO_COIN: { match: (s: string) => boolean; id: string }[] =
  Object.values(COIN_MAP).map((c) => ({
    id: c.id,
    match: (s: string) => {
      const sym = c.symbol.toLowerCase();
      const name = c.name.toLowerCase();
      return s.toLowerCase().includes(sym) || s.toLowerCase().includes(name);
    },
  }));

/* ----------------------------------------------------------------- */
/* Per-source filtering                                                */
/* ----------------------------------------------------------------- */

export interface QualifiedMention {
  source: "reddit" | "youtube" | "cryptopanic" | "github";
  coin: { id: string; name: string; symbol: string };
  /** The number that was digit-summed. */
  number: number;
  /** The digit sum of that number. */
  sum: number;
  /** Display label for the qualifying value (e.g. "6:47" for YouTube). */
  valueLabel: string;
  /** Source text/title for sample display. */
  sample: string;
  /** Original timestamp of the source. */
  at: string | null;
  /** Original URL if available. */
  url: string | null;
}

export interface SourceFilterResult {
  qualified: QualifiedMention[];
  qualifiedCount: number;
  totalCount: number;
}

function filterReddit(posts: RedditPost[]): SourceFilterResult {
  const qualified: QualifiedMention[] = [];
  for (const post of posts) {
    if (!isOddDigitSum(post.score)) continue;
    const text = `${post.title} ${post.selftext}`;
    const coin = pickCoinInText(text);
    if (!coin) continue;
    qualified.push({
      source: "reddit",
      coin,
      number: post.score,
      sum: digitSum(post.score),
      valueLabel: `${post.score} upvotes`,
      sample: post.title,
      at: post.createdUtc,
      url: post.url,
    });
  }
  return { qualified, qualifiedCount: qualified.length, totalCount: posts.length };
}

function filterYouTube(videos: YouTubeVideoTitle[]): SourceFilterResult {
  // LCP-56 — YouTube connector now returns `duration` (ISO 8601 from
  // contentDetails.duration). Apply the founder's boss's rule: sum
  // the displayed digits of the duration (colon-stripped); if odd,
  // qualify.
  const qualified: QualifiedMention[] = [];
  for (const video of videos) {
    if (!video.duration) continue;
    const check = youTubeDurationQualifies(video.duration);
    if (!check.qualified) continue;
    const text = `${video.title} ${video.description}`;
    const coin = pickCoinInText(text);
    if (!coin) continue;
    qualified.push({
      source: "youtube",
      coin,
      number: check.digitSum,
      sum: check.digitSum,
      valueLabel: `${video.duration} (digits ${check.digits}, sum ${check.digitSum})`,
      sample: video.title,
      at: video.publishedAt,
      url: video.url,
    });
  }
  return { qualified, qualifiedCount: qualified.length, totalCount: videos.length };
}

function filterCryptoPanic(posts: CryptoPanicPost[]): SourceFilterResult {
  const qualified: QualifiedMention[] = [];
  for (const post of posts) {
    const net = post.votes.positive - post.votes.negative;
    if (!isOddDigitSum(net)) continue;
    // Use the first currency code as the coin association.
    const sym = post.currencies?.[0]?.code;
    if (!sym) continue;
    const coin = COIN_INDEX.get(sym.toLowerCase());
    if (!coin) continue;
    qualified.push({
      source: "cryptopanic",
      coin,
      number: net,
      sum: digitSum(net),
      valueLabel: `${net} net votes (${post.votes.positive}+ / ${post.votes.negative}-)`,
      sample: post.title,
      at: post.publishedAt,
      url: post.url,
    });
  }
  return { qualified, qualifiedCount: qualified.length, totalCount: posts.length };
}

function filterGitHub(activity: GitHubActivity[]): SourceFilterResult {
  const qualified: QualifiedMention[] = [];
  for (const a of activity) {
    const n = a.commitsLast7d;
    if (!isOddDigitSum(n)) continue;
    const found = REPO_TO_COIN.find((m) => m.match(a.repo) || m.match(a.displayName));
    if (!found) continue;
    const coin = COIN_MAP[found.id];
    if (!coin) continue;
    qualified.push({
      source: "github",
      coin,
      number: n,
      sum: digitSum(n),
      valueLabel: `${a.displayName} (${n} commits / 7d)`,
      sample: a.lastCommitMessage ?? a.repo,
      at: a.lastCommitAt,
      url: a.url,
    });
  }
  return { qualified, qualifiedCount: qualified.length, totalCount: activity.length };
}

/* ----------------------------------------------------------------- */
/* Aggregation + ranking                                                */
/* ----------------------------------------------------------------- */

export interface AlgorithmTrendingCoin {
  rank: number;
  id: string;
  name: string;
  symbol: string;
  /** Count of qualified mentions across all 4 sources. */
  qualifiedMentions: number;
  /** Per-source qualified mention counts. */
  bySource: {
    reddit: number;
    youtube: number;
    cryptopanic: number;
    github: number;
  };
  /** Most recent qualified mention across any source. */
  lastQualifiedAt: string | null;
  /** Sample (up to 3 of the most recent qualified mentions). */
  sample: QualifiedMention[];
}

export interface AlgorithmInputs {
  reddit: RedditPost[];
  youtube: YouTubeVideoTitle[];
  cryptopanic: CryptoPanicPost[];
  github: GitHubActivity[];
}

export interface AlgorithmResult {
  ok: boolean;
  version: "atlas-algorithm-v1";
  asOf: string;
  /** The rule, stated plainly. */
  methodology: {
    rule: string;
    byline: string;
    perSource: {
      youtube: string;
      github: string;
      cryptopanic: string;
      reddit: string;
    };
    ranking: "qualified_mention_count_desc";
    outputSize: number;
    notFinancialAdvice: true;
  };
  /** Per-source filter stats so the user can see how the rule behaved. */
  filterStats: {
    youtube: { total: number; qualified: number; reason: string };
    github: { total: number; qualified: number; reason: string };
    cryptopanic: { total: number; qualified: number; reason: string };
    reddit: { total: number; qualified: number; reason: string };
  };
  /** Top 50 trending coins, ranked by qualified mention count desc. */
  trending: AlgorithmTrendingCoin[];
  cache: { ttlMs: number; ageMs: number; lastFetchedAt: string };
}

export function buildAlgorithm(
  inputs: AlgorithmInputs,
  options: { limit?: number } = {},
): AlgorithmResult {
  const limit = options.limit ?? 50;

  const reddit = filterReddit(inputs.reddit);
  const youtube = filterYouTube(inputs.youtube);
  const cryptopanic = filterCryptoPanic(inputs.cryptopanic);
  const github = filterGitHub(inputs.github);

  const allQualified = [
    ...reddit.qualified,
    ...youtube.qualified,
    ...cryptopanic.qualified,
    ...github.qualified,
  ];

  // Per-coin aggregation
  type Agg = {
    coin: { id: string; name: string; symbol: string };
    qualifiedMentions: number;
    bySource: { reddit: number; youtube: number; cryptopanic: number; github: number };
    lastQualifiedAt: string | null;
    sample: QualifiedMention[];
  };
  const agg = new Map<string, Agg>();
  for (const m of allQualified) {
    const existing = agg.get(m.coin.id) ?? {
      coin: m.coin,
      qualifiedMentions: 0,
      bySource: { reddit: 0, youtube: 0, cryptopanic: 0, github: 0 },
      lastQualifiedAt: null,
      sample: [],
    };
    existing.qualifiedMentions++;
    existing.bySource[m.source]++;
    if (m.at) {
      const t = new Date(m.at).getTime();
      if (!existing.lastQualifiedAt || t > new Date(existing.lastQualifiedAt).getTime()) {
        existing.lastQualifiedAt = m.at;
      }
    }
    // Keep up to 3 most recent mentions (by timestamp)
    existing.sample.push(m);
    existing.sample.sort((a, b) => {
      const at = new Date(a.at ?? 0).getTime();
      const bt = new Date(b.at ?? 0).getTime();
      return bt - at;
    });
    existing.sample = existing.sample.slice(0, 3);
    agg.set(m.coin.id, existing);
  }

  const ranked = Array.from(agg.values())
    .sort((a, b) => {
      if (b.qualifiedMentions !== a.qualifiedMentions) {
        return b.qualifiedMentions - a.qualifiedMentions;
      }
      const at = new Date(a.lastQualifiedAt ?? 0).getTime();
      const bt = new Date(b.lastQualifiedAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return a.coin.symbol.localeCompare(b.coin.symbol);
    })
    .slice(0, limit);

  const trending: AlgorithmTrendingCoin[] = ranked.map((c, i) => ({
    rank: i + 1,
    id: c.coin.id,
    name: c.coin.name,
    symbol: c.coin.symbol,
    qualifiedMentions: c.qualifiedMentions,
    bySource: c.bySource,
    lastQualifiedAt: c.lastQualifiedAt,
    sample: c.sample,
  }));

  return {
    ok: true,
    version: "atlas-algorithm-v1",
    asOf: new Date().toISOString(),
    methodology: {
      rule: "Sum the digits. If odd, keep the item. If even, throw it away. Rank by mention count in the qualified set.",
      byline:
        "Invented by the founder's boss, applied at Atlas as a social-trend filter. Not a financial signal.",
      perSource: {
        youtube:
          "Video duration as raw displayed digits (colon-stripped). '6:47' → 6+4+7=17 (odd, qualifies). '20:15' → 2+0+1+5=8 (even, disqualified).",
        github:
          "Commits in the last 7 days, per repo. 47 → 4+7=11 (odd). 12 → 1+2=3 (odd). 8 → 8 (even, disqualified).",
        cryptopanic:
          "Net votes (positive − negative). 23 → 2+3=5 (odd). 22 → 2+2=4 (even, disqualified).",
        reddit:
          "Post score (upvotes). 412 → 4+1+2=7 (odd). 200 → 2+0+0=2 (even, disqualified).",
      },
      ranking: "qualified_mention_count_desc",
      outputSize: limit,
      notFinancialAdvice: true,
    },
    filterStats: {
      youtube: {
        total: youtube.totalCount,
        qualified: youtube.qualifiedCount,
        reason:
          youtube.qualifiedCount === 0 && youtube.totalCount > 0
            ? "YouTube videos came back but videos.list enrichment did not surface a parseable duration. Most likely cause: live-streams (no duration) or upstream rate-limit."
            : "ok",
      },
      github: {
        total: github.totalCount,
        qualified: github.qualifiedCount,
        reason: "ok",
      },
      cryptopanic: {
        total: cryptopanic.totalCount,
        qualified: cryptopanic.qualifiedCount,
        reason: "ok",
      },
      reddit: {
        total: reddit.totalCount,
        qualified: reddit.qualifiedCount,
        reason: "ok",
      },
    },
    trending,
    cache: {
      ttlMs: 10 * 60 * 1000,
      ageMs: 0,
      lastFetchedAt: new Date().toISOString(),
    },
  };
}
