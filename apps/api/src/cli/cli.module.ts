import { type DynamicModule, Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import type { AppConfig } from '../config/app-config.js';
import { ConfigModule } from '../config/config.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { SupabaseModule } from '../supabase/supabase.module.js';

/**
 * What the command-line tools need from the API, without HTTP, auth guards or chat:
 * the documents use cases and, through them, the same ingestion worker the API runs.
 * SupabaseModule brings the embedding dimensions check, so a CLI fails fast too.
 */
@Module({})
export class CliModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: CliModule,
      imports: [ConfigModule.forRoot(config), SupabaseModule, AiModule, DocumentsModule],
    };
  }
}
