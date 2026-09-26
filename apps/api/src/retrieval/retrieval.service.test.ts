import { AiProviderError, type EmbeddingModel } from '@repo/ai';
import type { RetrievalMode } from '@repo/shared';
import { describe, expect, it, vi } from 'vitest';
import { abortError, FakeEmbeddingModel } from '../../test/support/fake-models.js';
import type { AuthUser } from '../auth/auth-user.js';
import { DatabaseError, EmbeddingUnavailableError } from '../common/errors/app-errors.js';
import type { AppConfig } from '../config/app-config.js';
import type { SupabaseService } from '../supabase/supabase.service.js';
import { RETRIEVAL } from './retrieval.constants.js';
import { type HybridSearchRow, RetrievalService } from './retrieval.service.js';

const user: AuthUser = { id: 'user-1', email: 'a@example.test', accessToken: 'token-abc' };

function row(overrides: Partial<HybridSearchRow>): HybridSearchRow {
  return {
    chunk_id: 'chunk-a',
    document_id: 'doc-1',
    document_title: 'Handbook',
    heading_path: 'Leave > Vacation',
    content: 'Full-time staff get 25 days.',
    semantic_rank: 1,
    keyword_rank: 2,
    fused_score: 1 / 61 + 1 / 62,
    ...overrides,
  };
}

interface RpcResult {
  data: HybridSearchRow[] | null;
  error: { message: string } | null;
}

function setup(result: RpcResult = { data: [], error: null }) {
  const rpc = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>()
    .mockResolvedValue(result);
  const forUser = vi.fn(() => ({ rpc }));
  const embeddings = new FakeEmbeddingModel(() => [0.25, -0.5, 1]);
  const config = {
    ai: { embedding: { model: 'nomic-embed-text', dimensions: 3 } },
  } as unknown as AppConfig;
  const service = new RetrievalService(
    { forUser } as unknown as SupabaseService,
    embeddings as EmbeddingModel,
    config,
  );
  return { service, rpc, forUser, embeddings };
}

describe('RetrievalService.search', () => {
  it('embeds the question as a query and runs hybrid_search as the user', async () => {
    const { service, rpc, forUser, embeddings } = setup();
    await service.search(user, 'vacation days', { mode: 'hybrid', limit: 6 });

    expect(embeddings.calls).toEqual([{ texts: ['vacation days'], purpose: 'query' }]);
    expect(forUser).toHaveBeenCalledWith('token-abc');
    expect(rpc).toHaveBeenCalledWith('hybrid_search', {
      query_text: 'vacation days',
      query_embedding: '[0.25,-0.5,1]',
      query_embedding_model: 'nomic-embed-text',
      match_count: 6,
      semantic_weight: 1,
      full_text_weight: 1,
      rrf_k: 60,
      candidate_count: 30,
    });
  });

  it('keeps its tuning constants where the README and the eval expect them', () => {
    expect(RETRIEVAL).toEqual({ chatSources: 6, rrfK: 60, candidatesPerArm: 30 });
  });

  it.each<[RetrievalMode, number, number]>([
    ['hybrid', 1, 1],
    ['vector', 1, 0],
    ['keyword', 0, 1],
  ])('weights the arms for %s mode (semantic %d, keyword %d)', async (mode, semantic, fullText) => {
    const { service, rpc } = setup();
    await service.search(user, 'q', { mode, limit: 3 });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      semantic_weight: semantic,
      full_text_weight: fullText,
      match_count: 3,
    });
  });

  it('does not call the embedding model in keyword mode', async () => {
    const { service, rpc, embeddings } = setup();
    embeddings.error = new AiProviderError('unavailable', 'ollama is down', 'ollama');
    await service.search(user, 'RF-2291', { mode: 'keyword', limit: 6 });
    expect(embeddings.calls).toEqual([]);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ query_embedding: '[0,0,0]' });
  });

  it('numbers the sources 1..n in rank order and keeps a missing rank as null', async () => {
    const { service } = setup({
      data: [
        row({ chunk_id: 'a', semantic_rank: 1, keyword_rank: null, fused_score: 0.02 }),
        row({ chunk_id: 'b', semantic_rank: null, keyword_rank: 1, fused_score: 0.01 }),
      ],
      error: null,
    });
    const sources = await service.search(user, 'q', { mode: 'hybrid', limit: 6 });
    expect(sources).toEqual([
      {
        index: 1,
        chunkId: 'a',
        documentId: 'doc-1',
        documentTitle: 'Handbook',
        headingPath: 'Leave > Vacation',
        content: 'Full-time staff get 25 days.',
        score: { fused: 0.02, semanticRank: 1, keywordRank: null },
      },
      expect.objectContaining({
        index: 2,
        chunkId: 'b',
        score: { fused: 0.01, semanticRank: null, keywordRank: 1 },
      }),
    ]);
  });

  it('turns an embedding provider failure into EMBEDDING_UNAVAILABLE (503)', async () => {
    const { service, rpc, embeddings } = setup();
    embeddings.error = new AiProviderError('unavailable', 'ollama is down', 'ollama');
    const failure = service.search(user, 'q', { mode: 'hybrid', limit: 6 });
    await expect(failure).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    await expect(failure).rejects.toMatchObject({ status: 503, code: 'EMBEDDING_UNAVAILABLE' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lets an abort through unchanged: the caller left, the provider is fine', async () => {
    const { service, embeddings } = setup();
    const aborted = abortError();
    embeddings.error = aborted;
    await expect(service.search(user, 'q', { mode: 'vector', limit: 6 })).rejects.toBe(aborted);
  });

  it('reports a database failure as an internal error', async () => {
    const { service } = setup({ data: null, error: { message: 'boom' } });
    await expect(service.search(user, 'q', { mode: 'hybrid', limit: 6 })).rejects.toBeInstanceOf(
      DatabaseError,
    );
  });
});
