import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SupabaseAuthGuard } from './auth/supabase-auth.guard.js';
import { ChatModule } from './chat/chat.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { RATE_LIMIT_OPTIONS, UserThrottlerGuard } from './common/rate-limit/rate-limit.js';
import type { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthModule } from './health/health.module.js';
import { RetrievalModule } from './retrieval/retrieval.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot(RATE_LIMIT_OPTIONS),
    SupabaseModule,
    AiModule,
    AuthModule,
    DocumentsModule,
    RetrievalModule,
    ChatModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    // Global guards run in this order: identify the caller, then rate limit per caller.
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {
  /** The entry point validates the config and hands it in, so modules never read process.env. */
  static forRoot(config: AppConfig): DynamicModule {
    return { module: AppModule, imports: [ConfigModule.forRoot(config)] };
  }
}
