import OpenAI from 'openai';
import type { Model, ModelRequest, ModelResponse } from './types';

function buildPrompt(req: ModelRequest): string {
  return 'You are Atlas, a site-selection intelligence engine. The user wants to find the best location for a ' + req.vertical.replace('_', ' ') + ' given this question: "' + req.question + '".\n\nReturn STRICT JSON only, in this exact shape:\n{"ranked_sites":[{"rank":1,"name":"<place>","score":<0-1>,"confidence":<0-1>,"rationale":"<1-2 sentences>"}]}\n\nProvide up to 5 ranked sites.';
}

// OpenRouter free-tier models rotate frequently. We keep a hardcoded fallback
// chain so Atlas stays alive even when a primary slug is removed from the
// free tier. The chain is tried in order; if all fail, the last error wins.
const OPENROUTER_FALLBACK_CHAIN: string[] = [
  'qwen/qwen-2.5-72b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'mistralai/mistral-small-3.2-24b-instruct:free',
];

function makeOpenRouterModel(id: string, displayName: string, description: string, upstreamModelId: string): Model {
  return {
    info: { id, displayName, provider: 'openrouter', free: true, description },
    isAvailable: () => !!process.env.OPENROUTER_API_KEY,
    call: async (req: ModelRequest): Promise<ModelResponse> => {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error('OPENROUTER_API_KEY not set');
      const client = new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1' });
      // Primary first, then the fallback chain (de-duplicated).
      const chain = [upstreamModelId, ...OPENROUTER_FALLBACK_CHAIN.filter((m) => m !== upstreamModelId)];
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
          // Continue to the next fallback. Only break on non-404-style failures? For now,
          // we trust the chain: any failure moves us on. This protects against free-tier
          // slug rotation without sacrificing paid-model availability signals (paid models
          // are wired separately).
        }
      }
      throw lastError ?? new Error(`OpenRouter call failed: all ${chain.length} models in chain returned errors`);
    },
  };
}

export const llamaFree: Model = makeOpenRouterModel(
  'llama-free',
  'Llama 3.3 70B (free)',
  'Meta Llama 3.3 70B Instruct via OpenRouter free tier. 20 RPM / 50 RPD. Has fallback chain for free-tier rotation.',
  'meta-llama/llama-3.3-70b-instruct:free'
);

export const mistralFree: Model = makeOpenRouterModel(
  'mistral-free',
  'Qwen 2.5 72B (free)',
  'Qwen 2.5 72B Instruct via OpenRouter free tier. 20 RPM / 50 RPD. Has fallback chain for free-tier rotation.',
  'qwen/qwen-2.5-72b-instruct:free'
);