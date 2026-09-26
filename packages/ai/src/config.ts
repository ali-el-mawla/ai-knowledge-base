import { AiConfigError } from './errors.js';
import { getPreset, PRESET_NAMES, type ProviderPreset } from './presets.js';

/** Everything needed to build one chat model client. */
export interface ChatModelConfig {
  preset: ProviderPreset;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface EmbeddingModelConfig {
  preset: ProviderPreset;
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  documentPrefix: string;
  queryPrefix: string;
}

export interface AiConfig {
  /** Null when chat is not configured; `chatDisabledReason` says why. */
  chat: ChatModelConfig | null;
  /** Model for rewriting follow-up questions; defaults to the chat model. */
  rewrite: ChatModelConfig | null;
  chatDisabledReason: string | null;
  embedding: EmbeddingModelConfig;
}

type Env = Record<string, string | undefined>;

const PLACEHOLDER_KEY = 'not-needed';

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function resolvePreset(env: Env, variable: string): ProviderPreset {
  const name = read(env, variable);
  if (!name)
    throw new AiConfigError(`${variable} is not set. Use one of: ${PRESET_NAMES.join(', ')}.`);
  const preset = getPreset(name);
  if (!preset) {
    throw new AiConfigError(
      `${variable}="${name}" is unknown. Use one of: ${PRESET_NAMES.join(', ')}.`,
    );
  }
  return preset;
}

function resolveBaseUrl(env: Env, variable: string, preset: ProviderPreset): string {
  const baseUrl = read(env, variable) ?? preset.baseUrl;
  if (!baseUrl) throw new AiConfigError(`${variable} is required when the provider is "custom".`);
  return baseUrl;
}

/**
 * Reads the AI configuration from environment variables.
 *
 * Embeddings are required (documents cannot be indexed without them), so their
 * problems throw. Chat is optional: without it the API still stores, indexes and
 * searches documents, and the chat endpoint answers 503 with the reason.
 */
export function loadAiConfig(env: Env): AiConfig {
  return { ...loadChatConfig(env), embedding: loadEmbeddingConfig(env) };
}

function loadChatConfig(env: Env): Pick<AiConfig, 'chat' | 'rewrite' | 'chatDisabledReason'> {
  if (!read(env, 'CHAT_PROVIDER')) {
    return { chat: null, rewrite: null, chatDisabledReason: 'CHAT_PROVIDER is not set' };
  }
  const preset = resolvePreset(env, 'CHAT_PROVIDER');
  if (!preset.chat) {
    throw new AiConfigError(`Provider "${preset.name}" has no chat completions endpoint.`);
  }
  const model = read(env, 'CHAT_MODEL');
  if (!model) throw new AiConfigError('CHAT_MODEL is not set.');
  const apiKey = read(env, 'CHAT_API_KEY');
  if (!apiKey && preset.requiresApiKey) {
    return {
      chat: null,
      rewrite: null,
      chatDisabledReason: `CHAT_API_KEY is not set for "${preset.name}"`,
    };
  }
  const chat: ChatModelConfig = {
    preset,
    baseUrl: resolveBaseUrl(env, 'CHAT_BASE_URL', preset),
    apiKey: apiKey ?? PLACEHOLDER_KEY,
    model,
  };
  const rewriteModel = read(env, 'REWRITE_MODEL');
  return {
    chat,
    rewrite: rewriteModel ? { ...chat, model: rewriteModel } : chat,
    chatDisabledReason: null,
  };
}

function loadEmbeddingConfig(env: Env): EmbeddingModelConfig {
  const preset = resolvePreset(env, 'EMBEDDING_PROVIDER');
  if (!preset.embeddings) {
    throw new AiConfigError(
      `Provider "${preset.name}" has no embeddings endpoint. Use ollama, openai, together or custom for EMBEDDING_PROVIDER.`,
    );
  }
  const model = read(env, 'EMBEDDING_MODEL');
  if (!model) throw new AiConfigError('EMBEDDING_MODEL is not set.');
  const dimensions = Number(read(env, 'EMBEDDING_DIMENSIONS'));
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new AiConfigError(
      'EMBEDDING_DIMENSIONS must be a positive integer (the database column uses 768).',
    );
  }
  const apiKey = read(env, 'EMBEDDING_API_KEY');
  if (!apiKey && preset.requiresApiKey) {
    throw new AiConfigError(`EMBEDDING_API_KEY is not set for "${preset.name}".`);
  }
  return {
    preset,
    baseUrl: resolveBaseUrl(env, 'EMBEDDING_BASE_URL', preset),
    apiKey: apiKey ?? PLACEHOLDER_KEY,
    model,
    dimensions,
    // Prefixes keep their trailing space, so they are read raw (not trimmed).
    documentPrefix: env.EMBEDDING_DOCUMENT_PREFIX ?? '',
    queryPrefix: env.EMBEDDING_QUERY_PREFIX ?? '',
  };
}
