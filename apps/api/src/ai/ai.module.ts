import { Global, Inject, Module } from '@nestjs/common';
import {
  type ChatModel,
  createChatModel,
  createEmbeddingModel,
  type EmbeddingModel,
} from '@repo/ai';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';

/** The embedding model (always configured: documents cannot be indexed without it). */
export const EMBEDDING_MODEL = Symbol('EMBEDDING_MODEL');
/** The chat model, or null when chat is not configured. */
export const CHAT_MODEL = Symbol('CHAT_MODEL');
/** The model that rewrites follow-up questions, or null when chat is not configured. */
export const REWRITE_MODEL = Symbol('REWRITE_MODEL');

export const InjectEmbeddingModel = (): ParameterDecorator => Inject(EMBEDDING_MODEL);
export const InjectChatModel = (): ParameterDecorator => Inject(CHAT_MODEL);
export const InjectRewriteModel = (): ParameterDecorator => Inject(REWRITE_MODEL);

export type OptionalChatModel = ChatModel | null;

/**
 * The only place that turns configuration into model clients. Everything else
 * depends on the neutral ChatModel / EmbeddingModel interfaces, so tests replace
 * these providers with fakes and a provider swap never touches feature code.
 */
@Global()
@Module({
  providers: [
    {
      provide: EMBEDDING_MODEL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): EmbeddingModel => createEmbeddingModel(config.ai.embedding),
    },
    {
      provide: CHAT_MODEL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): OptionalChatModel =>
        config.ai.chat ? createChatModel(config.ai.chat) : null,
    },
    {
      provide: REWRITE_MODEL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): OptionalChatModel =>
        config.ai.rewrite ? createChatModel(config.ai.rewrite) : null,
    },
  ],
  exports: [EMBEDDING_MODEL, CHAT_MODEL, REWRITE_MODEL],
})
export class AiModule {}
