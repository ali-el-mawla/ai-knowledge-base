import type { OpenAI } from 'openai';
import type { EmbeddingModelConfig } from '../config.js';
import { AiConfigError, AiProviderError } from '../errors.js';
import type { EmbeddingCapabilities } from '../presets.js';
import type {
  CallOptions,
  EmbeddingDescriptor,
  EmbeddingModel,
  EmbeddingPurpose,
} from '../types.js';
import { type ClientOptions, createOpenAIClient } from './client.js';
import { invalidResponse, normalizeError } from './errors.js';

/** Embeddings over the OpenAI Embeddings API; provider quirks come from the preset. */
export class OpenAICompatibleEmbeddingModel implements EmbeddingModel {
  readonly info: EmbeddingDescriptor;
  readonly #capabilities: EmbeddingCapabilities;
  readonly #client: OpenAI;

  constructor(config: EmbeddingModelConfig, options: ClientOptions = {}) {
    if (!config.preset.embeddings) {
      throw new AiConfigError(`Provider "${config.preset.name}" has no embeddings endpoint.`);
    }
    this.info = {
      provider: config.preset.name,
      model: config.model,
      dimensions: config.dimensions,
      documentPrefix: config.documentPrefix,
      queryPrefix: config.queryPrefix,
    };
    this.#capabilities = config.preset.embeddings;
    this.#client = createOpenAIClient(config.baseUrl, config.apiKey, options);
  }

  async embed(
    texts: string[],
    purpose: EmbeddingPurpose,
    options: CallOptions = {},
  ): Promise<number[][]> {
    const prefix = purpose === 'document' ? this.info.documentPrefix : this.info.queryPrefix;
    const inputs = texts.map((text) => prefix + text);
    const vectors: number[][] = [];
    // Batches run one after another: a local server embeds on one GPU anyway, and a hosted
    // one would count parallel batches against the same rate limit.
    for (let start = 0; start < inputs.length; start += this.#capabilities.maxBatch) {
      const batch = inputs.slice(start, start + this.#capabilities.maxBatch);
      vectors.push(...(await this.#embedBatch(batch, options.signal)));
    }
    return vectors;
  }

  async #embedBatch(inputs: string[], signal: AbortSignal | undefined): Promise<number[][]> {
    let response: OpenAI.CreateEmbeddingResponse;
    try {
      response = await this.#client.embeddings.create(
        {
          model: this.info.model,
          input: inputs,
          encoding_format: 'float',
          ...(this.#capabilities.supportsDimensions && { dimensions: this.info.dimensions }),
        },
        { signal },
      );
    } catch (error) {
      throw normalizeError(error, this.info.provider);
    }
    return this.#inInputOrder(response.data, inputs.length);
  }

  /** Places each vector at its `index`, checking that every input got exactly one. */
  #inInputOrder(data: OpenAI.Embedding[] | undefined, count: number): number[][] {
    const { provider } = this.info;
    if (!Array.isArray(data) || data.length !== count) {
      throw invalidResponse(provider, `expected ${count} embeddings, got ${data?.length ?? 0}`);
    }
    const vectors: number[][] = [];
    for (const { index, embedding } of data) {
      if (!Number.isInteger(index) || index < 0 || index >= count || vectors[index]) {
        throw invalidResponse(provider, `embedding index ${index} is missing or repeated`);
      }
      vectors[index] = this.#checked(embedding);
    }
    return vectors;
  }

  #checked(embedding: unknown): number[] {
    const { provider, model, dimensions } = this.info;
    if (!Array.isArray(embedding) || !embedding.every(Number.isFinite)) {
      throw invalidResponse(provider, 'an embedding is not an array of numbers');
    }
    if (embedding.length !== dimensions) {
      throw new AiProviderError(
        'invalid_response',
        `Model "${model}" returned ${embedding.length}-dimensional vectors but EMBEDDING_DIMENSIONS is ${dimensions}. ` +
          `Use an EMBEDDING_MODEL that outputs ${dimensions} dimensions (or one the provider can shorten to it), ` +
          `or change EMBEDDING_DIMENSIONS together with the database column.`,
        provider,
      );
    }
    return embedding;
  }
}
