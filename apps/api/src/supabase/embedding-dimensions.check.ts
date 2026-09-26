import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import { SupabaseService } from './supabase.service.js';

/** The database schema and the configuration disagree; the app must not start. */
export class SchemaMismatchError extends Error {
  override readonly name = 'SchemaMismatchError';
}

/**
 * Fails startup when EMBEDDING_DIMENSIONS differs from the `document_chunks.embedding`
 * column. Without this guard the mismatch would surface later as failed ingestion jobs
 * or empty search results, far from its cause.
 */
@Injectable()
export class EmbeddingDimensionsCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmbeddingDimensionsCheck.name);

  constructor(
    private readonly supabase: SupabaseService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const configured = this.config.ai.embedding.dimensions;
    const { data: column, error } = await this.supabase.admin().rpc('embedding_dimensions');
    if (error) {
      throw new SchemaMismatchError(
        `Could not read the embedding column size from ${this.config.supabase.url} (${error.message}). ` +
          'Is the database running (npm run db:start) and migrated (npm run db:migrate)?',
        { cause: error },
      );
    }
    if (column !== configured) {
      throw new SchemaMismatchError(
        `EMBEDDING_DIMENSIONS is ${configured} but document_chunks.embedding is vector(${column}). ` +
          `Either set EMBEDDING_DIMENSIONS=${column} (with a model that produces ${column}-dimension vectors), ` +
          `or add a migration that changes the column to vector(${configured}); then run npm run reembed.`,
      );
    }
    this.logger.log(`Embedding column matches the configuration (${column} dimensions)`);
  }
}
