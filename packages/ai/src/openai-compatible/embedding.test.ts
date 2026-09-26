import { describe, expect, it } from 'vitest';
import type { EmbeddingModelConfig } from '../config.js';
import { AiProviderError } from '../errors.js';
import { createEmbeddingModel, isAbortError } from '../index.js';
import type { EmbeddingCapabilities, ProviderPreset } from '../presets.js';
import { type CapturedRequest, fakeFetch, json } from '../testing/fake-fetch.js';

const DIMENSIONS = 3;

function config(embeddings: Partial<EmbeddingCapabilities> = {}): EmbeddingModelConfig {
  const preset: ProviderPreset = {
    name: 'test',
    baseUrl: 'http://embed.test/v1',
    requiresApiKey: false,
    chat: null,
    embeddings: { supportsDimensions: false, maxBatch: 16, ...embeddings },
    docs: '',
  };
  return {
    preset,
    baseUrl: preset.baseUrl,
    apiKey: 'not-needed',
    model: 'test-embedder',
    dimensions: DIMENSIONS,
    documentPrefix: 'search_document: ',
    queryPrefix: 'search_query: ',
  };
}

function inputsOf(request: CapturedRequest | undefined): string[] {
  return request?.body.input as string[];
}

/**
 * Answers like a real server, but lists the vectors in reverse order (the API only
 * promises `index`, not position). Each vector encodes its input's position in the call.
 */
function embeddingServer(dimensions = DIMENSIONS) {
  let seen = 0;
  return fakeFetch((request) => {
    const inputs = inputsOf(request);
    const data = inputs.map((_input, index) => ({
      object: 'embedding',
      index,
      embedding: [seen + index, ...Array<number>(dimensions - 1).fill(0.5)],
    }));
    seen += inputs.length;
    return json({ object: 'list', model: 'test-embedder', data: data.reverse() });
  });
}

describe('OpenAI-compatible embeddings', () => {
  it.each([
    ['document', 'search_document: '],
    ['query', 'search_query: '],
  ] as const)('prefixes %s inputs with %j', async (purpose, prefix) => {
    const http = embeddingServer();
    await createEmbeddingModel(config(), { fetch: http.fetch }).embed(['a', 'b'], purpose);
    expect(inputsOf(http.requests[0])).toEqual([`${prefix}a`, `${prefix}b`]);
  });

  it('posts float encoding to the configured base URL', async () => {
    const http = embeddingServer();
    await createEmbeddingModel(config(), { fetch: http.fetch }).embed(['a'], 'query');
    expect(http.requests[0]?.url).toBe('http://embed.test/v1/embeddings');
    expect(http.requests[0]?.body).toMatchObject({
      model: 'test-embedder',
      encoding_format: 'float',
    });
  });

  it('splits inputs into batches of maxBatch and returns vectors in input order', async () => {
    const http = embeddingServer();
    const model = createEmbeddingModel(config({ maxBatch: 2 }), { fetch: http.fetch });
    const vectors = await model.embed(['a', 'b', 'c', 'd', 'e'], 'document');

    expect(http.requests.map((request) => inputsOf(request).length)).toEqual([2, 2, 1]);
    expect(vectors.map((vector) => vector[0])).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns [] for no input without calling the provider', async () => {
    const http = embeddingServer();
    await expect(
      createEmbeddingModel(config(), { fetch: http.fetch }).embed([], 'document'),
    ).resolves.toEqual([]);
    expect(http.requests).toHaveLength(0);
  });

  it('sends dimensions when the preset supports them', async () => {
    const http = embeddingServer();
    await createEmbeddingModel(config({ supportsDimensions: true }), { fetch: http.fetch }).embed(
      ['a'],
      'query',
    );
    expect(http.requests[0]?.body.dimensions).toBe(DIMENSIONS);
  });

  it('leaves dimensions out when the preset does not support them', async () => {
    const http = embeddingServer();
    await createEmbeddingModel(config({ supportsDimensions: false }), { fetch: http.fetch }).embed(
      ['a'],
      'query',
    );
    expect(http.requests[0]?.body).not.toHaveProperty('dimensions');
  });

  it('rejects vectors of the wrong size and says which setting to change', async () => {
    const http = embeddingServer(1024);
    const error = await createEmbeddingModel(config(), { fetch: http.fetch })
      .embed(['a'], 'document')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ kind: 'invalid_response', provider: 'test' });
    expect((error as Error).message).toContain('returned 1024-dimensional vectors');
    expect((error as Error).message).toContain('EMBEDDING_DIMENSIONS is 3');
  });

  it.each([
    ['too few vectors', { data: [{ index: 0, embedding: [1, 2, 3] }] }],
    [
      'a repeated index',
      {
        data: [
          { index: 0, embedding: [1, 2, 3] },
          { index: 0, embedding: [1, 2, 3] },
        ],
      },
    ],
    [
      'a non-numeric vector',
      {
        data: [
          { index: 0, embedding: [1, 2, 3] },
          { index: 1, embedding: 'AAAA' },
        ],
      },
    ],
    ['no data', { object: 'list' }],
  ])('maps a response with %s to invalid_response', async (_label, body) => {
    const http = fakeFetch(() => json(body));
    await expect(
      createEmbeddingModel(config(), { fetch: http.fetch }).embed(['a', 'b'], 'document'),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('maps an unknown model (404) to bad_request with the provider message', async () => {
    const http = fakeFetch(() =>
      json({ error: { message: 'model "nomic" not found, try pulling it first' } }, 404),
    );
    await expect(
      createEmbeddingModel(config(), { fetch: http.fetch }).embed(['a'], 'query'),
    ).rejects.toMatchObject({ kind: 'bad_request', status: 404, message: /try pulling it/ });
  });

  it('propagates an abort unchanged', async () => {
    const http = embeddingServer();
    const controller = new AbortController();
    controller.abort();
    const error = await createEmbeddingModel(config(), { fetch: http.fetch })
      .embed(['a'], 'query', { signal: controller.signal })
      .catch((caught: unknown) => caught);
    expect(isAbortError(error)).toBe(true);
  });

  it('describes itself with the configured model, size and prefixes', () => {
    const model = createEmbeddingModel(config());
    expect(model.info).toEqual({
      provider: 'test',
      model: 'test-embedder',
      dimensions: DIMENSIONS,
      documentPrefix: 'search_document: ',
      queryPrefix: 'search_query: ',
    });
  });
});
