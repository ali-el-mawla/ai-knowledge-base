import { Injectable } from '@nestjs/common';
import type { ChatModelConfig } from '@repo/ai';
import type { AiInfo, ModelInfo } from '@repo/shared';
import { embeddingModelKey } from '../ai/embedding-model-key.js';
import type { AuthUser } from '../auth/auth-user.js';
import { DatabaseError } from '../common/errors/app-errors.js';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import { SupabaseService } from '../supabase/supabase.service.js';

function toModelInfo(config: ChatModelConfig | null): ModelInfo | null {
  return config && { provider: config.preset.name, model: config.model };
}

@Injectable()
export class AiInfoService {
  constructor(
    private readonly supabase: SupabaseService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  /** The active models, and how many of the caller's chunks need `npm run reembed`. */
  async get(user: AuthUser): Promise<AiInfo> {
    const { chat, rewrite, embedding } = this.config.ai;
    const { count, error } = await this.supabase
      .forUser(user.accessToken)
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .neq('embedding_model', embeddingModelKey(embedding));
    if (error) throw new DatabaseError('count stale chunks', error);

    return {
      chat: toModelInfo(chat),
      rewrite: toModelInfo(rewrite),
      embedding: {
        provider: embedding.preset.name,
        model: embedding.model,
        dimensions: embedding.dimensions,
      },
      staleChunks: count ?? 0,
    };
  }
}
