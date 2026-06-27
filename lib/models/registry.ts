import { geminiSearch } from './gemini-search';
import { perplexity } from './perplexity';
import { llamaFree, mistralFree } from './openrouter';
import { curatedStub } from './stub';
import type { Model, ModelInfo } from './types';

// Day 25 — Model registry simplified.
//
// David: "Models like qwen, llama, and gemini 2.0 flash don't work.
// They fallback to tavily and please. Curated stub should always be
// the final fall back. Remove Tavily as a pickable model — it
// serves its purpose in finding listings and other things. Not as
// a pickable model."
//
// Action:
//   - Tavily removed from both ALL_MODELS and MODEL_INFO. It is no
//     longer exposed to users. The internal `tavily` connector in
//     lib/connectors/tavily-listings.ts is unchanged and still runs
//     behind /api/ask to fetch live Property24/Private Property/etc
//     listings — that's an infrastructure concern, not a model choice.
//   - geminiFlash removed from ALL_MODELS and MODEL_INFO. The Gemini
//     Search model covers all Gemini-backed reasoning.
//   - perplexity, llamaFree, mistralFree remain in ALL_MODELS as
//     INTERNAL fallback options if Gemini Search fails. They are NOT
//     exposed to users via MODEL_INFO.
//   - geminiSearch + curatedStub are the ONLY user-facing models.
//
// Cascade order (handled in app/api/ask/route.ts):
//   1. geminiSearch (primary, rate-limited to Atlas's key)
//   2. perplexity + openrouter (internal fallback, hidden)
//   3. curatedStub (always available, always the final fallback)
export const ALL_MODELS: Model[] = [
  geminiSearch,
  perplexity,
  llamaFree,
  mistralFree,
  curatedStub,
];

// User-facing model list. This drives the SettingsDrawer model picker
// and any other UI that surfaces "which AI answered?". Two models
// only: Gemini Search (when working) and Curated Stub (always works).
export const MODEL_INFO: ModelInfo[] = ALL_MODELS
  .filter((m) => m.info.id === 'gemini-search' || m.info.id === 'curated-stub')
  .map((m) => m.info);

export function getModel(id: string): Model {
  const f = ALL_MODELS.find((m) => m.info.id === id);
  if (!f) throw new Error('Unknown model: ' + id);
  return f;
}

export function getAvailableModels(): Model[] {
  return ALL_MODELS.filter((m) => m.isAvailable());
}