/** Source metadata is deliberately centralized so the UI never guesses from labels. */
export type SignalProvenance = "Live" | "Static" | "Curated" | "Synthetic/Heuristic";

export type SourceMetadata = {
  provenance: SignalProvenance;
  vintage?: string;
};

const SOURCE_METADATA: Record<string, SourceMetadata> = {
  overpass: { provenance: "Live" },
  google_places: { provenance: "Live" },
  i_traffic: { provenance: "Live" },
  tomtom_places: { provenance: "Live" },
  tomtom_traffic: { provenance: "Live" },
  real_estate_listings: { provenance: "Live" },
  stats_sa: { provenance: "Static", vintage: "Stats SA Census 2022" },
  sa_zoning: { provenance: "Static", vintage: "Metro zoning snapshot" },
  sa_traffic: { provenance: "Curated", vintage: "SANRAL/provincial published counts" },
  building_density: { provenance: "Curated", vintage: "Pre-computed OSM building dataset" },
  schools: { provenance: "Live" },
  transit: { provenance: "Live" },
  healthcare: { provenance: "Live" },
  roads: { provenance: "Live" },
  competitors: { provenance: "Live" },
  env_constraints: { provenance: "Live" },
};

export function metadataForSource(source: string): SourceMetadata {
  return SOURCE_METADATA[source] ?? { provenance: "Synthetic/Heuristic" };
}
