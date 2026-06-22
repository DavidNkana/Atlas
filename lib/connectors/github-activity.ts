/**
 * LCP-51 S4 — GitHub activity connector.
 *
 * Tracks commit activity for crypto-related open source projects.
 * This is the "is this project still alive?" signal — a project with
 * no commits in 30 days is in trouble, a project with 500+ commits
 * in 7 days is shipping hard. For an African investor evaluating
 * whether to hold a coin, this is one of the few free, objective
 * signals that doesn't come from paid marketing or influencers.
 *
 * Free tier: 60 req/hr unauthenticated, 5,000 req/hr with GITHUB_TOKEN.
 * We use the search/commits endpoint which is cheaper than listing
 * commits: one call tells us commit count for a window.
 *
 * MVP per LCP-50: low priority. We track ~20 named repos. Sacha
 * expands to 50+ in Phase 2 if the signal proves useful.
 *
 * Cache: 1 hour. Commit activity is slow.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_BASE = "https://api.github.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface TrackedRepo {
  repo: string; // "owner/name"
  displayName: string;
  category: "core" | "african" | "ecosystem";
}

const TRACKED_REPOS: TrackedRepo[] = [
  // Core layer-1 protocols
  { repo: "bitcoin/bitcoin", displayName: "Bitcoin Core", category: "core" },
  { repo: "ethereum/go-ethereum", displayName: "Geth (Ethereum)", category: "core" },
  { repo: "ethereum/solidity", displayName: "Solidity", category: "core" },
  { repo: "solana-labs/solana", displayName: "Solana", category: "core" },
  { repo: "cardano-foundation/cardano-js-sdk", displayName: "Cardano JS SDK", category: "core" },
  { repo: "input-output-hk/cardano-node", displayName: "Cardano Node", category: "core" },
  { repo: "ripple/rippled", displayName: "XRP Ledger", category: "core" },
  { repo: "cosmos/cosmos-sdk", displayName: "Cosmos SDK", category: "core" },
  { repo: "polkadot-js/api", displayName: "Polkadot.js", category: "core" },
  { repo: "ChainSafe/web3.js", displayName: "Web3.js", category: "core" },
  // African-relevant (on-ramps, exchanges, payment rails)
  { repo: "yelowcard/rafiki", displayName: "Yellow Card — Rafiki", category: "african" },
  { repo: "luno/luno-python", displayName: "Luno Python", category: "african" },
  { repo: "luno/luno-go", displayName: "Luno Go", category: "african" },
  { repo: "valr/valr-api", displayName: "VALR API", category: "african" },
  { repo: "quidax/quidax-python", displayName: "Quidax Python", category: "african" },
  { repo: "bitnob/bitnob-php", displayName: "Bitnob PHP", category: "african" },
  { repo: "kotanipay/kotani-api", displayName: "Kotani Pay API", category: "african" },
  { repo: "bitmama/bitmama-node", displayName: "Bitmama Node", category: "african" },
  { repo: "paychant/paychant-php", displayName: "Paychant PHP", category: "african" },
  { repo: "bitpesa/api-docs", displayName: "Bitpesa API", category: "african" },
];

export interface GitHubActivity {
  repo: string;
  displayName: string;
  category: TrackedRepo["category"];
  commitsLast7d: number;
  commitsLast30d: number;
  openIssues: number;
  stars: number;
  lastCommitAt: string | null; // ISO
  lastCommitMessage: string | null;
  url: string;
}

export interface GitHubFetchStatus {
  status:
    | "ok"
    | "http-error"
    | "bad-shape"
    | "rate-limited"
    | "ok-partial"
    | "skipped-cache-hit";
  http?: number;
  errorSnippet?: string;
  lastFetchedAt?: string;
  repoCount?: number;
  cacheAgeMs?: number;
}

const cache = new Map<
  string,
  { activity: GitHubActivity[]; expiresAt: number; lastFetchedAt: number }
>();

let lastFetchStatus: GitHubFetchStatus = { status: "skipped-cache-hit" };

export function getGitHubFetchStatus(): GitHubFetchStatus {
  return lastFetchStatus;
}

export function bustGitHubCache(): void {
  cache.clear();
}

function cacheKey(scope: string): string {
  return `github:${scope}`;
}

function getCached(scope: string): {
  activity: GitHubActivity[];
  lastFetchedAt: number;
} | null {
  const entry = cache.get(cacheKey(scope));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(scope));
    return null;
  }
  return { activity: entry.activity, lastFetchedAt: entry.lastFetchedAt };
}

function setCached(scope: string, activity: GitHubActivity[]): void {
  if (activity.length === 0) {
    return; // Guardrail.
  }
  cache.set(cacheKey(scope), {
    activity,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastFetchedAt: Date.now(),
  });
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function githubHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Atlas-Strategy/1.0 (+https://atlas-q2eh.vercel.app)",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (GITHUB_TOKEN) {
    h["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }
  return h;
}

interface RepoData {
  stargazers_count: number;
  open_issues_count: number;
  pushed_at: string;
}

interface CommitData {
  sha: string;
  commit: { message: string; author: { date: string } };
}

/**
 * Fetch activity for a single repo.
 * Returns null on error (rate limit, 404, etc.) — caller decides
 * whether to retry or skip.
 */
