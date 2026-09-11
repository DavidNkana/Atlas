import type {
  Model,
  ModelInterpretation,
  ModelRequest,
  ModelResponse,
  RankedSite,
} from './types';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI's direct API expects the vendor model id without a provider
 * namespace. Custom OpenAI-compatible gateways may use that namespace, so
 * leave their configured model string untouched.
 */
export function normalizeOpenAIModel(model: string, baseUrl?: string): string {
  const normalizedBaseUrl = baseUrl?.replace(/\/+$/, '');
  const isDirectOpenAI = !normalizedBaseUrl || normalizedBaseUrl === OPENAI_BASE_URL;
  return isDirectOpenAI && model.startsWith('openai/') ? model.slice('openai/'.length) : model;
}

function humanVertical(v: string): string {
  const stripped = v.startsWith('custom:') ? v.slice('custom:'.length) : v;
  return stripped.replace(/_/g, ' ');
}

/**
 * Keep this prompt factuality-first: Luna interprets the brief and ranks
 * candidate areas, while Atlas connectors remain the source of evidence.
 */
export function buildPrompt(req: ModelRequest): string {
  return `You are Atlas, a development site-selection engine. Interpret and rank candidate areas for this ${humanVertical(req.vertical)} development brief.

Full natural-language question:
"${req.question}"

Return one JSON object only. Use this shape:
{
  "interpretation": {
    "brief": "plain-language restatement of the user's objective",
    "assumptions": ["explicit assumptions made"],
    "evidenceGaps": ["facts that still need verification"],
    "constraints": ["planning, access, budget, or other constraints stated or implied"],
    "nextDiligence": ["specific next checks, in priority order"]
  },
  "ranked_sites": [{
    "rank": 1,
    "name": "candidate area or proxy site",
    "suburb": "optional suburb label",
    "score": 0.0,
    "confidence": 0.0,
    "rationale": "why this candidate fits the brief and what remains unverified",
    "lat": 0.0,
    "lng": 0.0
  }]
}

Return 1-5 non-empty ranked_sites. Scores and confidence must be between 0 and 1. Do not invent parcels, prices, zoning, traffic, demographics, named businesses, coordinates, URLs, or other factual source data. Only use facts explicitly present in the question; otherwise describe a candidate as a hypothesis and put the missing fact in evidenceGaps. Never imply confirmed entitlement. The selected vertical and the full question are both part of the brief.`;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return values.length > 0 ? values.slice(0, 10) : undefined;
}

function parseInterpretation(value: unknown): ModelInterpretation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const interpretation: ModelInterpretation = {
    brief: typeof source.brief === 'string' && source.brief.trim() ? source.brief.trim() : undefined,
    assumptions: asStringArray(source.assumptions),
    evidenceGaps: asStringArray(source.evidenceGaps),
    constraints: asStringArray(source.constraints),
    nextDiligence: asStringArray(source.nextDiligence),
  };
  return Object.values(interpretation).some((item) => item !== undefined) ? interpretation : undefined;
}

export function parseResponse(text: string): ModelResponse {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: 'OpenAI returned invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'OpenAI returned a non-object JSON response' };
  const source = parsed as Record<string, unknown>;
  if (!Array.isArray(source.ranked_sites) || source.ranked_sites.length === 0) {
    return { ok: false, error: 'OpenAI returned an empty ranked_sites array' };
  }
  const ranked_sites: RankedSite[] = source.ranked_sites.slice(0, 5).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const site = item as Record<string, unknown>;
    if (typeof site.name !== 'string' || !site.name.trim() || typeof site.rationale !== 'string') return [];
    const lat = typeof site.lat === 'number' && Number.isFinite(site.lat) ? site.lat : undefined;
    const lng = typeof site.lng === 'number' && Number.isFinite(site.lng) ? site.lng : undefined;
    return [{
      rank: typeof site.rank === 'number' ? site.rank : index + 1,
      name: site.name.trim(),
      suburb: typeof site.suburb === 'string' ? site.suburb : undefined,
      score: typeof site.score === 'number' && Number.isFinite(site.score) ? Math.max(0, Math.min(1, site.score)) : 0.5,
      confidence: typeof site.confidence === 'number' && Number.isFinite(site.confidence) ? Math.max(0, Math.min(1, site.confidence)) : 0.5,
      rationale: site.rationale.trim(),
      ...(lat !== undefined && lng !== undefined && (lat !== 0 || lng !== 0) ? { lat, lng } : {}),
    }];
  });
  if (ranked_sites.length === 0) return { ok: false, error: 'OpenAI returned no valid ranked sites' };
  return {
    ok: true,
    ranked_sites,
    raw: text,
    interpretation: parseInterpretation(source.interpretation),
  };
}

export const openaiLuna: Model = {
  info: {
    id: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    shortName: 'Luna',
    provider: 'openai',
    free: false,
    description: 'Atlas primary development-brief interpreter via an OpenAI-compatible API.',
    brandColor: '#10A37F',
    logoPath: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 110 12 6 6 0 010-12z',
  },
  isAvailable: () => Boolean(process.env.OPENAI_API_KEY),
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, error: 'OPENAI_API_KEY not set' };
    const baseUrl = process.env.OPENAI_BASE_URL || OPENAI_BASE_URL;
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const configuredModel = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
    const model = normalizeOpenAIModel(configuredModel, baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7_500);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: buildPrompt(req) }],
          max_completion_tokens: 1800,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, error: `OpenAI-compatible HTTP ${response.status}` };
      const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) return { ok: false, error: 'OpenAI-compatible response was empty' };
      return parseResponse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `OpenAI-compatible request failed: ${message}` };
    } finally {
      clearTimeout(timer);
    }
  },
};
