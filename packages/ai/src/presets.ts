/**
 * Known OpenAI-compatible providers. Everything provider-specific lives here as data
 * (base URL, auth, capability flags), so switching provider is a configuration change
 * and the model classes contain no `if (provider === ...)` branches.
 *
 * Capability flags were checked against each provider's documentation on 26 Sep 2026;
 * the comment above each preset cites the pages and names any value the docs leave open.
 */

export interface ChatCapabilities {
  /** Name of the request field that caps output length. */
  maxTokensParam: 'max_tokens' | 'max_completion_tokens';
  /** Supported temperature range; requests are clamped into it. */
  temperatureRange: readonly [min: number, max: number];
  /**
   * Send `stream_options.include_usage` to get token usage in the last stream chunk.
   * False when the provider does not document it or sends usage without being asked;
   * usage is read from the stream whenever it arrives.
   */
  streamUsage: boolean;
}

export interface EmbeddingCapabilities {
  /** Accepts the `dimensions` request field (Matryoshka / shortened embeddings). */
  supportsDimensions: boolean;
  /** Maximum number of inputs per embeddings request. */
  maxBatch: number;
}

export interface ProviderPreset {
  name: string;
  baseUrl: string;
  /** False for local servers (Ollama) that ignore the key. */
  requiresApiKey: boolean;
  /** Null when the provider has no chat completions endpoint. */
  chat: ChatCapabilities | null;
  /** Null when the provider has no embeddings endpoint. */
  embeddings: EmbeddingCapabilities | null;
  docs: string;
}

export const PROVIDER_PRESETS = {
  // https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
  // https://developers.openai.com/api/reference/resources/embeddings/methods/create
  // max_tokens is deprecated. Embeddings take up to 2048 inputs but at most 300,000 tokens
  // per request, so batches stay at 256 chunks to remain under the token cap.
  openai: {
    name: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_completion_tokens', temperatureRange: [0, 2], streamUsage: true },
    embeddings: { supportsDimensions: true, maxBatch: 256 },
    docs: 'https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create',
  },
  // https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
  // Both token fields are supported; temperature above 1 is capped at 1. No embeddings.
  anthropic: {
    name: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_tokens', temperatureRange: [0, 1], streamUsage: true },
    embeddings: null,
    docs: 'https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk',
  },
  // https://console.groq.com/docs/api-reference and https://console.groq.com/docs/models
  // max_tokens is deprecated; no embedding model is offered.
  groq: {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_completion_tokens', temperatureRange: [0, 2], streamUsage: true },
    embeddings: null,
    docs: 'https://console.groq.com/docs/api-reference',
  },
  // https://docs.together.ai/docs/openai-api-compatibility
  // https://docs.together.ai/reference/chat-completions-1 (temperature "from 0-1",
  // no stream_options) and https://docs.together.ai/reference/embeddings-2 (no dimensions).
  // Usage arrives in a final chunk unasked. The embeddings batch limit is not documented:
  // 64 is our conservative choice.
  together: {
    name: 'together',
    baseUrl: 'https://api.together.ai/v1',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_tokens', temperatureRange: [0, 1], streamUsage: false },
    embeddings: { supportsDimensions: false, maxBatch: 64 },
    docs: 'https://docs.together.ai/docs/openai-api-compatibility',
  },
  // https://openrouter.ai/openapi.json (max_tokens "deprecated, use max_completion_tokens";
  // /embeddings with dimensions), https://openrouter.ai/docs/api_reference/embeddings and
  // https://openrouter.ai/docs/cookbook/administration/usage-accounting (usage is always in
  // the final chunk; stream_options has no effect). The batch limit is not documented: 64
  // is our conservative choice, and dimensions only work if the routed model supports them.
  openrouter: {
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_completion_tokens', temperatureRange: [0, 2], streamUsage: false },
    embeddings: { supportsDimensions: true, maxBatch: 64 },
    docs: 'https://openrouter.ai/docs/api_reference/embeddings',
  },
  // https://docs.ollama.com/api/openai-compatibility (max_tokens, stream_options with
  // include_usage, and dimensions on /v1/embeddings are listed as supported). The docs give
  // no temperature range or batch limit: [0, 2] follows the OpenAI spec, 64 is ours.
  // 127.0.0.1 rather than localhost: on some Windows machines localhost adds seconds per call.
  ollama: {
    name: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    requiresApiKey: false,
    chat: { maxTokensParam: 'max_tokens', temperatureRange: [0, 2], streamUsage: true },
    embeddings: { supportsDimensions: true, maxBatch: 64 },
    docs: 'https://docs.ollama.com/api/openai-compatibility',
  },
} as const satisfies Record<string, ProviderPreset>;

export type PresetName = keyof typeof PROVIDER_PRESETS;

/**
 * Used when *_PROVIDER=custom: any server that speaks the OpenAI API, reached by
 * *_BASE_URL. Conservative flags; override nothing else.
 */
export const CUSTOM_PRESET: ProviderPreset = {
  name: 'custom',
  baseUrl: '',
  requiresApiKey: false,
  chat: { maxTokensParam: 'max_tokens', temperatureRange: [0, 1], streamUsage: false },
  embeddings: { supportsDimensions: false, maxBatch: 16 },
  docs: 'https://platform.openai.com/docs/api-reference',
};

export function getPreset(name: string): ProviderPreset | undefined {
  if (name === 'custom') return CUSTOM_PRESET;
  return (PROVIDER_PRESETS as Record<string, ProviderPreset>)[name];
}

export const PRESET_NAMES = [...Object.keys(PROVIDER_PRESETS), 'custom'] as const;
