import { Injectable, Logger } from '@nestjs/common';
import type { HealthResponse } from '@repo/shared';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import { SupabaseService } from '../supabase/supabase.service.js';

const DB_PING_TIMEOUT_MS = 3_000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    @InjectConfig() private readonly config: AppConfig,
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

  /**
   * TODO(ingestion): embed one short text with the configured EmbeddingModel and return
   * whether the provider answered (false on AiProviderError). Until the embedding client
   * exists this returns null, which the response reports as "not checked".
   */
  private pingEmbeddingProvider(): Promise<boolean | null> {
    return Promise.resolve(null);
  }
}
