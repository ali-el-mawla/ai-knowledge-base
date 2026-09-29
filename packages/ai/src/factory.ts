import type { ChatModelConfig, EmbeddingModelConfig } from './config.js';
import type { ClientOptions } from './openai-compatible/client.js';
import { OpenAICompatibleChatModel } from './openai-compatible/chat.js';
import { OpenAICompatibleEmbeddingModel } from './openai-compatible/embedding.js';
import type { ChatModel, EmbeddingModel } from './types.js';

/*
 * The only place that picks an implementation. Every preset speaks the OpenAI API, so
 * there is one class per capability; a provider with its own protocol would get a class
 * behind the same interface, chosen here.
 */

export function createChatModel(config: ChatModelConfig, options?: ClientOptions): ChatModel {
  return new OpenAICompatibleChatModel(config, options);
}

export function createEmbeddingModel(
  config: EmbeddingModelConfig,
  options?: ClientOptions,
): EmbeddingModel {
  return new OpenAICompatibleEmbeddingModel(config, options);
}
