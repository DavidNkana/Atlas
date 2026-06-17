import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Model, ModelRequest, ModelResponse } from './types';

function buildPrompt(req: ModelRequest): string {
  return 'You are Atlas, a site-selection intelligence engine. The user wants to find the best location for a ' + req.vertical.replace('_', ' ') + ' given this question: "' + req.question + '".\n\nReturn STRICT JSON (no markdown, no commentary, just the JSON object) in this exact shape:\n{"ranked_sites":[{"rank":1,"name":"<short place name>","score":<0.0-1.0>,"confidence":<0.0-1.0>,"rationale":"<1-2 sentences>"}]}\n\nProvide up to 5 ranked sites. Use real place names when you know them. Be specific.';
}

export const geminiFlash: Model = {
  info: {
    id: 'gemini-flash',
    displayName: 'Gemini 1.5 Flash',
    provider: 'google',
    free: true,
    description: 'Google Gemini 1.5 Flash. Free tier: 15 RPM / 1500 RPD. Best free default.',
  },
  isAvailable: () => !!process.env.GEMINI_API_KEY,
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    try {
      const result = await model.generateContent(buildPrompt(req));
      const text = result.response.text();
      const parsed = JSON.parse(text);
      return { ranked_sites: parsed.ranked_sites, raw: text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gemini call failed: ${msg}`);
    }
  },
};