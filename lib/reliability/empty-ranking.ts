export const CONFIDENCE_THRESHOLD = 0.6;

export type ReliabilitySite = { confidence?: number; _catalogSupplement?: boolean };

/** Preserve the existing gate semantics, including catalog exclusions. */
export function applyConfidenceGate<T extends ReliabilitySite>(sites: T[]): T[] {
  const modelSites = sites.filter((site) => !site._catalogSupplement);
  if (modelSites.length === 0) return sites;
  const average = modelSites.reduce((sum, site) => sum + (site.confidence ?? 0), 0) / modelSites.length;
  return average < CONFIDENCE_THRESHOLD ? [] : sites;
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
