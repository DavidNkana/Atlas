/**
 * LCP-62 — browser-use cloud connector.
 *
 * Sends research tasks to browser-use.com's cloud API, which spins up a
 * real Chromium browser with stealth + residential proxy, navigates sites,
 * extracts data, and returns structured output. Used for Level 3 multi-site
 * research: zoning checks, listing detail pages, competitor analysis.
 *
 * API: POST /api/v3/sessions to create, GET /api/v3/sessions/{id} to poll.
 * Auth: X-Browser-Use-API-Key: bu_... header.
 *
 * Polls every 2 seconds, timeboxed at 4 minutes per research sprint.
 */

const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY;
const BROWSER_USE_BASE = "https://api.browser-use.com/api/v3";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_TIME_MS = 4 * 60 * 1000; // 4 minutes

export interface BrowserUseOptions {
  task: string;
  model?: "gpt-5.4-mini" | "claude-sonnet-4.6" | "claude-opus-4.6";
  proxyCountryCode?: string; // e.g. "za", "zm", "ke"
}

export interface BrowserUseResult {
  ok: boolean;
  output: string;
  sessionId: string;
  liveUrl?: string;
  modelUsed: string;
  elapsedMs: number;
  error?: string;
}

let lastStatus: {
  status: "ok" | "no-key" | "error";
  errorSnippet?: string;
  sessionId?: string;
  lastFetchedAt?: string;
} = { status: "no-key" };

export function getBrowserUseStatus() {
  return lastStatus;
}

export async function runBrowserUseTask(
  opts: BrowserUseOptions,
): Promise<BrowserUseResult> {
  if (!BROWSER_USE_API_KEY) {
    lastStatus = { status: "no-key" };
    return {
      ok: false, output: "", sessionId: "",
      modelUsed: opts.model ?? "gpt-5.4-mini", elapsedMs: 0,
      error: "BROWSER_USE_API_KEY not set in Vercel environment",
    };
  }

  const model = opts.model ?? "gpt-5.4-mini";
  const t0 = Date.now();

  try {
    const createBody: Record<string, unknown> = { task: opts.task, model };
    if (opts.proxyCountryCode) {
      (createBody as Record<string, unknown>).proxy_country_code = opts.proxyCountryCode;
    }

    const createRes = await fetch(`${BROWSER_USE_BASE}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Browser-Use-API-Key": BROWSER_USE_API_KEY,
      },
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      lastStatus = { status: "error", errorSnippet: errText.slice(0, 200), lastFetchedAt: new Date().toISOString() };
      return { ok: false, output: "", sessionId: "", modelUsed: model,
        elapsedMs: Date.now() - t0,
        error: `session creation failed (${createRes.status}): ${errText.slice(0, 200)}` };
    }

    const session = await createRes.json() as { id: string; live_url?: string; status?: string; error?: string };
    const sessionId = session.id;

    if (session.status === "error" || session.error) {
      lastStatus = { status: "error", errorSnippet: session.error ?? "unknown", sessionId, lastFetchedAt: new Date().toISOString() };
      return { ok: false, output: "", sessionId, liveUrl: session.live_url, modelUsed: model,
        elapsedMs: Date.now() - t0,
        error: session.error ?? "browser-use returned error status" };
    }

    // Poll until completion or timeout
    while (Date.now() - t0 < MAX_POLL_TIME_MS) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetch(`${BROWSER_USE_BASE}/sessions/${sessionId}`, {
        headers: { "X-Browser-Use-API-Key": BROWSER_USE_API_KEY },
      });

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        return { ok: false, output: "", sessionId, liveUrl: session.live_url, modelUsed: model,
          elapsedMs: Date.now() - t0,
          error: `poll failed (${pollRes.status}): ${errText.slice(0, 200)}` };
      }

      const state = await pollRes.json() as {
        status?: { value: string }; output?: string; error?: string;
        model?: string; live_url?: string;
      };
      const statusValue = state.status?.value ?? "unknown";

      if (statusValue === "idle" || statusValue === "stopped") {
        const elapsed = Date.now() - t0;
        lastStatus = { status: "ok", sessionId, lastFetchedAt: new Date().toISOString() };
        return {
          ok: !!state.output,
          output: state.output ?? "",
          sessionId,
          liveUrl: state.live_url,
          modelUsed: state.model ?? model,
          elapsedMs: elapsed,
          error: state.output ? undefined : "browser-use completed but returned no output",
        };
      }

      if (statusValue === "error" || statusValue === "timed_out") {
        const elapsed = Date.now() - t0;
        return { ok: false, output: state.output ?? "", sessionId, liveUrl: state.live_url,
          modelUsed: state.model ?? model, elapsedMs: elapsed,
          error: state.error ?? `session ended: ${statusValue}` };
      }
    }

    // Timeout
    return { ok: false, output: "", sessionId, liveUrl: session.live_url, modelUsed: model,
      elapsedMs: Date.now() - t0,
      error: "browser-use research timed out after 4 minutes" };
  } catch (err) {
    lastStatus = { status: "error", errorSnippet: err instanceof Error ? err.message : String(err), lastFetchedAt: new Date().toISOString() };
    return { ok: false, output: "", sessionId: "", modelUsed: model,
      elapsedMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Build a research task prompt for Atlas property queries.
 */
export function buildAtlasResearchTask(opts: {
  city: string; country: string; suburb: string | null;
  vertical: string; plotSizeHectares?: number;
}): string {
  const location = opts.suburb ? `${opts.suburb}, ${opts.city}, ${opts.country}` : `${opts.city}, ${opts.country}`;
  const verticalLabel = opts.vertical.replace(/_/g, " ");
  const sizeHint = opts.plotSizeHectares ? `at least ${opts.plotSizeHectares} hectares` : "";

  return [
    `You are researching property for a ${verticalLabel} in ${location}.`,
    sizeHint ? `Site needs ${sizeHint}.` : "",
    "",
    "1. Search Property24 and PrivateProperty for vacant land / property in this area. Extract top 3: price, erf size, address, listing URL.",
    `2. Check ${opts.city} municipal zoning — what zone is ${location} in? Commercial, residential, industrial?`,
    `3. Google Maps: how many existing ${verticalLabel}s nearby? Major roads?`,
    "",
    "Return as plain text with sections: LISTINGS, ZONING, ACCESS, SUMMARY.",
  ].filter(Boolean).join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
