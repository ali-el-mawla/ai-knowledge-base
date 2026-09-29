import { APIUserAbortError, type OpenAI } from 'openai';
import type { ChatModelConfig } from '../config.js';
import { AiConfigError } from '../errors.js';
import type { ChatCapabilities } from '../presets.js';
import type {
  CallOptions,
  ChatCompletion,
  ChatModel,
  ChatRequest,
  ChatStreamPart,
  FinishReason,
  ModelDescriptor,
  TokenUsage,
} from '../types.js';
import { type ClientOptions, createOpenAIClient } from './client.js';
import { invalidResponse, normalizeError } from './errors.js';

type RequestParams = Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, 'stream'>;

/** Chat over the OpenAI Chat Completions API; provider quirks come from the preset. */
export class OpenAICompatibleChatModel implements ChatModel {
  readonly info: ModelDescriptor;
  readonly #capabilities: ChatCapabilities;
  readonly #client: OpenAI;
  readonly #defaultTemperature: number | null;

  constructor(config: ChatModelConfig, options: ClientOptions = {}) {
    if (!config.preset.chat) {
      throw new AiConfigError(`Provider "${config.preset.name}" has no chat completions endpoint.`);
    }
    this.info = { provider: config.preset.name, model: config.model };
    this.#capabilities = config.preset.chat;
    this.#defaultTemperature = config.temperature ?? null;
    this.#client = createOpenAIClient(config.baseUrl, config.apiKey, options);
  }

  async complete(request: ChatRequest, options: CallOptions = {}): Promise<ChatCompletion> {
    let response: OpenAI.ChatCompletion;
    try {
      response = await this.#client.chat.completions.create(
        { ...this.#params(request), stream: false },
        { signal: options.signal },
      );
    } catch (error) {
      throw normalizeError(error, this.info.provider);
    }
    const choice = response.choices?.[0];
    const text = choice?.message?.content;
    if (typeof text !== 'string') {
      throw invalidResponse(this.info.provider, 'the completion has no message content');
    }
    return {
      text,
      usage: toUsage(response.usage),
      finishReason: toFinishReason(choice?.finish_reason),
    };
  }

  async *stream(request: ChatRequest, options: CallOptions = {}): AsyncGenerator<ChatStreamPart> {
    let usage: TokenUsage | null = null;
    let finishReason: FinishReason | null = null;
    try {
      const chunks = await this.#client.chat.completions.create(
        {
          ...this.#params(request),
          stream: true,
          ...(this.#capabilities.streamUsage && { stream_options: { include_usage: true } }),
        },
        { signal: options.signal },
      );
      for await (const chunk of chunks) {
        // With include_usage the last chunk carries the usage and an empty choices array.
        const choice = chunk.choices?.[0];
        const text = choice?.delta?.content;
        if (text) yield { type: 'delta', text };
        if (choice?.finish_reason) finishReason = toFinishReason(choice.finish_reason);
        usage = toUsage(chunk.usage) ?? usage;
      }
    } catch (error) {
      throw normalizeError(error, this.info.provider);
    }
    // When the signal fires mid-stream the SDK ends the iteration quietly. Raise the same
    // abort error a cancelled request raises, so a Stop never looks like a finished answer.
    if (options.signal?.aborted) throw new APIUserAbortError();
    // A stream cut off by the network also ends quietly; without a finish reason the text
    // may be truncated, so it must not be stored as a complete answer.
    if (!finishReason) {
      throw invalidResponse(this.info.provider, 'the stream ended without a finish reason');
    }
    if (usage) yield { type: 'usage', usage };
    yield { type: 'finish', reason: finishReason };
  }

  #params(request: ChatRequest): RequestParams {
    const { maxTokensParam, temperatureRange } = this.#capabilities;
    const params: RequestParams = {
      model: this.info.model,
      messages: request.messages.map(({ role, content }): OpenAI.ChatCompletionMessageParam => ({
        role,
        content,
      })),
    };
    params[maxTokensParam] = request.maxTokens;
    // Omitted unless the request or the configuration sets it: some models reject it.
    const temperature = request.temperature ?? this.#defaultTemperature;
    if (temperature !== null) {
      const [min, max] = temperatureRange;
      params.temperature = Math.min(Math.max(temperature, min), max);
    }
    return params;
  }
}

function toUsage(usage: OpenAI.CompletionUsage | null | undefined): TokenUsage | null {
  if (typeof usage?.prompt_tokens !== 'number' || typeof usage.completion_tokens !== 'number') {
    return null;
  }
  return { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
}

function toFinishReason(reason: string | null | undefined): FinishReason {
  return reason === 'stop' || reason === 'length' ? reason : 'other';
}
