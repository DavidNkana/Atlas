export type Vertical = 'gas_station' | 'restaurant' | 'warehouse' | 'retail_shop';

export interface RankedSite {
  rank: number;
  name: string;
  score: number;
  confidence: number;
  rationale: string;
}

export interface ModelRequest {
  vertical: Vertical;
  question: string;
}

export interface ModelResponse {
  ranked_sites: RankedSite[];
  raw?: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: 'google' | 'openai' | 'openrouter' | 'stub';
  free: boolean;
  description: string;
}

export interface Model {
  info: ModelInfo;
  isAvailable: () => boolean;
  call: (req: ModelRequest) => Promise<ModelResponse>;
}