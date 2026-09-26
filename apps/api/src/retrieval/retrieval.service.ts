import { Injectable } from '@nestjs/common';
import { AiProviderError, type EmbeddingModel } from '@repo/ai';
import type { RetrievalMode, Source } from '@repo/shared';
import { InjectEmbeddingModel } from '../ai/ai.module.js';
import { embeddingModelKey } from '../ai/embedding-model-key.js';
import type { AuthUser } from '../auth/auth-user.js';
import { DatabaseError, EmbeddingUnavailableError } from '../common/errors/app-errors.js';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import type { Database } from '../database.types.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { MODE_WEIGHTS, RETRIEVAL } from './retrieval.constants.js';

export interface SearchOptions {
  mode: RetrievalMode;
  limit: number;
  /** Cancels the query embedding call, e.g. when the chat client disconnects. */
  signal?: AbortSignal;
}

type GeneratedRow = Database['public']['Functions']['hybrid_search']['Returns'][number];

/**
 * One row of `hybrid_search`. The generated types miss that a rank is null when only
 * the other arm found the chunk, so both ranks are widened here.
 */
export type HybridSearchRow = Omit<GeneratedRow, 'semantic_rank' | 'keyword_rank'> & {
  semantic_rank: number | null;
  keyword_rank: number | null;
};

/** A row in rank order becomes a `Source`; its 1-based position is the [n] the model cites. */
export function toSource(row: HybridSearchRow, index: number): Source {
  return {
    index,
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    headingPath: row.heading_path,
    content: row.content,
    score: {
      fused: row.fused_score,
      semanticRank: row.semantic_rank ?? null,
      keywordRank: row.keyword_rank ?? null,
    },
  };
}

/**
 * Hybrid retrieval over the caller's own chunks: vector similarity and full-text search,
 * fused with Reciprocal Rank Fusion inside Postgres (`hybrid_search`). The query runs
 * through the user's client, so Row Level Security, not a WHERE clause written here,
 * keeps other users' chunks out of the results.
 */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly supabase: SupabaseService,
    @InjectEmbeddingModel() private readonly embeddings: EmbeddingModel,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async search(user: AuthUser, query: string, options: SearchOptions): Promise<Source[]> {
    const weights = MODE_WEIGHTS[options.mode];
    // Keyword-only search needs no embedding (its vector arm is switched off in SQL), so it
    // skips the call and keeps working while the embedding provider is down.
    const embedding =
      weights.semantic > 0
        ? await this.embedQuery(query, options.signal)
        : new Array<number>(this.config.ai.embedding.dimensions).fill(0);

    const { data, error } = await this.supabase.forUser(user.accessToken).rpc('hybrid_search', {
      query_text: query,
      // pgvector's text input format is the JSON array syntax: "[0.1,0.2,...]".
      query_embedding: JSON.stringify(embedding),
      // Only vectors from the configured model are comparable with this query vector.
      query_embedding_model: embeddingModelKey(this.config.ai.embedding),
      match_count: options.limit,
      semantic_weight: weights.semantic,
      full_text_weight: weights.fullText,
      rrf_k: RETRIEVAL.rrfK,
      candidate_count: RETRIEVAL.candidatesPerArm,
    });
    if (error) throw new DatabaseError('hybrid search', error);
    return data.map((row, position) => toSource(row, position + 1));
  }

  /** The query vector, embedded with the model's query prefix (e.g. "search_query: "). */
  private async embedQuery(query: string, signal?: AbortSignal): Promise<number[]> {
    let vectors: number[][];
    try {
      vectors = await this.embeddings.embed([query], 'query', { signal });
    } catch (error) {
      // An abort (the caller left) is never an AiProviderError, so it passes through unchanged.
      if (error instanceof AiProviderError) throw EmbeddingUnavailableError.from(error);
      throw error;
    }
    const [vector] = vectors;
    if (!vector) {
      throw EmbeddingUnavailableError.from(
        new AiProviderError(
          'invalid_response',
          'The embedding model returned no vector for the query.',
          this.embeddings.info.provider,
        ),
      );
    }
    return vector;
  }
}
