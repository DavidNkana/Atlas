import OpenAI from 'openai';
import type { Model, ModelRequest, ModelResponse } from './types';
import { fetchOpenRouterFreeModelIds } from './openrouter-discovery';
import { parseModelOutput } from './lenient-parser';

function humanVertical(v: string): string {
  // "gas_station" -> "gas station", "custom:residential_land" -> "residential land"
  const stripped = v.startsWith("custom:") ? v.slice("custom:".length) : v;
  return stripped.replace(/_/g, " ");
}

function buildPrompt(req: ModelRequest): string {
  // LCP-64 v2 — sectioned rationale matching Gemini's upgraded format.
  return (
    'You are Atlas, a site-selection intelligence engine for African builders and investors.\n' +
    'The user wants to find the best location for a ' + humanVertical(req.vertical) +
    ' given this question: "' + req.question + '".\n\n' +
    'Return STRICT JSON (no markdown, no commentary) in this exact shape:\n' +
    '{"answer":"<one paragraph summary>","ranked_sites":[' +
    '{"rank":1,"name":"<suburb or area name>","suburb":"<suburb>","score":<0-1>,"confidence":<0-1>,' +
    '"rationale":"<2-3 sentences: why this fits>",' +
    '"advantages":{"economic":"<1 paragraph: commercial activity, prices, business density, spending power>",' +
    '"geographic":"<1 paragraph: terrain, flood risk, soil, elevation>",' +
    '"logistical":"<1 paragraph: road access, freight routes, public transport, airports>",' +
    '"demographic":"<1 paragraph: population, income brackets, age, growth rate>"},' +
    '"disadvantages":"<1 paragraph: competition, zoning, congestion, crime, supplier distance, seasonal demand>"},' +
    '"lat":<decimal>,"lng":<decimal>}]}\n\n' +
    'Provide up to 5 ranked sites. Use real suburb names, real property price bands, real landmarks. Be specific.'
  );
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
              // Day 17 v1: no response_format — let the model emit
              // prose OR JSON. The lenient parser handles both.
            });
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
  'Llama 3.3 70B (free)',
  'Meta Llama 3.3 70B Instruct via OpenRouter free tier. Dynamically discovers currently-free models so slugs do not go stale.',
  'meta-llama/llama-3.3-70b-instruct:free',
  // Meta blue
  '#0866FF',
  // Simplified Meta infinity mark
  'M5.5 12C5.5 8.4 8.4 5.5 12 5.5C15.6 5.5 18.5 8.4 18.5 12C18.5 15.6 15.6 18.5 12 18.5C8.4 18.5 5.5 15.6 5.5 12ZM2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12Z'
);

export const mistralFree: Model = makeOpenRouterModel(
  'mistral-free',
  'Qwen 2.5 72B (free)',
  'Qwen 2.5 72B Instruct via OpenRouter free tier. Dynamically discovers currently-free models so slugs do not go stale.',
  'qwen/qwen-2.5-72b-instruct:free',
  // Qwen purple-ish
  '#7C3AED',
  // Simplified Qwen / Mistral flame
  'M12 2C12 2 5 9 5 14C5 17.9 8.1 21 12 21C15.9 21 19 17.9 19 14C19 9 12 2 12 2Z'
);
