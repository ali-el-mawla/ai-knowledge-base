export interface ModelInfo {
  provider: string;
  model: string;
}

export interface EmbeddingInfo extends ModelInfo {
  dimensions: number;
}

export interface AiInfo {
  /** Null when no chat provider is configured (documents and search still work). */
  chat: ModelInfo | null;
  rewrite: ModelInfo | null;
  embedding: EmbeddingInfo;
  /** Chunks embedded with a different model than the configured one; fix with `npm run reembed`. */
  staleChunks: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: { reachable: boolean };
  embedding: { provider: string; model: string; reachable: boolean | null };
  chat: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    reason: string | null;
  };
}
