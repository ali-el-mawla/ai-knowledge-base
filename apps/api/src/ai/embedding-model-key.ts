import type { EmbeddingModelConfig } from '@repo/ai';

/**
 * The value stored in `document_chunks.embedding_model`. Ingestion writes it,
 * `hybrid_search` filters on it and `/ai/info` counts chunks that differ as stale, so all
 * three must use this function.
 */
export function embeddingModelKey(embedding: Pick<EmbeddingModelConfig, 'model'>): string {
  return embedding.model;
}
