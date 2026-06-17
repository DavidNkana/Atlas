import OpenAI from 'openai';
import type { Model, ModelRequest, ModelResponse } from './types';
import { fetchOpenRouterFreeModels } from './openrouter-discovery';

function buildPrompt(req: ModelRequest): string {
  return 'You are Atlas, a site-selection intelligence engine. The user wants to find the best location for a ' + req.vertical.replace('_', ' ') + ' given this question: "' + req.question + '".\n\nReturn STRICT JSON only, in this exact shape:\n{"ranked_sites":[{"rank":1,"name":"<place>","score":<0-1>,"confidence":<0-1>,"rationale":"<1-2 sentences>"}]}\n\nProvide up to 5 ranked sites.';
}

/**
 * Build an OpenRouter-backed Atlas Model.
 *
 * Behavior:
 *   - `upstreamModelId` is the preferred slug (e.g. "qwen/qwen-2.5-72b-instruct:free").
 *   - On call, we fetch the current OpenRouter /models list and try, in order:
 *       (1) `upstreamModelId` if it still appears in the free list
 *       (2) the first discovered free model
 *       (3) the curated stub list (below) as a last-ditch fallback
 *   - The displayName is dynamic: if the primary slug survives in the free
 *     list we keep its hardcoded friendly name; otherwise we derive one from
 *     whichever free model we picked.
 *
 * If discovery itself fails (network/auth), we fall through to the curated
 * stub list — same as before this refactor — so Atlas never goes dark.
 */
const CURATED_STUB_SLUGS: string[] = [
  'qwen/qwen-2.5-72b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'mistralai/mistral-small-3.2-24b-instruct:free',
];

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

      // Build the dynamic chain:
      //   1. The hardcoded primary if it survives in the discovered free list.
      //   2. The first discovered free model (any).
      //   3. The remaining discovered free models (de-duplicated).
      //   4. The curated stub slugs as last-ditch fallback.
      const discovered = await fetchOpenRouterFreeModels();
      const discoveredIds = discovered.map((m) => m.id);
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
          // Continue to the next fallback. Any failure moves us on.
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