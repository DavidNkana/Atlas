import OpenAI from 'openai';
import type { Model, ModelRequest, ModelResponse } from './types';

function buildPrompt(req: ModelRequest): string {
  return 'You are Atlas, a site-selection intelligence engine. The user wants to find the best location for a ' + req.vertical.replace('_', ' ') + ' given this question: "' + req.question + '".\n\nReturn STRICT JSON only, in this exact shape:\n{"ranked_sites":[{"rank":1,"name":"<place>","score":<0-1>,"confidence":<0-1>,"rationale":"<1-2 sentences>"}]}\n\nProvide up to 5 ranked sites.';
}

function makeOpenRouterModel(id: string, displayName: string, description: string, upstreamModelId: string): Model {
  return {
    info: { id, displayName, provider: 'openrouter', free: true, description },
    isAvailable: () => !!process.env.OPENROUTER_API_KEY,
    call: async (req: ModelRequest): Promise<ModelResponse> => {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error('OPENROUTER_API_KEY not set');
      const client = new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1' });
      try {
        const completion = await client.chat.completions.create({
          model: upstreamModelId,
          messages: [{ role: 'user', content: buildPrompt(req) }],
          response_format: { type: 'json_object' },
        });
        const text = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(text);
        return { ranked_sites: parsed.ranked_sites, raw: text };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`OpenRouter call failed (${upstreamModelId}): ${msg}`);
      }
    },
  };
}

export const llamaFree: Model = makeOpenRouterModel(
  'llama-free',
  'Llama 3.1 8B (free)',
  'Meta Llama 3.1 8B Instruct via OpenRouter free tier. 20 RPM / 50 RPD.',
  'meta-llama/llama-3.1-8b-instruct:free'
);

export const mistralFree: Model = makeOpenRouterModel(
  'mistral-free',
  'Mistral 7B (free)',
  'Mistral 7B Instruct via OpenRouter free tier. 20 RPM / 50 RPD.',
  'mistralai/mistral-7b-instruct:free'
);