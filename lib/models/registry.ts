import { geminiFlash } from './google';
import { geminiSearch } from './gemini-search';
import { tavily } from './tavily';
import { perplexity } from './perplexity';
import { llamaFree, mistralFree } from './openrouter';
import { curatedStub } from './stub';
import type { Model, ModelInfo } from './types';

// OpenRouter-backed models already wire dynamic /models discovery inside
// their call() (see lib/models/openrouter.ts). The registry simply exposes
// them as named Atlas model IDs. Discovery happens lazily on first call,
// not at import time, so import is side-effect-free.
//
// Day 12 v29: David's Vercel Gemini key is hitting 429 quota
// limits on every model id (1.5/2.0/2.5-flash). Rather than
// retry the same broken key 3 times per request, put Tavily
// first. Tavily is now the primary research model. Gemini Search
// is the fallback (in case the key's quota resets).
//
//   1. tavily         — Tavily web search + Gemini 1.5 Flash synthesis
//                       (1,000 free searches/month, working today)
//   2. gemini-search  — Gemini Search grounding (rate-limited today)
//   3. perplexity     — Perplexity Sonar ($5 signup, not enabled)
//   4. gemini-flash   — plain Gemini (rate-limited today)
//   5. openrouter fallbacks
//   6. curatedStub    — always available
export const ALL_MODELS: Model[] = [
  tavily,
  geminiSearch,
  perplexity,
  geminiFlash,
  llamaFree,
  mistralFree,
  curatedStub,
];

export const MODEL_INFO: ModelInfo[] = ALL_MODELS.map((m) => m.info);

export function getModel(id: string): Model {
  const f = ALL_MODELS.find((m) => m.info.id === id);
  if (!f) throw new Error('Unknown model: ' + id);
  return f;
}

export function getAvailableModels(): Model[] {
  return ALL_MODELS.filter((m) => m.isAvailable());
}