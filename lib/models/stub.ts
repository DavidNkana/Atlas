import type { Model, ModelRequest, ModelResponse, RankedSite, Vertical } from './types';

const STUB_RESPONSES: Record<Vertical, RankedSite[]> = {
  gas_station: [
    { rank: 1, name: 'Great East Road, East Park Mall Area', score: 0.95, confidence: 0.9, rationale: 'High daily traffic volumes; main artery connecting the CBD to the airport and affluent residential zones. [curated stub]', lat: -15.3875, lng: 28.3228 },
    { rank: 2, name: 'Kafue Road, Makeni Area', score: 0.92, confidence: 0.88, rationale: 'Critical southern transit corridor with high volumes of local commuters and heavy freight. [curated stub]', lat: -15.4082, lng: 28.2866 },
    { rank: 3, name: 'Leopards Hill Road, New Kasama', score: 0.87, confidence: 0.85, rationale: 'Rapidly growing high-income residential area with high vehicle ownership but sparse fuel options. [curated stub]', lat: -15.3691, lng: 28.3514 },
    { rank: 4, name: 'Lumumba Road, Industrial Area', score: 0.84, confidence: 0.8, rationale: 'Highly active industrial artery with steady B2B fueling demand from commercial fleets. [curated stub]', lat: -15.4102, lng: 28.3175 },
    { rank: 5, name: 'Great North Road, Kabangwe', score: 0.81, confidence: 0.82, rationale: 'Primary route to the Copperbelt province; captures long-distance travelers and northern commuter traffic. [curated stub]', lat: -15.3589, lng: 28.2645 },
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
    return { ok: true, ranked_sites: sites, raw: 'stub' };
  },
};