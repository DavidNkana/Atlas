import OpenAI from 'openai';
import type { Model, ModelRequest, ModelResponse } from './types';
import { fetchOpenRouterFreeModelIds } from './openrouter-discovery';

function buildPrompt(req: ModelRequest): string {
  return 'You are Atlas, a site-selection intelligence engine. The user wants to find the best location for a ' + req.vertical.replace('_', ' ') + ' given this question: "' + req.question + '".\n\nReturn STRICT JSON only, in this exact shape:\n{"ranked_sites":[{"rank":1,"name":"<place>","score":<0-1>,"confidence":<0-1>,"rationale":"<1-2 sentences>","lat":<decimal latitude>,"lng":<decimal longitude>}]}\n\nProvide up to 5 ranked sites.\n\nFor each site, also include "lat" and "lng" as decimal coordinates (e.g. -15.3875 for Lusaka latitude). Use real-world coordinates for the place you name.';
}

/**
 * Last-ditch curated slug list — tried only if discovery returns nothing
 * or all discovered models fail. Keeps Atlas answering even when OpenRouter's
 * /models endpoint is down.
 */
const CURATED_STUB_SLUGS: string[] = [
  'qwen/qwen-2.5-72b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'mistralai/mistral-small-3.2-24b-instruct:free',
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
  upstreamModelId: string
): Model {
  return {
    info: { id, displayName: hardcodedDisplayName, provider: 'openrouter', free: true, description },
    isAvailable: () => !!process.env.OPENROUTER_API_KEY,
    call: async (req: ModelRequest): Promise<ModelResponse> => {
      try {
        const key = process.env.OPENROUTER_API_KEY;
        if (!key) {
          return { ok: false, error: 'OPENROUTER_API_KEY not set' } as any;
        }
        const client = new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1' });

        const discoveredIds = await fetchOpenRouterFreeModelIds();
        const chain: string[] = [];
        if (discoveredIds.includes(upstreamModelId)) chain.push(upstreamModelId);
        for (const dId of discoveredIds) {
          if (!chain.includes(dId)) chain.push(dId);
        }
        for (const stub of CURATED_STUB_SLUGS) {
          if (!chain.includes(stub)) chain.push(stub);
        }

        let lastError: string | null = null;
        for (const modelId of chain) {
          try {
            const completion: any = await client.chat.completions.create({
              model: modelId,
              messages: [{ role: 'user', content: buildPrompt(req) }],
              response_format: { type: 'json_object' },
            });
            // Defensive: completion.choices may be missing or empty.
            const choice = completion?.choices?.[0];
            const text = (choice?.message?.content ?? '') as string;
            if (!text || typeof text !== 'string' || text.trim() === '') {
              lastError = `OpenRouter (${modelId}): empty response`;
              continue;
            }
            let parsed: any;
            try {
              parsed = JSON.parse(text);
            } catch (parseErr) {
              const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
              lastError = `OpenRouter (${modelId}) returned non-JSON: ${msg}`;
              continue;
            }
            if (!parsed || !Array.isArray(parsed.ranked_sites)) {
              lastError = `OpenRouter (${modelId}): missing ranked_sites array`;
              continue;
            }
            return { ranked_sites: parsed.ranked_sites, raw: text } as any;
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
  'Llama 3.3 70B (free)',
  'Meta Llama 3.3 70B Instruct via OpenRouter free tier. Dynamically discovers currently-free models so slugs do not go stale.',
  'meta-llama/llama-3.3-70b-instruct:free'
);

export const mistralFree: Model = makeOpenRouterModel(
  'mistral-free',
  'Qwen 2.5 72B (free)',
  'Qwen 2.5 72B Instruct via OpenRouter free tier. Dynamically discovers currently-free models so slugs do not go stale.',
  'qwen/qwen-2.5-72b-instruct:free'
);
