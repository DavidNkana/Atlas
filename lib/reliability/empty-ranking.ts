export const CONFIDENCE_THRESHOLD = 0.6;

export type ReliabilitySite = { confidence?: number; _catalogSupplement?: boolean };

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
  const average =
    modelSites.reduce((sum, site) => sum + (site.confidence ?? 0), 0) /
    modelSites.length;
  if (average >= CONFIDENCE_THRESHOLD) return undefined;
  return `AI confidence is low (average ${average.toFixed(2)}; verification recommended before acting).`;
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
