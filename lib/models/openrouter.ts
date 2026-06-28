import type { Model, ModelRequest, ModelResponse } from './types';
import { fetchOpenRouterFreeModelIds } from './openrouter-discovery';
import { parseModelOutput } from './lenient-parser';

function humanVertical(v: string): string {
  // "gas_station" -> "gas station", "custom:residential_land" -> "residential land"
  const stripped = v.startsWith("custom:") ? v.slice("custom:".length) : v;
  return stripped.replace(/_/g, " ");
}

function buildPrompt(req: ModelRequest): string {
  return (
    'You are Atlas, a site-selection engine for African builders.\n' +
    'Find the best ' + humanVertical(req.vertical) + ' for: "' + req.question + '".\n' +
    'Return JSON with this shape:\n' +
    '{"ranked_sites":[{"rank":1,"name":"suburb","suburb":"name","score":0.8,"confidence":0.9,"rationale":"1-2 sentences",' +
    '"advantages":{"economic":"1 paragraph: prices,business,spending","geographic":"1 paragraph: terrain,soil",' +
    '"logistical":"1 paragraph: roads,transport","demographic":"1 paragraph: population,income"},' +
    '"disadvantages":"1 paragraph: honest drawbacks","lat":0,"lng":0}]}\n' +
    'Use real suburbs. Write full paragraphs. Be specific.'
  );
}

/**
 * Last-ditch curated slug list — tried only if discovery returns nothing
 * or all discovered models fail. Keeps Atlas answering even when OpenRouter's
 * /models endpoint is down.
 */
const CURATED_STUB_SLUGS: string[] = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
];

/**
 * Day 5 hotfix v3 — defensive call().
 *
 * Wraps the entire OpenRouter chain in try/catch. NEVER throws out of
 * .call() so the fallback chain in route.ts can always move on.
 *
 * Each individual model in the chain has its own inner try/catch that
 * records lastError and continues. If the entire chain fails, we return
 * { ok: false, error } instead of throwing.
 */
function makeOpenRouterModel(
  id: string,
  hardcodedDisplayName: string,
  description: string,
  upstreamModelId: string,
  brandColor: string,
  logoPath: string
): Model {
  return {
    info: {
      id,
      displayName: hardcodedDisplayName,
      shortName: hardcodedDisplayName,
      provider: 'openrouter',
      free: true,
      description,
      brandColor,
      logoPath,
    },
    isAvailable: () => !!process.env.OPENROUTER_API_KEY,
    call: async (req: ModelRequest): Promise<ModelResponse> => {
      try {
        const key = process.env.OPENROUTER_API_KEY;
        if (!key) {
          return { ok: false, error: 'OPENROUTER_API_KEY not set' } as any;
        }

        const discoveredIds = await fetchOpenRouterFreeModelIds();
        const chain: string[] = [];
        // Curated slugs first — these are confirmed working (health check).
        // Discovered IDs come after since OpenRouter's free model list
        // often includes stale/unavailable models.
        for (const stub of CURATED_STUB_SLUGS) {
          if (!chain.includes(stub)) chain.push(stub);
        }
        if (!chain.includes(upstreamModelId) && discoveredIds.includes(upstreamModelId)) {
          chain.push(upstreamModelId);
        }
        for (const dId of discoveredIds) {
          if (!chain.includes(dId)) chain.push(dId);
        }

        let lastError: string | null = null;
        for (const modelId of chain) {
          try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
              body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: buildPrompt(req) }],
              }),
            });
            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              lastError = `OpenRouter (${modelId}): ${res.status} ${errText.slice(0, 150)}`;
              continue;
            }
            const completion: any = await res.json();
            // Defensive: completion.choices may be missing or empty.
            const choice = completion?.choices?.[0];
            const text = (choice?.message?.content ?? '') as string;
            if (!text || typeof text !== 'string' || text.trim() === '') {
              lastError = `OpenRouter (${modelId}): empty response`;
              continue;
            }
            // Day 17 v1: lenient parse. Accept strict JSON OR prose
            // with real place names matched against REAL_SITE_CATALOG.
            const parsed = parseModelOutput(text, (req as any).cityKey ?? null);
            if (!parsed.ok) {
              lastError = `OpenRouter (${modelId}): ${parsed.error}`;
              continue;
            }
            // Attach advantages/disadvantages from the raw JSON response
            // (the lenient parser strips them, so we re-parse the original)
            try {
              const cleaned = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
              const rawJson = JSON.parse(cleaned);
              const rawSites = rawJson?.ranked_sites ?? [];
              parsed.ranked_sites.forEach((site: any, i: number) => {
                const orig = rawSites[i];
                if (orig?.advantages) site.advantages = orig.advantages;
                if (orig?.disadvantages) site.disadvantages = orig.disadvantages;
              });
            } catch { /* non-fatal */ }
            return {
              ranked_sites: parsed.ranked_sites,
              raw: text,
              extractionStatus: parsed.status,
            } as any;
          } catch (perModelErr) {
            const msg = perModelErr instanceof Error ? perModelErr.message : String(perModelErr);
            lastError = `OpenRouter (${modelId}) call failed: ${msg}`;
            // Continue to next fallback.
          }
        }
        return {
          ok: false,
          error: lastError ?? `OpenRouter call failed: all ${chain.length} models in chain returned errors`,
        } as any;
      } catch (outerErr) {
        // Last-resort: catch ANY throwable.
        const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
        return { ok: false, error: `OpenRouter call failed: ${msg}` } as any;
      }
    },
  };
}

export const llamaFree: Model = makeOpenRouterModel(
  'llama-free',
  'Nemotron 120B (free)',
  'NVIDIA Nemotron 120B via OpenRouter free tier. Confirmed working June 2026.',
  'nvidia/nemotron-3-super-120b-a12b:free',
  '#6366f1',
  'M5.5 12C5.5 8.4 8.4 5.5 12 5.5C15.6 5.5 18.5 8.4 18.5 12C18.5 15.6 15.6 18.5 12 18.5C8.4 18.5 5.5 15.6 5.5 12ZM2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12Z'
);

export const mistralFree: Model = makeOpenRouterModel(
  'mistral-free',
  'Gemma 4 31B (free)',
  'Google Gemma 4 31B via OpenRouter free tier. Dynamically discovers currently-free models so slugs do not go stale.',
  'google/gemma-4-31b-it:free',
  '#10b981',
  'M10 2a8 8 0 015.3 14L17 18H7l1.7-2A8 8 0 0110 2z'
);

