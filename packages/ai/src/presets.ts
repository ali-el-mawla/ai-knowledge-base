/**
 * Known OpenAI-compatible providers. Everything provider-specific lives here as data
 * (base URL, auth, capability flags), so switching provider is a configuration change
 * and the model classes contain no `if (provider === ...)` branches.
 *
 * Capability flags are checked against each provider's own documentation; the URL
 * next to each preset is the page they come from.
 */

export interface ChatCapabilities {
  /** Name of the request field that caps output length. */
  maxTokensParam: 'max_tokens' | 'max_completion_tokens';
  /** Supported temperature range; requests are clamped into it. */
  temperatureRange: readonly [min: number, max: number];
  /** Honors stream_options.include_usage (token usage in the final stream chunk). */
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
  openai: {
    name: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_completion_tokens', temperatureRange: [0, 2], streamUsage: true },
    embeddings: { supportsDimensions: true, maxBatch: 2048 },
    docs: 'https://platform.openai.com/docs/api-reference',
  },
  anthropic: {
    name: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_tokens', temperatureRange: [0, 1], streamUsage: true },
    embeddings: null,
    docs: 'https://platform.claude.com/docs/en/api/openai-sdk',
  },
  groq: {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_completion_tokens', temperatureRange: [0, 2], streamUsage: true },
    embeddings: null,
    docs: 'https://console.groq.com/docs/openai',
  },
  together: {
    name: 'together',
    baseUrl: 'https://api.together.ai/v1',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_tokens', temperatureRange: [0, 2], streamUsage: true },
    embeddings: { supportsDimensions: false, maxBatch: 64 },
    docs: 'https://docs.together.ai/docs/openai-api-compatibility',
  },
  openrouter: {
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    chat: { maxTokensParam: 'max_tokens', temperatureRange: [0, 2], streamUsage: true },
    embeddings: null,
    docs: 'https://openrouter.ai/docs/quickstart',
  },
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
