export const CONFIDENCE_THRESHOLD = 0.6;

export type ReliabilitySite = {
  confidence?: number;
  modelConfidence?: number;
  evidenceCoverage?: number;
  _catalogSupplement?: boolean;
};

/**
 * Keep a valid ranking intact. Confidence is a signal for the UI and for
 * downstream scoring, not a provider-validity check. A low-confidence AI
 * answer still contains useful model output and must not be replaced by the
 * curated demo.
 */
export function applyConfidenceGate<T extends ReliabilitySite>(sites: T[]): T[] {
  return sites;
}

/** Return an additive warning for a real, non-empty ranking when confidence is low. */
export function confidenceWarningForSites(
  sites: ReliabilitySite[],
): string | undefined {
  const modelSites = sites.filter((site) => !site._catalogSupplement);
  if (modelSites.length === 0) return undefined;
  const modelAverage =
    modelSites.reduce((sum, site) => sum + (site.modelConfidence ?? site.confidence ?? 0), 0) /
    modelSites.length;
  const coverageValues = modelSites.filter((site) => site.evidenceCoverage != null);
  const coverageAverage = coverageValues.length > 0
    ? coverageValues.reduce((sum, site) => sum + (site.evidenceCoverage ?? 0), 0) / coverageValues.length
    : undefined;
  if (modelAverage < CONFIDENCE_THRESHOLD) {
    return `AI reasoning confidence is low (average ${modelAverage.toFixed(2)}); evidence coverage and verification are limited. This valid AI result was not replaced.`;
  }
  if (coverageAverage != null && coverageAverage < CONFIDENCE_THRESHOLD) {
    return `AI reasoning is separate from evidence: coverage is limited (average ${(coverageAverage * 100).toFixed(0)}%). Verify unknown criteria before acting.`;
  }
  return undefined;
}

/** Empty rankings must be explicitly unavailable/partial, never ordinary success. */
export function hasLabeledEmptyRanking(response: {
  ranked_sites?: unknown;
  status?: unknown;
  model?: { modelError?: unknown };
  unavailableReason?: unknown;
}): boolean {
  if (!Array.isArray(response.ranked_sites) || response.ranked_sites.length > 0) return true;
  const status = String(response.status ?? "");
  return (status === "unavailable" || status === "partial_timeout") &&
    (typeof response.unavailableReason === "string" ||
      typeof response.model?.modelError === "string");
}
