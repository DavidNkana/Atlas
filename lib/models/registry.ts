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
// Day 12 v23: added tavily and perplexity to the cascade. Order matters:
//   1. gemini-search — primary Perplexity-style (Google Search grounding)
//   2. tavily — Tavily web search + Gemini synthesis (works when
//      Gemini grounding is rate-limited)
//   3. perplexity — Perplexity Sonar API (paid-tier, most reliable)
//   4. gemini-flash — plain Gemini (no grounding, no Perplexity shape)
//   5. llama-free, mistral-free — OpenRouter fallbacks
//   6. curatedStub — always available, demo placeholder
export const ALL_MODELS: Model[] = [
  geminiSearch,
  tavily,
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