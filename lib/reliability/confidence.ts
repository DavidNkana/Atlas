/** Confidence dimensions kept separate so evidence cannot inflate model trust. */
export type EvidenceSignal = {
  source?: string;
  provenance?: string;
  value?: number;
};

export function coverageMultiplierForSources(distinctSources: number): number {
  if (distinctSources === 0) return 0.4;
  if (distinctSources <= 2) return 0.65;
  if (distinctSources <= 4) return 0.75;
  if (distinctSources <= 7) return 0.85;
  return 1;
}

/** Count only usable connector evidence; synthetic catalog hints are not evidence. */
export function evidenceCoverage(
  signals: EvidenceSignal[],
  attemptedConnectorCount: number,
): number {
  if (attemptedConnectorCount <= 0) return 0;
  const usableSources = new Set(
    signals
      .filter((signal) => signal.provenance !== "Synthetic/Heuristic")
      .filter((signal) => signal.source)
      .map((signal) => signal.source),
  );
  return Math.min(1, usableSources.size / attemptedConnectorCount);
}
