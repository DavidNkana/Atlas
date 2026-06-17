import type { Model, ModelRequest, ModelResponse, RankedSite, Vertical } from './types';

const STUB_RESPONSES: Record<Vertical, RankedSite[]> = {
  gas_station: [
    { rank: 1, name: 'Sandton City precinct', score: 0.87, confidence: 0.74, rationale: 'High-density office corridor with strong weekday traffic; existing fuel stations at capacity. [curated stub]' },
    { rank: 2, name: 'Rosebank Mall area', score: 0.81, confidence: 0.71, rationale: 'Mixed retail and Gautrain feeder traffic; recent commercial uplift. [curated stub]' },
    { rank: 3, name: 'Midrand N1 corridor', score: 0.78, confidence: 0.69, rationale: 'Logistics and commuter traffic on the N1 highway. [curated stub]' },
    { rank: 4, name: 'Fourways Crossing', score: 0.74, confidence: 0.66, rationale: 'Growing residential catchment with limited in-fill fuel supply. [curated stub]' },
    { rank: 5, name: 'Randburg CBD', score: 0.69, confidence: 0.62, rationale: 'Under-served relative to through-traffic density. [curated stub]' },
  ],
  restaurant: [
    { rank: 1, name: 'Maboneng Precinct', score: 0.84, confidence: 0.72, rationale: 'High foot traffic, cultural anchor, evening economy momentum. [curated stub]' },
    { rank: 2, name: 'Parkhurst 4th Avenue', score: 0.79, confidence: 0.69, rationale: 'Established dining destination with daytime office catchment. [curated stub]' },
    { rank: 3, name: 'Centurion Mall area', score: 0.74, confidence: 0.66, rationale: 'Affluent residential feeder with limited premium casual dining. [curated stub]' },
    { rank: 4, name: 'Melrose Arch', score: 0.71, confidence: 0.64, rationale: 'High-income commercial anchor with strong evening spend. [curated stub]' },
    { rank: 5, name: 'Norwood', score: 0.67, confidence: 0.60, rationale: 'Up-and-coming dining strip with reasonable rents. [curated stub]' },
  ],
  warehouse: [
    { rank: 1, name: 'Pomona AH (Kempton Park)', score: 0.86, confidence: 0.74, rationale: 'Direct OR Tambo airport access; established logistics cluster. [curated stub]' },
    { rank: 2, name: 'Lanseria airport corridor', score: 0.81, confidence: 0.71, rationale: 'Growing freight and last-mile catchment. [curated stub]' },
    { rank: 3, name: 'Midrand (Allandale)', score: 0.78, confidence: 0.68, rationale: 'N1 highway centrality with mixed industrial zoning. [curated stub]' },
    { rank: 4, name: 'Germiston', score: 0.72, confidence: 0.65, rationale: 'Lower land cost; established rail linkage. [curated stub]' },
    { rank: 5, name: 'Pretoria (Silvertondale)', score: 0.68, confidence: 0.62, rationale: 'Northern corridor growth with cheaper land. [curated stub]' },
  ],
  retail_shop: [
    { rank: 1, name: 'Melrose Arch precinct', score: 0.85, confidence: 0.73, rationale: 'High-income foot traffic with strong anchor tenants. [curated stub]' },
    { rank: 2, name: 'Sandton City extension', score: 0.81, confidence: 0.70, rationale: 'Premium retail density; significant captive spend. [curated stub]' },
    { rank: 3, name: 'Rosebank Mall', score: 0.77, confidence: 0.67, rationale: 'Tourist + commuter traffic mix. [curated stub]' },
    { rank: 4, name: 'Centurion', score: 0.72, confidence: 0.64, rationale: 'Affluent residential catchment with growth. [curated stub]' },
    { rank: 5, name: 'Bedford Centre', score: 0.68, confidence: 0.61, rationale: 'Eastern suburbs anchor with stable foot traffic. [curated stub]' },
  ],
};

export const curatedStub: Model = {
  info: {
    id: 'curated-stub',
    displayName: 'Curated stub (no API)',
    provider: 'stub',
    free: true,
    description: 'Hand-crafted demonstration response. Works without any API key.',
  },
  isAvailable: () => true,
  call: async (req: ModelRequest): Promise<ModelResponse> => {
    const sites = STUB_RESPONSES[req.vertical] || STUB_RESPONSES.gas_station;
    return { ranked_sites: sites, raw: 'stub' };
  },
};