export async function fetchRepoActivity(
  repo: string,
  options: { bypassCache?: boolean } = {},
): Promise<GitHubActivity | null> {
  const tracked = TRACKED_REPOS.find((r) => r.repo === repo);
  const displayName = tracked?.displayName ?? repo;
  const category = tracked?.category ?? "ecosystem";
  const scope = `repo:${repo}`;

  if (!options.bypassCache) {
    const cached = getCached(scope);
    if (cached) {
      const match = cached.activity.find((a) => a.repo === repo);
      if (match) return match;
    }
  }

  const since7d = isoDaysAgo(7);
  const since30d = isoDaysAgo(30);

  try {
    // Run all three calls in parallel.
    const [repoRes, commits7dRes, commits30dRes] = await Promise.all([
      fetch(`${GITHUB_BASE}/repos/${repo}`, {
        headers: githubHeaders(),
        cache: "no-store",
      }),
      fetch(
        `${GITHUB_BASE}/search/commits?q=repo:${repo}+committer-date:>=${since7d}&per_page=1`,
        {
          headers: { ...githubHeaders(), Accept: "application/vnd.github.cloak-preview+json" },
          cache: "no-store",
        },
      ),
      fetch(
        `${GITHUB_BASE}/search/commits?q=repo:${repo}+committer-date:>=${since30d}&per_page=1`,
        {
          headers: { ...githubHeaders(), Accept: "application/vnd.github.cloak-preview+json" },
          cache: "no-store",
        },
      ),
    ]);

    if (repoRes.status === 403 || repoRes.status === 429) {
      lastFetchStatus = { status: "rate-limited", http: repoRes.status };
      return null;
    }
    if (!repoRes.ok) {
      lastFetchStatus = {
        status: "http-error",
        http: repoRes.status,
        errorSnippet: (await repoRes.text()).slice(0, 200),
      };
      return null;
    }

    const repoData: RepoData = await repoRes.json();
    const commits7d: { total_count: number; items?: CommitData[] } =
      commits7dRes.ok ? await commits7dRes.json() : { total_count: 0 };
    const commits30d: { total_count: number; items?: CommitData[] } =
      commits30dRes.ok ? await commits30dRes.json() : { total_count: 0 };

    const lastCommit =
      commits7d.items && commits7d.items.length > 0 ? commits7d.items[0] : null;

    return {
      repo,
      displayName,
      category,
      commitsLast7d: commits7d.total_count ?? 0,
      commitsLast30d: commits30d.total_count ?? 0,
      openIssues: repoData.open_issues_count ?? 0,
      stars: repoData.stargazers_count ?? 0,
      lastCommitAt: lastCommit?.commit?.author?.date ?? repoData.pushed_at ?? null,
      lastCommitMessage: lastCommit
        ? (lastCommit.commit.message.split("\n")[0] ?? "").slice(0, 100)
        : null,
      url: `https://github.com/${repo}`,
    };
  } catch (err) {
    lastFetchStatus = {
      status: "http-error",
      errorSnippet: err instanceof Error ? err.message : String(err),
    };
    return null;
  }
}

/**
 * Fetch activity for all tracked crypto repos in parallel.
 * Rate-limit-safe: returns whatever we got, marks the rest as
 * unavailable. The strategy page surfaces "activity unavailable"
 * for missing repos rather than crashing.
 */
export async function fetchCryptoRepoActivity(
  options: { bypassCache?: boolean } = {},
): Promise<GitHubActivity[]> {
  const scope = "tracked";

  if (!options.bypassCache) {
    const cached = getCached(scope);
    if (cached) {
      lastFetchStatus = {
        status: "skipped-cache-hit",
        repoCount: cached.activity.length,
        cacheAgeMs: Date.now() - cached.lastFetchedAt,
        lastFetchedAt: new Date(cached.lastFetchedAt).toISOString(),
      };
      return cached.activity;
    }
  }

  const settled = await Promise.allSettled(
    TRACKED_REPOS.map((r) => fetchRepoActivity(r.repo, options)),
  );

  const activity: GitHubActivity[] = [];
  let anyOk = false;
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) {
      activity.push(r.value);
      anyOk = true;
    }
  }

  if (lastFetchStatus.status !== "rate-limited") {
    lastFetchStatus = {
      status: anyOk ? "ok" : "http-error",
      repoCount: activity.length,
      lastFetchedAt: new Date().toISOString(),
    };
  }

  if (anyOk) {
    setCached(scope, activity);
  }
  return activity;
}

export function getTrackedRepos(): readonly TrackedRepo[] {
  return TRACKED_REPOS;
}
