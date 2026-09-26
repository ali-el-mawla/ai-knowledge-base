/**
 * The application talks to language models only through these interfaces.
 * They use neutral types (no OpenAI SDK types leak out), so an implementation
 * for a non-OpenAI-compatible API could be added without touching callers.
 */

export interface ModelDescriptor {
  /** Preset name, e.g. "anthropic", "ollama", or "custom" for a bare base URL. */
  provider: string;
  model: string;
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Upper bound on generated tokens. */
  maxTokens: number;
  /** 0 to 1; clamped to the provider's supported range. */
  temperature?: number;
}

export interface CallOptions {
  /** Aborts the upstream HTTP request, e.g. when the user presses Stop. */
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export type FinishReason = 'stop' | 'length' | 'other';

export interface ChatCompletion {
  text: string;
  usage: TokenUsage | null;
  finishReason: FinishReason;
}

/** Streamed pieces of one completion, in order: deltas, then optional usage, then finish. */
export type ChatStreamPart =
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason };

export interface ChatModel {
  readonly info: ModelDescriptor;
  complete(request: ChatRequest, options?: CallOptions): Promise<ChatCompletion>;
  stream(request: ChatRequest, options?: CallOptions): AsyncIterable<ChatStreamPart>;
}

/**
 * Many embedding models are trained with different inputs for stored passages and
 * for search queries (nomic-embed-text needs "search_document: " / "search_query: "
 * prefixes). Callers say which one they are embedding; the model applies the rule.
 */
export type EmbeddingPurpose = 'document' | 'query';

export interface EmbeddingDescriptor extends ModelDescriptor {
  dimensions: number;
  documentPrefix: string;
  queryPrefix: string;
}

export interface EmbeddingModel {
  readonly info: EmbeddingDescriptor;
  /** One vector per input text, same order, each of length `info.dimensions`. */
  embed(texts: string[], purpose: EmbeddingPurpose, options?: CallOptions): Promise<number[][]>;
}
