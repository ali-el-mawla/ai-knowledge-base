import { Global, Module } from '@nestjs/common';
import { EmbeddingDimensionsCheck } from './embedding-dimensions.check.js';
import { SupabaseService } from './supabase.service.js';

@Global()
@Module({
  providers: [SupabaseService, EmbeddingDimensionsCheck],
  exports: [SupabaseService],
})
export class SupabaseModule {}
