import type { EmbeddingModelConfig } from '@repo/ai';

/**
 * The value stored in `document_chunks.embedding_model` for vectors made with this
 * configuration. Ingestion writes it, retrieval filters on it (`hybrid_search`) and
 * `/ai/info` counts chunks that differ from it as stale, so all three must use this
 * one function.
 */
export function embeddingModelKey(embedding: Pick<EmbeddingModelConfig, 'model'>): string {
  return embedding.model;
}
