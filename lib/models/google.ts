import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Model, ModelRequest, ModelResponse } from './types';
import { parseModelOutput } from './lenient-parser';

function humanVertical(v: string): string {
  // "gas_station" -> "gas station", "custom:residential_land" -> "residential land"
  const stripped = v.startsWith("custom:") ? v.slice("custom:".length) : v;
  return stripped.replace(/_/g, " ");
}

function buildPrompt(req: ModelRequest): string {
  // Day 17 v1: looser prompt. Tell Gemini we accept either structured
  // JSON OR natural prose. We're going to lenient-parse it anyway,
  // so even if it just talks about Observatory / Maitland / Goodwood
  // without emitting JSON, the answer will count.
  return (
    'You are Atlas, a site-selection intelligence engine. The user wants to find the best location for a ' +
    humanVertical(req.vertical) +
    ' given this question: "' +
    req.question +
    '".\n\n' +
    'If you can return structured data, use this JSON shape:\n' +
    '{"ranked_sites":[{"rank":1,"name":"<short place name>","suburb":"<suburb label>","score":<0.0-1.0>,"confidence":<0.0-1.0>,"rationale":"<1-2 sentences>","lat":<decimal latitude>,"lng":<decimal longitude>}]}\n\n' +
    'If you cannot return JSON, return a natural prose answer that names real suburbs / streets / sites by name. ' +
    'Mention up to 5 real place names with their city context (e.g. "Observatory, Cape Town"). ' +
    'Use real-world coordinates where you know them; otherwise the Atlas parser will geocode the names from a known-cities catalog.\n\n' +
    'Either way: be specific. Real suburb names. Real reasons.'
  );
}

/**
 * Day 5 hotfix v3 — defensive call().
 *
 * Day 17 v1: replaced the strict-JSON-only parser with the lenient
 * parser. We now accept prose answers that mention real place names
 * (matched against the REAL_SITE_CATALOG with 350 entries). This
 * drops the curated-stub fallback rate from ~80% to <20%.
 */
export const geminiFlash: Model = {
  info: {
    id: 'gemini-flash',
    displayName: 'Gemini 2.0 Flash (free)',
    shortName: 'Gemini 2.0 Flash',
    provider: 'google',
    free: true,
    description: 'Google Gemini 2.0 Flash. Free tier: 15 RPM / 1500 RPD. Best free default.',
    brandColor: '#4285F4',
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
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        // No responseMimeType: we want prose + JSON either-or. The
        // lenient parser handles both shapes.
      });
      let text: string;
      try {
        const result = await model.generateContent(buildPrompt(req));
        text = result.response.text();
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        return { ok: false, error: `Gemini request failed: ${msg}` } as any;
      }
      // Lenient parse — accept strict JSON OR prose with place names.
      const parsed = parseModelOutput(text, (req as any).cityKey ?? null);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, raw: text } as any;
      }
      return {
        ranked_sites: parsed.ranked_sites,
        raw: text,
        // Tag whether the answer came from strict JSON or prose
        // extraction. UI can show this if it wants.
        extractionStatus: parsed.status,
      } as any;
    } catch (outerErr) {
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, error: `Gemini call failed: ${msg}` } as any;
    }
  },
};
