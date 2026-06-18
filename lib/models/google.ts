import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Model, ModelRequest, ModelResponse } from './types';

function humanVertical(v: string): string {
  // "gas_station" -> "gas station", "custom:residential_land" -> "residential land"
  const stripped = v.startsWith("custom:") ? v.slice("custom:".length) : v;
  return stripped.replace(/_/g, " ");
}

function buildPrompt(req: ModelRequest): string {
  return 'You are Atlas, a site-selection intelligence engine. The user wants to find the best location for a ' + humanVertical(req.vertical) + ' given this question: "' + req.question + '".\n\nReturn STRICT JSON (no markdown, no commentary, just the JSON object) in this exact shape:\n{"ranked_sites":[{"rank":1,"name":"<short place name>","score":<0.0-1.0>,"confidence":<0.0-1.0>,"rationale":"<1-2 sentences>","lat":<decimal latitude>,"lng":<decimal longitude>}]}\n\nProvide up to 5 ranked sites. Use real place names when you know them. Be specific.\n\nFor each site, also include "lat" and "lng" as decimal coordinates (e.g. -15.3875 for Lusaka latitude). Use real-world coordinates for the place you name.';
}

/**
 * Day 5 hotfix v3 — defensive call().
 *
 * Wraps the entire Gemini call in try/catch. On ANY error (network,
 * JSON.parse, missing fields, non-Error throw), returns { ok: false, error }.
 * NEVER throws out of .call() so the fallback chain in route.ts can
 * always move on to the next model.
 */
export const geminiFlash: Model = {
  info: {
    id: 'gemini-flash',
    displayName: 'Gemini 3.5 Flash (free)',
    shortName: 'Gemini 3.5 Flash',
    provider: 'google',
    free: true,
    description: 'Google Gemini 3.5 Flash. Free tier: 15 RPM / 1500 RPD. Best free default.',
    brandColor: '#4285F4',
    // Simplified Gemini sparkle mark
    logoPath:
      'M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z M19 14L19.7 16.3L22 17L19.7 17.7L19 20L18.3 17.7L16 17L18.3 16.3L19 14Z M5 14L5.5 15.5L7 16L5.5 16.5L5 18L4.5 16.5L3 16L4.5 15.5L5 14Z',
  },
  isAvailable: () => !!process.env.GEMINI_API_KEY,
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return { ok: false, error: 'GEMINI_API_KEY not set' } as any;
      }
      const genAI = new GoogleGenerativeAI(key);
      // Day 12 v25: switch back to gemini-2.0-flash which the
      // new Vercel key has full free-tier access to (50 models
      // including 2.0-flash, per test-keys diagnostic). The old
      // key had limit: 0 on 2.0-flash but the new one is fine.
      // Supports JSON output via responseMimeType.
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { responseMimeType: 'application/json' },
      });
      let text: string;
      try {
        const result = await model.generateContent(buildPrompt(req));
        text = result.response.text();
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        return { ok: false, error: `Gemini request failed: ${msg}` } as any;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        return { ok: false, error: `Gemini returned non-JSON: ${msg}` } as any;
      }
      if (!parsed || !Array.isArray(parsed.ranked_sites)) {
        return { ok: false, error: 'Gemini response missing ranked_sites array' } as any;
      }
      return { ranked_sites: parsed.ranked_sites, raw: text } as any;
    } catch (outerErr) {
      // Last-resort: catch ANY throwable (string, null, undefined, etc.)
      // and convert it to a string error so we never propagate.
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, error: `Gemini call failed: ${msg}` } as any;
    }
  },
};
