import { geminiFlash } from './google';
import { llamaFree, mistralFree } from './openrouter';
import { curatedStub } from './stub';
import type { Model, ModelInfo } from './types';

export const ALL_MODELS: Model[] = [geminiFlash, llamaFree, mistralFree, curatedStub];

export const MODEL_INFO: ModelInfo[] = ALL_MODELS.map((m) => m.info);

export function getModel(id: string): Model {
  const f = ALL_MODELS.find((m) => m.info.id === id);
  if (!f) throw new Error('Unknown model: ' + id);
  return f;
}

export function getAvailableModels(): Model[] {
  return ALL_MODELS.filter((m) => m.isAvailable());
}