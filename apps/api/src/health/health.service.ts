import { Injectable, Logger } from '@nestjs/common';
import type { EmbeddingModel } from '@repo/ai';
import type { HealthResponse } from '@repo/shared';
import { InjectEmbeddingModel } from '../ai/ai.module.js';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import { SupabaseService } from '../supabase/supabase.service.js';

const DB_PING_TIMEOUT_MS = 3_000;
// A local model can take a few seconds to load into memory on its first call.
const EMBEDDING_PING_TIMEOUT_MS = 5_000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    @InjectConfig() private readonly config: AppConfig,
    @InjectEmbeddingModel() private readonly embeddingModel: EmbeddingModel,
  ) {}

  /** `deep` also calls the embedding provider, which costs a request, so it is opt-in. */
  async check(deep: boolean): Promise<HealthResponse> {
    const [dbReachable, embeddingReachable] = await Promise.all([
      this.pingDatabase(),
      deep ? this.pingEmbeddingProvider() : Promise.resolve(null),
    ]);
    const { chat, chatDisabledReason, embedding } = this.config.ai;

    return {
      // Chat is optional, so its absence does not degrade the service.
      status: dbReachable && embeddingReachable !== false ? 'ok' : 'degraded',
      db: { reachable: dbReachable },
      embedding: {
        provider: embedding.preset.name,
        model: embedding.model,
        reachable: embeddingReachable,
      },
      chat: {
        configured: chat !== null,
        provider: chat?.preset.name ?? null,
        model: chat?.model ?? null,
        reason: chatDisabledReason,
      },
    };
  }

  private async pingDatabase(): Promise<boolean> {
    const { error } = await this.supabase
      .admin()
      .rpc('embedding_dimensions')
      .abortSignal(AbortSignal.timeout(DB_PING_TIMEOUT_MS));
    if (error) this.logger.warn(`Database health check failed: ${error.message}`);
    return !error;
  }

  /** Embeds one short text: proves the provider is reachable, the key works and the model exists. */
  private async pingEmbeddingProvider(): Promise<boolean> {
    try {
      await this.embeddingModel.embed(['health check'], 'query', {
        signal: AbortSignal.timeout(EMBEDDING_PING_TIMEOUT_MS),
      });
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Embedding provider health check failed: ${reason}`);
      return false;
    }
  }
}
