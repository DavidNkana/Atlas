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
 * Build an OpenRouter-backed Atlas Model.
 *
 * Chain on call:
 *   1. The hardcoded primary if it survives in the discovered free list.
 *   2. The first discovered free model (any).
 *   3. The remaining discovered free models (de-duplicated).
 *   4. The curated stub slugs as last-ditch fallback.
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
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error('OPENROUTER_API_KEY not set');
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

      let lastError: Error | null = null;
      for (const modelId of chain) {
        try {
          const completion = await client.chat.completions.create({
            model: modelId,
            messages: [{ role: 'user', content: buildPrompt(req) }],
            response_format: { type: 'json_object' },
          });
          const text = completion.choices[0]?.message?.content || '{}';
          const parsed = JSON.parse(text);
          return { ranked_sites: parsed.ranked_sites, raw: text };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = new Error(`OpenRouter call failed (${modelId}): ${msg}`);
          // Continue to next fallback.
        }
      }
      throw lastError ?? new Error(`OpenRouter call failed: all ${chain.length} models in chain returned errors`);
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
