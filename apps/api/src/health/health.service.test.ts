import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiProviderError, type CallOptions, type EmbeddingModel } from '@repo/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDING_MODEL } from '../ai/ai.module.js';
import { loadAppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { HealthService } from './health.service.js';

const config = loadAppConfig({
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  EMBEDDING_PROVIDER: 'ollama',
  EMBEDDING_MODEL: 'nomic-embed-text',
  EMBEDDING_DIMENSIONS: '768',
});

/** Answers the database ping (`rpc(...).abortSignal(...)`) without a database. */
const supabase = {
  admin: () => ({
    rpc: () => ({ abortSignal: () => Promise.resolve({ data: 768, error: null }) }),
  }),
};

const embed = vi.fn<EmbeddingModel['embed']>();
const model: EmbeddingModel = {
  info: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    dimensions: 768,
    documentPrefix: '',
    queryPrefix: '',
  },
  embed,
};

let health: HealthService;

beforeEach(async () => {
  embed.mockReset();
  const moduleRef = await Test.createTestingModule({
    providers: [
      HealthService,
      { provide: SupabaseService, useValue: supabase },
      { provide: EMBEDDING_MODEL, useValue: model },
      { provide: APP_CONFIG, useValue: config },
    ],
  }).compile();
  health = moduleRef.get(HealthService);
  Logger.overrideLogger(false);
});

describe('HealthService', () => {
  it('does not call the embedding provider unless asked to', async () => {
    const result = await health.check(false);
    expect(result).toMatchObject({ status: 'ok', embedding: { reachable: null } });
    expect(embed).not.toHaveBeenCalled();
  });

  it('deep check: embeds one query-purpose text with a timeout signal', async () => {
    embed.mockResolvedValue([new Array<number>(768).fill(0)]);
    const result = await health.check(true);

    expect(result).toMatchObject({ status: 'ok', embedding: { reachable: true } });
    const [texts, purpose, options] = embed.mock.calls[0] ?? [];
    expect(texts).toHaveLength(1);
    expect(purpose).toBe('query');
    expect((options as CallOptions | undefined)?.signal).toBeInstanceOf(AbortSignal);
  });

  it('deep check: reports an unreachable provider as degraded instead of failing', async () => {
    embed.mockRejectedValue(new AiProviderError('unavailable', 'Could not reach ollama', 'ollama'));
    const result = await health.check(true);
    expect(result).toMatchObject({ status: 'degraded', embedding: { reachable: false } });
  });
});
