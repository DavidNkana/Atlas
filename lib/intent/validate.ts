import {
  CUSTOM_VERTICAL_RE,
  VERTICAL_ALIASES,
  VERTICAL_LABELS,
  VERTICALS,
  isSupportedVertical,
  type AtlasVertical,
  type SupportedVertical,
} from "@/lib/verticals";

export type ValidationCode = "valid" | "invalid_prompt" | "needs_clarification" | "vertical_mismatch";
export type ValidationStatus = ValidationCode;

export type ValidationDetails = {
  reason: string;
  example: string;
  suggestedVertical?: SupportedVertical;
  matchedVertical?: SupportedVertical;
  signals?: string[];
};

export type ValidationResult =
  | { ok: true; status: "valid"; code: "valid"; vertical: AtlasVertical; question: string; details: { signals: string[] } }
  | { ok: false; status: Exclude<ValidationStatus, "valid">; code: Exclude<ValidationCode, "valid">; vertical: string; question: string; details: ValidationDetails };

const DEVELOPMENT_SIGNALS = [
  /\b(build|develop|redevelop|construct|open|launch|set up|establish|locate|find|identify|rank|compare|assess|evaluate)\b/i,
  /\b(site|location|land|plot|property|erf|development|project|scheme|facility|premises|opportunity)\b/i,
  /\b(where|near|around|within|in)\b/i,
];
const SITE_SELECTION_SIGNALS = /\b(best\s+(site|location|area|place|spot|land)|suitable\s+(site|location|area|place)|site[- ]selection|development\s+opportunit|vacant|redevelopment|zoning|footfall|demand|competition|access|constraints?)\b/i;
const OBJECTIVE_SIGNALS = /\b(build|develop|redevelop|construct|open|launch|set up|establish|locate|find|identify|rank|compare|assess|evaluate|site|location|land|plot|property|development|project|facility|premises|best\s+(site|location|area|place|spot|land)|suitable\s+(site|location|area|place)|site[- ]selection)\b/i;
const LOCATION_SIGNAL = /\b(in|near|around|within|at|along|by)\s+[a-z][a-z .'-]{2,}/i;
const GENERIC_INFORMATION = /\b(what is|what are|who is|define|meaning of|explain|tell me about|how does|why is)\b/i;
const SEXUAL_OR_TRIVIA = /\b(pussy|porn|sex|nude|naked|xxx|celebrity|joke|trivia|recipe|lyrics|weather|news)\b/i;
const GENERIC_BRIEF = /\b(for|to)\s+(my|a|an|the)\b/i;

function matches(q: string, vertical: SupportedVertical): string[] {
  return VERTICAL_ALIASES[vertical].filter((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(q);
  });
}

function detectedVertical(q: string): { vertical: SupportedVertical; hits: string[] } | null {
  const candidates = VERTICALS.map((vertical) => ({ vertical, hits: matches(q, vertical) }))
    .filter((candidate) => candidate.hits.length > 0)
    .sort((a, b) => b.hits.reduce((n, hit) => n + hit.length, 0) - a.hits.reduce((n, hit) => n + hit.length, 0));
  return candidates[0] ?? null;
}

function exampleFor(vertical: string): string {
  const label = VERTICAL_LABELS[vertical as SupportedVertical] ?? "development";
  return `Where in Cape Town should I find a site for a ${label.toLowerCase()} development? Assess access, demand, zoning, competition, and constraints.`;
}

export function validatePrompt(vertical: string, question: string): ValidationResult {
  const q = question.trim();
  const lower = q.toLowerCase();
  const atlasVertical = isSupportedVertical(vertical) || CUSTOM_VERTICAL_RE.test(vertical);

  if (!atlasVertical) {
    return {
      ok: false,
      status: "invalid_prompt",
      code: "invalid_prompt",
      vertical,
      question: q,
      details: { reason: "Select a supported development vertical.", example: exampleFor("retail_shop") },
    };
  }

  const selected = isSupportedVertical(vertical) ? vertical : null;
  const detected = detectedVertical(lower);
  const hasObjective = OBJECTIVE_SIGNALS.test(lower);
  const hasDevelopmentSignal = DEVELOPMENT_SIGNALS.filter((signal) => signal.test(lower)).length >= 2 || SITE_SELECTION_SIGNALS.test(lower);
  const hasLocation = LOCATION_SIGNAL.test(lower);

  // Reject unrelated/general-information prompts before any model or stub path.
  if (SEXUAL_OR_TRIVIA.test(lower) || (GENERIC_INFORMATION.test(lower) && !hasDevelopmentSignal)) {
    return {
      ok: false,
      status: "invalid_prompt",
      code: "invalid_prompt",
      vertical,
      question: q,
      details: { reason: "Atlas evaluates real-estate development and site-selection briefs, not general information or unrelated questions.", example: exampleFor(vertical) },
    };
  }

  // A clear supported entity wins over missing secondary brief detail.
  if (detected && selected && detected.vertical !== selected && hasDevelopmentSignal) {
    return {
      ok: false,
      status: "vertical_mismatch",
      code: "vertical_mismatch",
      vertical,
      question: q,
      details: {
        reason: `This brief appears to describe ${VERTICAL_LABELS[detected.vertical].toLowerCase()}, not ${VERTICAL_LABELS[selected].toLowerCase()}.`,
        example: exampleFor(detected.vertical),
        suggestedVertical: detected.vertical,
        matchedVertical: detected.vertical,
        signals: detected.hits,
      },
    };
  }

  // Custom verticals are intentionally permissive, but still require a real project brief.
  if (!hasObjective || !hasLocation || (!hasDevelopmentSignal && !GENERIC_BRIEF.test(lower))) {
    return {
      ok: false,
      status: "needs_clarification",
      code: "needs_clarification",
      vertical,
      question: q,
      details: {
        reason: "Add what you want to develop or locate and where you want Atlas to look.",
        example: exampleFor(vertical),
        signals: [hasObjective ? "objective" : "missing objective", hasLocation ? "location" : "missing location"],
      },
    };
  }

  return { ok: true, status: "valid", code: "valid", vertical: vertical as AtlasVertical, question: q, details: { signals: detected?.hits ?? [] } };
}
